const IMAGE_MENU_ID = "use-image-in-dishfind";
const TEXT_MENU_ID = "use-text-in-dishfind";

function processTextSelection(selectedText) {
  return chrome.storage.local.set({
    selectedText,
    selectedImageUrl: "",
    recipeResponse: null
  }).then(() => {
    const clientReady = globalThis.geminiClientReady;
    if (!clientReady) {
      throw new Error("Gemini text detection did not initialize. Check the service worker console.");
    }
    return clientReady.then((detectDishFromText) => {
      if (typeof detectDishFromText !== "function") {
        throw new Error("Gemini text detection failed to load. Check config.js and the service worker console.");
      }
      return detectDishFromText(selectedText);
    });
  }).then((result) => chrome.storage.local.set({ recipeResponse: result })
    .then(() => result))
    .catch((error) => {
      console.error("Could not process the selected text:", error);
      const recipeResponse = {
        ok: false,
        error: {
          code: "client_unavailable",
          message: error.message || "Could not process the selected text."
        }
      };
      return chrome.storage.local.set({ recipeResponse })
        .then(() => recipeResponse);
    });
}

// Rebuild the image and text context-menu options after installation or update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("Could not reset Cooks' context menu:", chrome.runtime.lastError.message);
      return;
    }
 
    chrome.contextMenus.create(
      {
        id: IMAGE_MENU_ID,
        title: "Use image in Cooks",
        contexts: ["image"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create Cooks' context menu:", chrome.runtime.lastError.message);
        }
      }
    );
 
    chrome.contextMenus.create(
      {
        id: TEXT_MENU_ID,
        title: "Use selected text in Cooks",
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create Cooks' text menu:", chrome.runtime.lastError.message);
        }
      }
    );
  });
});

// Process selected text directly; forward image selections through the content script.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== IMAGE_MENU_ID && info.menuItemId !== TEXT_MENU_ID) {
    return;
  }
 
  if (!tab || typeof tab.windowId !== "number") {
    console.error("Could not determine which browser window to open Cooks in.");
    return;
  }
 
  let selectionType;
  let fallbackText;
  let fallbackImageUrl;
  if (info.menuItemId === IMAGE_MENU_ID) {
    if (!info.srcUrl) {
      return;
    }
 
    let imageUrl;
    try {
      imageUrl = new URL(info.srcUrl);
    } catch (error) {
      console.error("The selected image URL is invalid:", error);
      return;
    }
 
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
      console.error("Cooks can only use images with HTTP or HTTPS URLs.");
      return;
    }
 
    selectionType = "image";
    fallbackImageUrl = imageUrl.href;
  } else {
    fallbackText = info.selectionText?.trim();
    if (!fallbackText) {
      return;
    }
 
    selectionType = "text";
    processTextSelection(fallbackText)
      .then(() => chrome.action.openPopup({ windowId: tab.windowId }))
      .catch((error) => {
        console.error("Could not save the selected text or open the recipe popup:", error);
      });
    return;
  }
 
  if (typeof tab.id !== "number") {
    console.error("Could not determine which tab sent the selection.");
    return;
  }
 
  const readImageDetails = selectionType === "image"
    ? chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        args: [fallbackImageUrl],
        func: (imageUrl) => {
          const normalizeUrl = (value) => {
            try {
              return new URL(value, document.baseURI).href;
            } catch {
              return null;
            }
          };
          const selectedUrl = normalizeUrl(imageUrl);
          const image = Array.from(document.images).find((candidate) =>
            normalizeUrl(candidate.currentSrc || candidate.src) === selectedUrl ||
            normalizeUrl(candidate.src) === selectedUrl
          );

          return image
            ? {
                altText: image.alt || "",
                imageWidth: image.naturalWidth,
                imageHeight: image.naturalHeight
              }
            : null;
        }
      }).then((results) => results[0]?.result || null)
    : Promise.resolve(null);

  readImageDetails
    .then((imageDetails) => chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      files: ["render-recipe.js", "shadow-card.js", "lookup.js"]
    }).then(() => chrome.tabs.sendMessage(tab.id, {
      type: "COOKS_SHOW_LOOKUP",
      payload: {
        selectionType,
        fallbackText,
        fallbackImageUrl,
        fallbackImageDetails: imageDetails
      }
    }, { frameId: info.frameId ?? 0 })))
    .catch((error) => {
      console.error(
        "Could not show the Cooks card. This page may not allow extension scripts:",
        error
      );
    });
});
 
// Process text/image selections with Gemini
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return;
  }

  if (
    message?.type === "COOKS_SIGN_IN" ||
    message?.type === "COOKS_GET_CURRENT_USER" ||
    message?.type === "COOKS_SIGN_OUT"
  ) {
    if (sender.tab) {
      sendResponse({
        type: "COOKS_USER_SESSION_RESULT",
        error: { message: "User session actions are only available to extension pages." }
      });
      return;
    }

    const session = globalThis.userSession;
    if (!session) {
      sendResponse({
        type: "COOKS_USER_SESSION_RESULT",
        error: { message: "The user session service is unavailable." }
      });
      return;
    }

    let operation;
    if (message.type === "COOKS_SIGN_IN") {
      operation = session.signIn(message.payload?.profile)
        .then((profile) => ({ profile }));
    } else if (message.type === "COOKS_GET_CURRENT_USER") {
      operation = session.getCurrentUser().then((userId) => ({ userId }));
    } else {
      operation = session.signOut().then(() => ({}));
    }

    operation.then((payload) => {
      sendResponse({ type: "COOKS_USER_SESSION_RESULT", payload });
    }).catch((error) => {
      console.error("Could not complete the user session request:", error);
      sendResponse({
        type: "COOKS_USER_SESSION_RESULT",
        error: { message: error.message || "The user session request failed." }
      });
    });
    return true;
  }

  if (!sender.tab) {
    return;
  }
 
  if (message?.type === "COOKS_SELECTION_ERROR") {
    const { selectionType, selectionValue, message: errorMessage } = message.payload || {};
    if (
      (selectionType !== "text" && selectionType !== "image") ||
      typeof errorMessage !== "string" ||
      !errorMessage
    ) {
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "The selection could not be processed." }
      });
      return;
    }
 
    const recipeResponse = {
      ok: false,
      error: {
        code: "selection_error",
        message: errorMessage
      }
    };
    const savedSelection = selectionType === "text"
      ? { selectedText: typeof selectionValue === "string" ? selectionValue : "", selectedImageUrl: "" }
      : { selectedImageUrl: typeof selectionValue === "string" ? selectionValue : "", selectedText: "" };
 
    chrome.storage.local.set({ ...savedSelection, recipeResponse })
      .then(() => sendResponse({
        type: "COOKS_ERROR",
        payload: recipeResponse
      }))
      .catch((error) => {
        console.error("Could not save the selection processing error:", error);
        sendResponse({
          type: "COOKS_ERROR",
          payload: { message: "Could not save the selection processing error." }
        });
      });
    return true;
  }
 
  if (message?.type === "IDENTIFY_DISH_FROM_TEXT") {
    const text = message.payload?.text;
    if (typeof text !== "string" || !text.trim()) {
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "The text selection is empty." }
      });
      return;
    }
 
    const selectedText = text.trim();
    processTextSelection(selectedText)
    .then((result) => {
      sendResponse({
        type: "COOKS_RECIPE_RESULT",
        payload: result
      });
    }).catch((error) => {
      console.error("Could not save the selected-text error:", error);
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "Could not process the selection or save its error." }
      });
    });
    return true;
  }
 
  if (message?.type === "IDENTIFY_DISH_FROM_IMAGE") {
    const {
      imageUrl,
      altText,
      pageUrl,
      imageWidth,
      imageHeight
    } = message.payload || {};
    if (typeof imageUrl !== "string" || !imageUrl) {
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "The image URL is missing." }
      });
      return;
    }
 
    const dimensions = validateImageDimensions(imageWidth, imageHeight);
    if (!dimensions.valid) {
      const recipeResponse = {
        ok: false,
        error: {
          code: "invalid_image_size",
          message: dimensions.message
        }
      };
      chrome.storage.local.set({
        selectedImageUrl: imageUrl,
        selectedText: "",
        recipeResponse
      }).then(() => sendResponse({
        type: "COOKS_ERROR",
        payload: recipeResponse
      })).catch((error) => {
        console.error("Could not save the image validation error:", error);
        sendResponse({
          type: "COOKS_ERROR",
          payload: { message: "The image is too large or its dimensions could not be checked." }
        });
      });
      return true;
    }

    const recipeResponse = {
      ok: false,
      error: {
        code: "image_not_supported",
        message: "The image was captured, but image identification is not implemented in the Gemini client yet."
      }
    };
    chrome.storage.local.set({
      selectedImageUrl: imageUrl,
      selectedText: "",
      recipeResponse
    }).then(() => {
      sendResponse({
        type: "COOKS_SELECTION_RECEIVED",
        payload: recipeResponse
      });
    }).catch((error) => {
      console.error("Could not save the selected image:", error);
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "Could not save the selected image." }
      });
    });
    return true;
  }
});
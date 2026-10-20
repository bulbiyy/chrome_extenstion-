const IMAGE_MENU_ID = "use-image-in-dishfind";
const TEXT_MENU_ID = "use-text-in-dishfind";

// Rebuild the image and text context-menu options after installation or update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("Could not reset DishFind's context menu:", chrome.runtime.lastError.message);
      return;
    }

    chrome.contextMenus.create(
      {
        id: IMAGE_MENU_ID,
        title: "Use image in DishFind",
        contexts: ["image"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create DishFind's context menu:", chrome.runtime.lastError.message);
        }
      }
    );

    chrome.contextMenus.create(
      {
        id: TEXT_MENU_ID,
        title: "Use selected text in DishFind",
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create DishFind's text menu:", chrome.runtime.lastError.message);
        }
      }
    );
  });
});

// Forward the selected page content through the content script, then open the tester popup.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== IMAGE_MENU_ID && info.menuItemId !== TEXT_MENU_ID) {
    return;
  }

  if (!tab || typeof tab.windowId !== "number") {
    console.error("Could not determine which browser window to open DishFind in.");
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
      console.error("DishFind can only use images with HTTP or HTTPS URLs.");
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
  }

  if (typeof tab.id !== "number") {
    console.error("Could not determine which tab sent the selection.");
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  })
    .then(() => chrome.tabs.sendMessage(tab.id, {
      type: "COOKS_CAPTURE_SELECTION",
      payload: { selectionType, fallbackText, fallbackImageUrl }
    }))
    .then(() => chrome.action.openPopup({ windowId: tab.windowId }))
    .catch((error) => {
      console.error(
        "Could not inject the content script or send the selection. This page may not allow extension scripts:",
        error
      );
    });
});

// Process text selections with Gemini; keep image selections available to the popup tester.
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
    chrome.storage.local.set({
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
    .then((result) => {
      sendResponse({
        type: "COOKS_RECIPE_RESULT",
        payload: result
      });
    }).catch((error) => {
      console.error("Could not process the selected text:", error);
      const recipeResponse = {
        ok: false,
        error: {
          code: "client_unavailable",
          message: error.message || "Could not process the selected text."
        }
      };
      chrome.storage.local.set({ recipeResponse })
        .then(() => sendResponse({
          type: "COOKS_ERROR",
          payload: recipeResponse
        }))
        .catch((storageError) => {
          console.error("Could not save the text-processing error:", storageError);
          sendResponse({
            type: "COOKS_ERROR",
            payload: { message: "Could not process the selection or save its error." }
          });
        });
    });
    return true;
  }

  if (message?.type === "IDENTIFY_DISH_FROM_IMAGE") {
    const { imageUrl, altText, pageUrl } = message.payload || {};
    if (typeof imageUrl !== "string" || !imageUrl) {
      sendResponse({
        type: "COOKS_ERROR",
        payload: { message: "The image URL is missing." }
      });
      return;
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

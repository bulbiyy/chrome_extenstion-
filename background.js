import { validateImageDimensions } from "./src/shared/imageValidation.js";

const IMAGE_MENU_ID = "use-image-in-cooks";
const TEXT_MENU_ID = "use-text-in-cooks";
 
// fixed the bug with double window
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
 
// images duplicated in the cooks pop-up card
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
  }
 
  if (typeof tab.id !== "number") {
    console.error("Could not determine which tab sent the selection.");
    return;
  }
 
  // fixing overlaping
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["render-recipe.js", "shadow-card.js", "lookup.js"]
  })
    .then(() => chrome.tabs.sendMessage(tab.id, {
      type: "COOKS_SHOW_LOOKUP",
      payload: { selectionType, fallbackText, fallbackImageUrl }
    }))
    .catch((error) => {
      console.error(
        "Could not show the Cooks card. This page may not allow extension scripts:",
        error
      );
    });
});
 
// Process text/image selections with Gemini
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) {
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
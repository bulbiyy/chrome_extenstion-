(() => {
if (globalThis.__cooksContentScriptLoaded) {
  return;
}
globalThis.__cooksContentScriptLoaded = true;

let contextImage = null;

// Remember the image under the pointer when the user opens the context menu.
document.addEventListener("contextmenu", (event) => {
  const target = event.target;
  contextImage = target instanceof HTMLImageElement
    ? {
        imageUrl: target.currentSrc || target.src,
        altText: target.alt || ""
      }
    : null;
}, true);

// Package highlighted text and its source page for the background handler.
function createTextRequestPackage(text) {
  return {
    type: "IDENTIFY_DISH_FROM_TEXT",
    payload: {
      text: text.trim(),
      pageUrl: window.location.href
    }
  };
}

// Package the selected image URL, optional alt text, and source page.
function createImageRequestPackage(imageUrl, altText = "") {
  return {
    type: "IDENTIFY_DISH_FROM_IMAGE",
    payload: {
      imageUrl,
      altText,
      pageUrl: window.location.href
    }
  };
}

// Choose the relevant selection, build its request package, and send it to background.
function sendSelectionPackage(message) {
  const { selectionType, fallbackText, fallbackImageUrl } = message.payload || {};
  let requestPackage;
  const maxDishLength = 256; // Arbitrary; should be changed to what is considered reasonable

  if (selectionType === "text") {
    const selectedText = window.getSelection()?.toString().trim() || fallbackText?.trim();
    if (!selectedText) {
      throw new Error("No selected text was available.");
    }
    else if(length(selectedText) > maxDishLength) {
      throw new Error("Selected text is too long.");
    }
    requestPackage = createTextRequestPackage(selectedText);
  } else if (selectionType === "image") {
    const imageUrl = contextImage?.imageUrl || fallbackImageUrl;
    if (!imageUrl) {
      throw new Error("No selected image URL was available.");
    }
    requestPackage = createImageRequestPackage(
      imageUrl,
      contextImage?.altText || ""
    );
  } else {
    throw new Error("Unsupported selection type.");
  }

  return chrome.runtime.sendMessage(requestPackage);
}

// Relay the background response into the page context.
function returnResponseToPage(response) {
  window.postMessage(
    {
      source: "cooks-extension",
      type: "COOKS_RESPONSE",
      payload: response
    },
    window.location.origin
  );
}

// Handle selection-capture requests sent by the background service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COOKS_CAPTURE_SELECTION") {
    return;
  }

  sendSelectionPackage(message)
    .then((response) => {
      returnResponseToPage(response);
      sendResponse(response);
    })
    .catch((error) => {
      const response = {
        type: "COOKS_ERROR",
        payload: { message: error.message }
      };
      returnResponseToPage(response);
      sendResponse(response);
    });

  return true;
});
})();

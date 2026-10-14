(() => {
if (globalThis.__cooksContentScriptLoaded) {
  return;
}
globalThis.__cooksContentScriptLoaded = true;

let contextImage = null;

document.addEventListener("contextmenu", (event) => {
  const target = event.target;
  contextImage = target instanceof HTMLImageElement
    ? {
        imageUrl: target.currentSrc || target.src,
        altText: target.alt || ""
      }
    : null;
}, true);

function createTextRequestPackage(text) {
  return {
    type: "IDENTIFY_DISH_FROM_TEXT",
    payload: {
      text: text.trim(),
      pageUrl: window.location.href
    }
  };
}

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

function sendSelectionPackage(message) {
  const { selectionType, fallbackText, fallbackImageUrl } = message.payload || {};
  let requestPackage;

  if (selectionType === "text") {
    const selectedText = window.getSelection()?.toString().trim() || fallbackText?.trim();
    if (!selectedText) {
      throw new Error("No selected text was available.");
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

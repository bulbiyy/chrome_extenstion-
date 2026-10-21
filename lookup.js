// file to make right click button in the list to call the extension
 
(() => {
  if (globalThis.__cooksLookupLoaded) return;
  globalThis.__cooksLookupLoaded = true;
 
  const MAX_TEXT_LENGTH = 1000; 
  let lookupId = 0; 
 
  // error messages
  function describeError(result) {
    const error = result?.error || {};
    if (error.code === "image_not_supported") {
      return "Image recognition isn't available yet. Try highlighting the dish name instead.";
    }
    const message =
      error.message || result?.message || "The recipe request could not be completed.";
    const details = [
      error.code,
      Number.isInteger(error.status) ? `HTTP ${error.status}` : null
    ].filter(Boolean);
    return details.length ? `${message} (${details.join(", ")})` : message;
  }
 
  // card.open() replaces any card already on screen, so only one is ever visible.
  async function ask(request, openOptions) {
    const card = globalThis.__cooksCard;
    if (!card) return;
 
    const id = ++lookupId;
    card.open(null, openOptions);
 
    let response;
    try {
      response = await chrome.runtime.sendMessage(request);
    } catch (error) {
      if (id === lookupId && card.isOpen()) {
        card.setStatus("Could not reach Cooks. Reload this page and try again.");
      }
      return;
    }
 
    if (id !== lookupId || !card.isOpen()) return; 
 
    const result = response?.payload;
    if (response?.type === "COOKS_RECIPE_RESULT" && result?.ok) {
      card.update(result.data); // shows the recipe
    } else {
      card.setStatus(describeError(result));
    }
  }
 
  function runLookup(text) {
    if (text.length > MAX_TEXT_LENGTH) {
      globalThis.__cooksCard?.open(null, {
        title: "Selection too long",
        status: "Highlight just the dish name and try again."
      });
      return;
    }
    return ask(
      {
        type: "IDENTIFY_DISH_FROM_TEXT",
        payload: { text, pageUrl: window.location.href }
      },
      { title: text, status: "Finding a recipe…" }
    );
  }
 
  function runImageLookup(imageUrl, imageDetails) {
    return ask(
      {
        type: "IDENTIFY_DISH_FROM_IMAGE",
        payload: {
          imageUrl,
          altText: imageDetails?.altText || "",
          imageWidth: imageDetails?.imageWidth,
          imageHeight: imageDetails?.imageHeight,
          pageUrl: window.location.href
        }
      },
      { imageUrl, title: "Selected image", status: "Looking at this image…" }
    );
  }
 
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "COOKS_SHOW_LOOKUP") return;
    const {
      selectionType,
      fallbackText,
      fallbackImageUrl,
      fallbackImageDetails
    } = message.payload || {};
 
    if (selectionType === "image") {
      if (fallbackImageUrl) runImageLookup(fallbackImageUrl, fallbackImageDetails);
      return;
    }
 
    const text = window.getSelection()?.toString().trim() || fallbackText?.trim();
    if (text) runLookup(text);
  });
})();
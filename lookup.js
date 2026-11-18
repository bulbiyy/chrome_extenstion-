// Context-menu recipe lookup
 
(() => {
  if (globalThis.__cooksLookupLoaded) return;
  globalThis.__cooksLookupLoaded = true;
 
  const MAX_TEXT_LENGTH = 1000; 
  let lookupId = 0; 
 
  // Format lookup errors
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
 
  // Open one lookup card at a time
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
        card.showMessage("Could not reach Cooks. Reload this page and try again.");
      }
      return;
    }
 
    if (id !== lookupId || !card.isOpen()) return; 
 
    const result = response?.payload;
    if (response?.type === "COOKS_RECIPE_RESULT" && result?.ok) {
      card.update(result.data);
    } else {
      card.showMessage(describeError(result));
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
      {
        imageUrl: findImageNearSelection(),
        imageLabel: "RELATED IMAGE",
        title: text,
        status: "Finding a recipe…",
        loading: true
      }
    );
  }

  function findImageNearSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";

    const range = selection.getRangeAt(0);
    const textRect = range.getBoundingClientRect();
    if (!textRect.width && !textRect.height) return "";

    const textX = textRect.left + textRect.width / 2;
    const textY = textRect.top + textRect.height / 2;
    let closestImage = null;
    let closestDistance = Infinity;

    for (const image of document.images) {
      const rect = image.getBoundingClientRect();
      if (
        !image.complete ||
        !image.naturalWidth ||
        rect.width < 48 ||
        rect.height < 48 ||
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= window.innerHeight ||
        rect.left >= window.innerWidth
      ) {
        continue;
      }

      const dx = Math.max(rect.left - textX, 0, textX - rect.right);
      const dy = Math.max(rect.top - textY, 0, textY - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestImage = image;
      }
    }

    return closestImage?.currentSrc || closestImage?.src || "";
  }
 
  function runImageLookup(imageUrl, imageDetails, imagePermissionGranted) {
    return ask(
      {
        type: "IDENTIFY_DISH_FROM_IMAGE",
        payload: {
          imageUrl,
          altText: imageDetails?.altText || "",
          imageWidth: imageDetails?.imageWidth,
          imageHeight: imageDetails?.imageHeight,
          pageUrl: window.location.href,
          imagePermissionGranted
        }
      },
      { imageUrl, title: "Selected image", status: "Looking at this image…", loading: true }
    );
  }
 
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "COOKS_SHOW_LOOKUP") return;
    const {
      selectionType,
      fallbackText,
      fallbackImageUrl,
      fallbackImageDetails,
      imagePermissionGranted
    } = message.payload || {};

    if (selectionType === "image") {
      if (fallbackImageUrl) {
        runImageLookup(fallbackImageUrl, fallbackImageDetails, imagePermissionGranted);
      }
      return;
    }
 
    const text = window.getSelection()?.toString().trim() || fallbackText?.trim();
    if (text) runLookup(text);
  });
})();

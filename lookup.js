// PBI 13 (right-click version): when the user picks "Use selected text in
// DishFind" from the right-click menu, background.js injects this file and sends
// COOKS_SHOW_LOOKUP. We open the Shadow DOM card in a loading state, ask the
// background worker (Gemini) about the text, then show the answer in the card.
// Injected on demand together with render-recipe.js and shadow-card.js.

(() => {
  if (globalThis.__cooksLookupLoaded) return;
  globalThis.__cooksLookupLoaded = true;

  const MAX_TEXT_LENGTH = 1000; // same limit as content.js
  let lookupId = 0; // lets us ignore answers that arrive after the card was closed/replaced

  // Build a readable message from the background's error shapes.
  function describeError(result) {
    const error = result?.error || {};
    const message =
      error.message || result?.message || "The recipe request could not be completed.";
    const details = [
      error.code,
      Number.isInteger(error.status) ? `HTTP ${error.status}` : null
    ].filter(Boolean);
    return details.length ? `${message} (${details.join(", ")})` : message;
  }

  async function runLookup(text) {
    const card = globalThis.__cooksCard;
    if (!card) return;

    if (text.length > MAX_TEXT_LENGTH) {
      card.open(null, {
        title: "Selection too long",
        status: "Highlight just the dish name and try again."
      });
      return;
    }

    const id = ++lookupId;
    card.open(null, { title: text, status: "Finding a recipe…" });

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "IDENTIFY_DISH_FROM_TEXT",
        payload: { text, pageUrl: window.location.href }
      });
    } catch (error) {
      // Usually "Extension context invalidated" after the extension was reloaded.
      if (id === lookupId && card.isOpen()) {
        card.setStatus("Could not reach Cooks. Reload this page and try again.");
      }
      return;
    }

    if (id !== lookupId || !card.isOpen()) return; // closed or replaced meanwhile

    const result = response?.payload;
    if (response?.type === "COOKS_RECIPE_RESULT" && result?.ok) {
      card.update(result.data); // shows the recipe, or "not identified as a dish"
    } else {
      card.setStatus(describeError(result));
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "COOKS_SHOW_LOOKUP") return;
    // Prefer the live selection; fall back to the text Chrome gave the menu
    // (covers selections made inside iframes).
    const text =
      window.getSelection()?.toString().trim() ||
      message.payload?.fallbackText?.trim();
    if (text) runLookup(text);
  });
})();

import "./background.js";

globalThis.geminiClientReady = import("./src/background/geminiClient.js")
  .then(({ detectDishFromText }) => {
    return detectDishFromText;
  })
  .catch((error) => {
    console.error(
      "Gemini text detection failed to initialize. Check config.js and the service worker console.",
      error
    );
    return null;
  });

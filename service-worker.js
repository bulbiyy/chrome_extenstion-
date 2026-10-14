import "./background.js";

import("./src/background/geminiClient.js")
  .then(({ detectDishFromText }) => {
    globalThis.detectDishFromText = detectDishFromText;
  })
  .catch((error) => {
    console.error(
      "Gemini text detection is unavailable. Add config.js from config.example.js to enable it.",
      error
    );
  });

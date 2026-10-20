import { GEMINI_API_KEY } from "./config.js";
import { createGeminiClient } from "./src/background/geminiClient.js";
import "./background.js";

globalThis.geminiClientReady = Promise.resolve(
  createGeminiClient({ apiKey: GEMINI_API_KEY }),
);
globalThis.detectDishFromText = (selectedText) =>
  globalThis.geminiClientReady.then((detect) => detect(selectedText));

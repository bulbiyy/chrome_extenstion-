import { GEMINI_API_KEY } from "./config.js";
import { createGeminiClient } from "./src/background/geminiClient.js";
import { createUserSession } from "./src/background/userSession.js";
import "./background.js";

globalThis.geminiClientReady = Promise.resolve(
  createGeminiClient({ apiKey: GEMINI_API_KEY }),
);
globalThis.userSession = createUserSession(chrome.storage.local);
globalThis.detectDishFromText = (selectedText) =>
  globalThis.geminiClientReady.then((detect) => detect(selectedText));

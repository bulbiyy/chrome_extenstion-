import { detectDishFromText } from "./src/background/geminiClient.js";
import "./background.js";

globalThis.geminiClientReady = Promise.resolve(detectDishFromText);

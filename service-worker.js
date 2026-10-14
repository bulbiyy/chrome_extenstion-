import "./background.js";
import { detectDishFromText } from "./src/background/geminiClient.js";

globalThis.detectDishFromText = detectDishFromText;

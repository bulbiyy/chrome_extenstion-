import { detectDishFromText } from "./src/background/geminiClient.js";
import { createIdentityClient } from "./src/background/identityClient.js";

globalThis.detectDishFromText = detectDishFromText;
globalThis.identityClient = createIdentityClient();
globalThis.signInWithGoogle = () => globalThis.identityClient.signIn();

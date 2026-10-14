# Info for PBI 4 (complete)

This branch combines the PBI 1 Chrome popup skeleton with the PBI 4 Gemini
text input and API response component.

The background client exports `detectDishFromText(selectedText)`. When a text selection is chosen from the context menu, `content.js` packages it and sends it to the service worker. `background.js` calls the Gemini client, stores the result, and replies through the content script. The popup tester reads the stored result and displays the dish name, ingredients, and steps.

Image selections are captured and displayed by the popup, but the Gemini client currently supports text only. Image identification needs a separate multimodal request implementation.

The client uses gemini-2.5-flash (https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) and the Gemini [generateContent API] (https://ai.google.dev/api/generate-content).

1. Create a Gemini API key in Google AI Studio.
2. Copy config.example.js to config.js in the project root.
3. Replace YOUR_GEMINI_API_KEY in config.js with your key.

(config.js is gitignored. Do not commit it.)

4. Open chrome://extensions and enable Developer mode.
5. Select Load unpacked and choose this project folder.
6. On the Cooks extension card, open the service worker's Inspect console if you want to test the Gemini client directly.
7. Run these examples in that console:

   // await detectDishFromText("sushi");
   // Expected output: { ok: true, data: { isDish: true, ... } }

   // await detectDishFromText("hello world");
   // Expected output: { ok: true, data: { isDish: false, dishName: null, recipe: null, ... } }

   // await detectDishFromText("");
   // Expected output: { ok: false, error: { code: "bad_input", ... } }

To verify the API error path, temporarily replace the key in config.js with an invalid value, reload the extension, and call await detectDishFromText("pad thai"). A non-2xx API response returns { ok: false, error: { code: "api_error", status: <HTTP status>, ... } }.Restore the valid key and reload afterward.

The client has a 15-second request timeout. It never logs the API key or the
selected text, and returns custom results for:
- invalid input
- network errors
- timeouts
- HTTP errors
- unusable Gemini responses

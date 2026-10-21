# Info for PBI 4 (complete)

This branch combines the PBI 1 Chrome popup skeleton with the PBI 4 Gemini
text input and API response component.

The background client exports `detectDishFromText(selectedText)`. When a text selection is chosen from the context menu, `content.js` packages it and sends it to the service worker. `background.js` calls the Gemini client, stores the result, and replies through the content script. The popup tester reads the stored result and displays the dish name, ingredients, and steps.

Image selections are captured and displayed by the popup, but the Gemini client currently supports text only. Image identification needs a separate multimodal request implementation.

For image selections, the background reads the clicked image element's intrinsic dimensions in the frame where it was clicked and includes its width, height, and alt text in the request package. It rejects images whose dimensions cannot be verified, exceed 8,192 pixels on either side, or exceed 40 megapixels total. This validates pixel dimensions only; the current package sends an image URL, so it does not measure the image file's byte size.

The Gemini client is created in `service-worker.js` with the local API key. Its `createGeminiClient` factory also accepts an injected `fetchImpl`, allowing tests to exercise the response handling without making live API calls.
The client uses gemini-3.8-flash (https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and the Gemini [generateContent API] (https://ai.google.dev/api/generate-content).

1. Create a Gemini API key in Google AI Studio.
2. Copy config.example.js to config.js in the project root.
3. Replace YOUR_GEMINI_API_KEY in config.js with your key.

(config.js is gitignored. Do not commit it.)

4. Open chrome://extensions and enable Developer mode.
5. Select Load unpacked and choose this project folder.
6. On the Cooks extension card, open the service worker's Inspect console if you want to test the Gemini client directly.
7. Run these examples in that console:

   // await detectDishFromText("sushi");
   // Expected output: { ok: true, data: { isDish: true, confidence: 0.9, ... } }

   // await detectDishFromText("hello world");
   // Expected output: { ok: true, data: { isDish: false, dishName: null, recipe: null, ... } }

   // Try a fragment or unclear food reference to check the threshold behavior.
   // Results below confidence 0.75 are returned with isDish: false.
   // await detectDishFromText("sauce");

   // await detectDishFromText("");
   // Expected output: { ok: false, error: { code: "bad_input", ... } }

To verify the API error path, temporarily replace the key in config.js with an invalid value, reload the extension, and call await detectDishFromText("pad thai"). A non-2xx API response returns { ok: false, error: { code: "api_error", status: <HTTP status>, ... } }.Restore the valid key and reload afterward.

The client has a 60-second request timeout. It never logs the API key or the
selected text, and returns custom results for:
- invalid input
- network errors
- timeouts
- HTTP errors
- unusable Gemini responses

The business logic classifies a result as a dish only when Gemini reports
`isDish: true` and its normalized confidence is at least
`DISH_CONFIDENCE_THRESHOLD` (`0.75`). Lower-confidence dish guesses are returned
as `isDish: false` with a null dish name and recipe. The application receives
the classification, confidence, dish name, and recipe in the
`COOKS_RECIPE_RESULT` message and the stored `recipeResponse`.

The popup exposes `CooksUserSession.signIn(profile)`,
`CooksUserSession.getCurrentUser()`, and `CooksUserSession.signOut()` for the
application layer. A profile must include a non-empty `userId`. Sign-in stores
the profile and a session marker in `chrome.storage.local`; the current-user
function returns the profile's `userId` only for an active session, otherwise
`"anonymous"`. Sign-out clears `chrome.storage.local`, including transient
selection and recipe data.

Run the business-logic unit tests without calling the API:

```sh
node --test tests/geminiClient.test.mjs tests/userSession.test.mjs
```

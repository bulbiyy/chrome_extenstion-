# Info about Gemini API and Google OAuth

# Gemini API Integration (PBIs 4, 6, and 10)

The background client exports `detectDishFromText(selectedText)`. When a text selection is chosen from the context menu, `background.js` calls the Gemini client, stores the result, and displays the dish name, ingredients, and steps.

Image selections use a Gemini multimodal request. The extension asks for access to the selected image's website only when needed; denying access prevents the image download. Some sites may still reject extension requests or hotlinking, in which case the extension reports an image-fetch error.

The popup's file picker is currently a UI placeholder: users can choose files or drop them onto the Add files button. It accepts JPEG, PNG, WebP, HEIC, and HEIF images and rejects other types, showing selection/rejection status locally. Files are not sent out to Gemini yet.

For image selections, the background reads the clicked image element's intrinsic dimensions in the frame where it was clicked and includes its width, height, and alt text in the request package. It rejects images whose dimensions cannot be verified, exceed 8,192 pixels on either side, or exceed 40 megapixels total. Downloaded images are capped at 13 MiB, must have a supported MIME type, and image downloads and Gemini requests each time out after 25 seconds. The API request is kept below 19 MiB to stay within Gemini's 20 MB inline-data limit.

Gemini returns a `dishCount` in the shared result: 0 means no identifiable dish, 1 means one dish, and 2 or more means multiple dishes. Only a single dish above the confidence threshold receives a recipe. Text results are instructed to preserve the input's script/romanization and return a lowercase two-letter ISO 639-1 language code; output is rejected if the code or dish count is malformed. Multilingual identification is an initial implementation and model results may still be incorrect, especially for rare dishes or unclear images.

The Gemini client is created in `service-worker.js` with the local API key. Its `createGeminiClient` factory also accepts an injected `fetchImpl`, allowing tests to exercise the response handling without making live API calls.
The client uses Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`, https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) with the Gemini [generateContent API](https://ai.google.dev/api/generate-content).

1. Create a Gemini API key in Google AI Studio.
2. Copy config.example.js to config.js in the project root.
3. Replace YOUR_GEMINI_API_KEY in config.js with your key. (gitignore, do not commit)
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


The client has a 25-second timeout per network request. It never logs the API key or the
selected text, and returns custom results for:
- invalid input
- network errors
- timeouts
- HTTP errors
- unusable Gemini responses

The business logic classifies a result as a dish only when Gemini reports
`isDish: true`, exactly one dish, and normalized confidence at least
`DISH_CONFIDENCE_THRESHOLD` (`0.75`). Lower-confidence dish guesses are returned
as `isDish: false` with a null dish name and recipe. The application receives
the classification, confidence, dish count, language code, dish name, and recipe in the
`COOKS_RECIPE_RESULT` message and the stored `recipeResponse`.
The popup and in-page card show a clear no-dish or unavailable-result message
and hide recipe details for non-dish, malformed, or failed responses.

The popup exposes `CooksUserSession.signIn(profile)`,
`CooksUserSession.getCurrentUser()`, and `CooksUserSession.signOut()` for the
application layer. A profile must include a non-empty `userId`. Sign-in stores
the profile and a session marker in `chrome.storage.local`; the current-user
function returns the profile's `userId` only for an active session, otherwise
`"anonymous"`. Sign-out clears `chrome.storage.local`, including transient
selection and recipe data.

Run the full automated test suite without calling the API:

```sh
node --test tests/geminiClient.test.mjs tests/userSession.test.mjs tests/application.test.mjs
```

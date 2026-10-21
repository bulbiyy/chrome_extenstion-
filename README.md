# Info about Gemini API and Google OAuth

# Gemini API Integration (PBI 4)

The background client exports the dish detection function call with Gemini user content as an argument and returns the raw dish judgement. At the moment, no page selections, extenstion messages, cache results, or confidence thresholds are used. This lets the future selection/message caller pass highlighted webpage text directly, without coupling the API to a UI or content script.

The client uses gemini-2.5-flash (https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) and the Gemini [generateContent API] (https://ai.google.dev/api/generate-content).

1. Create a Gemini API key in Google AI Studio.
2. Copy config.example.js to config.js in the project root.
3. Replace YOUR_GEMINI_API_KEY in config.js with your key. (gitignore, do not commit)
4. Open chrome://extensions and enable Developer mode.
5. Select Load unpacked and choose this project folder.
6. On the Cooks extension card, open the service worker's Inspect console.
   The service worker exposes detectDishFromText only for this manual PBI test.
7. Run these examples in that console:

   // await detectDishFromText("sushi");
   // Expected output: { ok: true, data: { isDish: true, ... } }

   // await detectDishFromText("hello world");
   // Expected output: { ok: true, data: { isDish: false, dishName: null, recipe: null, ... } }

   // await detectDishFromText("");
   // Expected output: { ok: false, error: { code: "bad_input", ... } }


Requests time out after 15 seconds. Errors return `{ ok: false, error: { code, message } }`:
- `bad_input`: empty text.
- `network`: Gemini could not be reached.
- `timeout`: Gemini took >15 seconds.
- `api_error`: Gemini rejected the request; includes the HTTP status.
- `bad_response`: Gemini returned missing/invalid data.

Run the Gemini client unit tests:

```sh
node --test tests/geminiClient.test.mjs
```

## Google identity client (PBI 22/23)

Google authentication for Cooks uses the OAuth client ID and `identity` permission in
`manifest.json`. The identity client returns the user's ID, email, name, and picture (session saving and sign-in buttons haven't been implemented yet).

Run the mocked identity-client tests:

```sh
node --test tests/identityClient.test.mjs
```

import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiClient, DISH_CONFIDENCE_THRESHOLD } from "../src/background/geminiClient.js";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, validateImageDimensions } from "../src/shared/imageValidation.js";

const API_KEY = "test-api-key";

test("accepts image dimensions within the configured limits", () => {
  assert.deepEqual(validateImageDimensions(1920, 1080), { valid: true });
  assert.deepEqual(
    validateImageDimensions(MAX_IMAGE_DIMENSION, 1),
    { valid: true }
  );
});

test("rejects invalid or unverifiable image dimensions", () => {
  for (const [width, height] of [[0, 100], [-1, 100], [100, 0], [1.5, 100], [null, 100]]) {
    assert.equal(validateImageDimensions(width, height).valid, false);
  }
});

test("rejects images exceeding a dimension or total pixel limit", () => {
  assert.equal(validateImageDimensions(MAX_IMAGE_DIMENSION + 1, 1).valid, false);
  assert.equal(validateImageDimensions(5000, 8001).valid, false);
  assert.equal(validateImageDimensions(MAX_IMAGE_PIXELS + 1, 1).valid, false);
});

function createGeminiResponse(data) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(data) }],
        },
      },
    ],
  };
}

function mockSuccessfulFetch(data, requests = []) {
  return async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(createGeminiResponse(data)),
    };
  };
}

test("identifies a dish and returns its recipe", async () => {
  const dish = {
    isDish: true,
    confidence: 0.94,
    dishName: "Pad Thai",
    language: "en",
    recipe: {
      ingredients: ["200 g rice noodles", "1 egg"],
      steps: ["Soak the noodles.", "Stir-fry and serve."],
    },
  };
  const requests = [];
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch(dish, requests),
  });

  const result = await detectDishFromText("Pad Thai");

  assert.deepEqual(result, { ok: true, data: dish });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(requests[0].options.headers["x-goog-api-key"], API_KEY);
  assert.equal(
    JSON.parse(requests[0].options.body).contents[0].parts[0].text,
    "Pad Thai",
  );
});

test("returns a valid non-dish classification without a recipe", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch({
      isDish: false,
      confidence: 0.98,
      dishName: null,
      language: "en",
      recipe: null,
    }),
  });

  const result = await detectDishFromText("a sunny day");

  assert.deepEqual(result, {
    ok: true,
    data: {
      isDish: false,
      confidence: 0.98,
      dishName: null,
      language: "en",
      recipe: null,
    },
  });
});

test("rejects a low-confidence dish classification", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch({
      isDish: true,
      confidence: DISH_CONFIDENCE_THRESHOLD - 0.01,
      dishName: "Possibly a dish",
      language: "en",
      recipe: {
        ingredients: ["ingredient"],
        steps: ["step"],
      },
    }),
  });

  const result = await detectDishFromText("possibly a dish");

  assert.equal(result.ok, true);
  assert.equal(result.data.isDish, false);
  assert.equal(result.data.dishName, null);
  assert.equal(result.data.recipe, null);
});

test("rejects blank text without calling Gemini", async () => {
  let requestCount = 0;
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error("Fetch should not run for blank input.");
    },
  });

  const result = await detectDishFromText("   ");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "bad_input");
  assert.equal(requestCount, 0);
});

test("returns a bad-response error for malformed Gemini recipe data", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({
              isDish: true,
              confidence: 0.9,
              dishName: "Soup",
              language: "en",
              recipe: { ingredients: ["water"], steps: "not-an-array" },
            }) }],
          },
        }],
      }),
    }),
  });

  const result = await detectDishFromText("soup");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "bad_response");
});

test("returns the HTTP status when Gemini rejects the request", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });

  const result = await detectDishFromText("sushi");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "api_error");
  assert.equal(result.error.status, 403);
});

test("returns a network error when fetch rejects", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => {
      throw new Error("Network unavailable");
    },
  });

  const result = await detectDishFromText("sushi");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "network");
});

test("returns a timeout error when Gemini does not respond in time", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    requestTimeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }),
  });

  const result = await detectDishFromText("sushi");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
});

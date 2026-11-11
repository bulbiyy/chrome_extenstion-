import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeminiClient,
  DISH_CONFIDENCE_THRESHOLD,
  MAX_IMAGE_BYTES,
} from "../src/background/geminiClient.js";
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
  const responseData = {
    dishCount: data.dishCount ?? (data.isDish ? 1 : 0),
    ...data,
  };
  return async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(createGeminiResponse(responseData)),
    };
  };
}

test("detects a dish from selected text and returns recipe data", async () => {
  const dish = {
    isDish: true,
    confidence: 0.94,
    dishCount: 1,
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
  assert.equal(requests[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
  assert.equal(requests[0].options.headers["x-goog-api-key"], API_KEY);
  assert.equal(
    JSON.parse(requests[0].options.body).contents[0].parts[0].text,
    "Pad Thai",
  );
});

test("detects a dish from an image using the same response format as text", async () => {
  const requests = [];
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === "https://example.test/pad-thai.jpg") {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === "content-type" ? "image/jpeg" : null },
          arrayBuffer: async () => new Uint8Array([255, 216, 255, 224]).buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(createGeminiResponse({
          isDish: true,
          confidence: 0.94,
          dishCount: 1,
          dishName: "Pad Thai",
          language: "en",
          recipe: {
            ingredients: ["200 g rice noodles", "1 egg"],
            steps: ["Soak the noodles.", "Stir-fry and serve."],
          },
        })),
      };
    },
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/pad-thai.jpg",
    altText: "Pad thai bowl",
    pageUrl: "https://example.test/recipe",
    imageWidth: 800,
    imageHeight: 600,
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      isDish: true,
      confidence: 0.94,
      dishCount: 1,
      dishName: "Pad Thai",
      language: "en",
      recipe: {
        ingredients: ["200 g rice noodles", "1 egg"],
        steps: ["Soak the noodles.", "Stir-fry and serve."],
      },
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[1].options.body).contents[0].parts[0].text.includes("Pad thai bowl"), true);
  assert.equal(JSON.parse(requests[1].options.body).contents[0].parts[1].inlineData.mimeType, "image/jpeg");
});

test("reports the dish count for an image with multiple dishes", async () => {
  const requests = [];
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === "https://example.test/meal.png") {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === "content-type" ? "image/png" : null },
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(createGeminiResponse({
          isDish: false,
          confidence: 0.96,
          dishCount: 2,
          dishName: null,
          language: "en",
          recipe: null,
        })),
      };
    },
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/meal.png",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      isDish: false,
      confidence: 0.96,
      dishCount: 2,
      dishName: null,
      language: "en",
      recipe: null,
    },
  });
  assert.equal(requests.length, 2);
});

test("reports zero when no dish is identified in an image", async () => {
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async (url) => {
      if (url === "https://example.test/landscape.jpg") {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === "content-type" ? "image/jpeg" : null },
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(createGeminiResponse({
          isDish: false,
          confidence: 0.99,
          dishCount: 0,
          dishName: null,
          language: "en",
          recipe: null,
        })),
      };
    },
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/landscape.jpg",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.isDish, false);
  assert.equal(result.data.dishCount, 0);
  assert.equal(result.data.dishName, null);
});

test("does not accept an image dish guess when Gemini reports multiple dishes", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch({
      isDish: true,
      confidence: 0.99,
      dishCount: 2,
      dishName: null,
      language: "en",
      recipe: null,
    }),
  });

  const result = await detectDishFromText("sushi and ramen");

  assert.equal(result.ok, true);
  assert.equal(result.data.isDish, false);
  assert.equal(result.data.dishCount, 2);
  assert.equal(result.data.dishName, null);
  assert.equal(result.data.recipe, null);
});

test("preserves multilingual dish names and normalizes two-letter language codes", async () => {
  const cases = [
    { text: "arroz con pollo", dishName: "arroz con pollo", language: "ES", normalized: "es" },
    { text: "boeuf bourguignon", dishName: "boeuf bourguignon", language: "fr", normalized: "fr" },
    { text: "カレー", dishName: "カレー", language: "ja", normalized: "ja" },
    { text: "चना मसाला", dishName: "चना मसाला", language: "hi", normalized: "hi" },
    { text: "pad thai", dishName: "Pad Thai", language: "en", normalized: "en" },
  ];

  for (const { text, dishName, language, normalized } of cases) {
    const requests = [];
    const detectDishFromText = createGeminiClient({
      apiKey: API_KEY,
      fetchImpl: mockSuccessfulFetch({
        isDish: true,
        confidence: 0.95,
        dishCount: 1,
        dishName,
        language,
        recipe: { ingredients: ["ingredient"], steps: ["step"] },
      }, requests),
    });

    const result = await detectDishFromText(text);

    assert.equal(result.ok, true);
    assert.equal(result.data.dishName, dishName);
    assert.equal(result.data.language, normalized);
    assert.match(
      JSON.parse(requests[0].options.body).systemInstruction.parts[0].text,
      /original script.*romanized name.*ISO 639-1/,
    );
  }
});

test("rejects malformed dish counts and non-ISO language labels", async () => {
  for (const invalidData of [
    { dishCount: -1, language: "en" },
    { dishCount: 1.5, language: "en" },
    { dishCount: 1, language: "Japanese" },
  ]) {
    const detectDishFromText = createGeminiClient({
      apiKey: API_KEY,
      fetchImpl: mockSuccessfulFetch({
        isDish: false,
        confidence: 0.2,
        dishName: null,
        recipe: null,
        ...invalidData,
      }),
    });

    const result = await detectDishFromText("dinner");

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "bad_response");
  }
});

test("rejects oversized image bytes before calling Gemini", async () => {
  let requestCount = 0;
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async (url) => {
      requestCount += 1;
      if (url === "https://example.test/large.jpg") {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === "content-type" ? "image/jpeg" : null },
          arrayBuffer: async () => new Uint8Array(MAX_IMAGE_BYTES + 1).buffer,
        };
      }
      throw new Error("Gemini must not receive an oversized image.");
    },
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/large.jpg",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "image_too_large");
  assert.equal(requestCount, 1);
});

test("checks image Content-Length before reading its body", async () => {
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => name === "content-type"
          ? "image/jpeg"
          : name === "content-length"
            ? String(MAX_IMAGE_BYTES + 1)
            : null,
      },
      arrayBuffer: async () => {
        throw new Error("An oversized response body should not be read.");
      },
    }),
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/large.jpg",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "image_too_large");
});

test("rejects images with unknown MIME types rather than assuming JPEG", async () => {
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/octet-stream" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }),
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/image-without-extension",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported_image_type");
});

test("uses a known URL extension when the image host omits its MIME type", async () => {
  const requests = [];
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("image.jpg")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(createGeminiResponse({
          isDish: false,
          confidence: 0.2,
          dishCount: 0,
          dishName: null,
          language: "en",
          recipe: null,
        })),
      };
    },
  });

  await detectDishFromImage({
    imageUrl: "https://example.test/image.jpg?size=large",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(
    JSON.parse(requests[1].options.body).contents[0].parts[1].inlineData.mimeType,
    "image/jpeg",
  );
});

test("times out a slow image download", async () => {
  const detectDishFromImage = createGeminiClient({
    apiKey: API_KEY,
    imageFetchTimeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }),
  });

  const result = await detectDishFromImage({
    imageUrl: "https://example.test/slow.jpg",
    imageWidth: 100,
    imageHeight: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
});

test("handles selected text that is not a dish", async () => {
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
      dishCount: 0,
      dishName: null,
      language: "en",
      recipe: null,
    },
  });
});

test("handles low-confidence dish identification", async () => {
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

test("accepts a dish classification at the confidence threshold", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch({
      isDish: true,
      confidence: DISH_CONFIDENCE_THRESHOLD,
      dishName: "Pad Thai",
      language: "en",
      recipe: { ingredients: ["rice noodles"], steps: ["Stir-fry."] },
    }),
  });

  const result = await detectDishFromText("Pad Thai");

  assert.equal(result.ok, true);
  assert.equal(result.data.isDish, true);
  assert.equal(result.data.confidence, DISH_CONFIDENCE_THRESHOLD);
  assert.equal(result.data.dishName, "Pad Thai");
  assert.deepEqual(result.data.recipe, {
    ingredients: ["rice noodles"],
    steps: ["Stir-fry."],
  });
});

test("rejects blank text input", async () => {
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

test("handles malformed recipe data from Gemini", async () => {
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
              dishCount: 1,
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

test("rejects incoherent non-dish data from Gemini", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: mockSuccessfulFetch({
      isDish: false,
      confidence: 0.98,
      dishName: "Unexpected dish name",
      language: "en",
      recipe: null,
    }),
  });

  const result = await detectDishFromText("a sunny day");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "bad_response");
});

test("rejects recipes without a usable dish name or cooking steps", async () => {
  for (const data of [
    {
      isDish: true,
      confidence: 0.9,
      dishName: "  ",
      language: "en",
      recipe: { ingredients: ["water"], steps: ["Boil."] },
    },
    {
      isDish: true,
      confidence: 0.9,
      dishName: "Soup",
      language: "en",
      recipe: { ingredients: ["water"], steps: ["  "] },
    },
    {
      isDish: true,
      confidence: 1.1,
      dishName: "Soup",
      language: "en",
      recipe: { ingredients: ["water"], steps: ["Boil."] },
    },
  ]) {
    const detectDishFromText = createGeminiClient({
      apiKey: API_KEY,
      fetchImpl: mockSuccessfulFetch(data),
    });

    const result = await detectDishFromText("soup");

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "bad_response");
  }
});

test("handles Gemini API HTTP errors", async () => {
  const detectDishFromText = createGeminiClient({
    apiKey: API_KEY,
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });

  const result = await detectDishFromText("sushi");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "api_error");
  assert.equal(result.error.status, 403);
});

test("handles network failure", async () => {
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

test("handles request timeout", async () => {
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.files = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ type, target: this });
    }
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }
}

class FakeDataTransfer {
  constructor() {
    const files = [];
    this.items = {
      add(file) {
        files.push(file);
      },
    };
    this.files = files;
  }
}

function createPopupHarness(storageData = {}, protocol = "https:") {
  const ids = [
    "dish-name",
    "recipe-status",
    "recipe-category",
    "dish-description",
    "cook-time",
    "servings",
    "difficulty",
    "recipe-details",
    "ingredients-heading",
    "ingredients",
    "steps-heading",
    "instructions",
    "youtube-link",
    "references",
    "references-block",
    "footer-note",
    "dish-image",
    "favorite-button",
    "show-favorites",
    "favorites-view",
    "recipe-view",
    "account-view",
    "favorites-count",
    "favorites-list",
    "favorites-empty",
    "save-status",
    "recipe-files",
    "file-selection-status",
    "file-upload-button",
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  elements.get("dish-name").textContent = "Creamy Tomato Pasta";
  elements.get("recipe-status").hidden = true;
  const imageTag = new FakeElement("image-tag");
  const document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => selector === ".image-tag" ? imageTag : null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.map((key) => [key, storageData[key]]));
        },
        async set(values) {
          Object.assign(storageData, values);
        },
      },
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
    },
  };
  const context = vm.createContext({
    chrome,
    document,
    location: { protocol },
    console: { error() {}, log() {} },
    CooksUserSession: {
      async getCurrentUser() {
        return "user-123";
      },
    },
    DataTransfer: FakeDataTransfer,
    URL,
  });

  return { context, elements, imageTag, storageData };
}

async function loadPopupScripts(context) {
  for (const file of ["render-recipe.js", "selection-data.js", "popup.js"]) {
    vm.runInContext(await readProjectFile(file), context, { filename: file });
  }
}

function createChromeEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    dispatch(...args) {
      for (const listener of listeners) {
        listener(...args);
      }
    },
  };
}

test("displays the recipe response in the popup", async () => {
  const recipeResponse = {
    ok: true,
    data: {
      isDish: true,
      confidence: 0.94,
      dishName: "Pad Thai",
      language: "en",
      recipe: {
        ingredients: ["200 g rice noodles", "1 egg"],
        steps: ["Soak the noodles.", "Stir-fry and serve."],
      },
    },
  };
  const { context, elements } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  assert.equal(elements.get("dish-name").textContent, "Pad Thai");
  assert.deepEqual(
    elements.get("ingredients").children.map((item) => item.textContent),
    ["200 g rice noodles", "1 egg"],
  );
  assert.deepEqual(
    elements.get("instructions").children.map((item) => item.textContent),
    ["Soak the noodles.", "Stir-fry and serve."],
  );
  assert.equal(elements.get("recipe-status").hidden, true);
  assert.equal(elements.get("favorite-button").disabled, false);
});

test("saves a valid dish for the active user and toggles it off", async () => {
  const recipeResponse = {
    ok: true,
    data: {
      isDish: true,
      confidence: 0.94,
      dishName: "Pad Thai",
      language: "en",
      recipe: {
        ingredients: ["200 g rice noodles", "1 egg"],
        steps: ["Soak the noodles.", "Stir-fry and serve."],
      },
    },
  };
  const { context, elements, storageData } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  await vm.runInContext("toggleSavedRecipe()", context);
  const savedKey = "cooksSavedRecipes:user-123";
  assert.equal(storageData[savedKey].length, 1);
  assert.equal(storageData[savedKey][0].dishName, "Pad Thai");
  assert.equal(elements.get("favorite-button").attributes.get("aria-pressed"), "true");
  assert.match(elements.get("save-status").textContent, /added to your favorites/);

  storageData.recipeResponse = {
    ok: true,
    data: {
      ...recipeResponse.data,
      recipe: {
        ingredients: ["200 g rice noodles", "1 egg", "2 tbsp sauce"],
        steps: ["Boil the noodles until tender.", "Whisk the sauce and toss with noodles."],
      },
    },
  };
  await vm.runInContext("loadRecipeResponse()", context);
  await vm.runInContext("toggleSavedRecipe()", context);
  assert.equal(storageData[savedKey].length, 2);
  assert.equal(storageData[savedKey][1].dishName, "Pad Thai");

  storageData.recipeResponse = recipeResponse;
  await vm.runInContext("loadRecipeResponse()", context);
  await vm.runInContext("toggleSavedRecipe()", context);
  assert.equal(storageData[savedKey].length, 1);
  assert.deepEqual(
    Array.from(storageData[savedKey][0].recipe.steps),
    ["Boil the noodles until tender.", "Whisk the sauce and toss with noodles."],
  );
  assert.equal(elements.get("favorite-button").attributes.get("aria-pressed"), "false");
});

test("the preview heart saves the displayed recipe and Favorites opens the saved list", async () => {
  const { context, elements, storageData } = createPopupHarness({}, "chrome-extension:");
  await loadPopupScripts(context);
  await vm.runInContext("updateSaveButtonState()", context);

  assert.equal(elements.get("favorite-button").disabled, false);
  await vm.runInContext("toggleSavedRecipe()", context);
  assert.equal(storageData["cooksSavedRecipes:user-123"][0].dishName, "Creamy Tomato Pasta");
  assert.equal(elements.get("favorite-button").attributes.get("aria-pressed"), "true");

  await vm.runInContext("document.getElementById('show-favorites').listeners.get('click')[0]()", context);
  assert.equal(elements.get("favorites-view").hidden, false);
  assert.equal(elements.get("favorites-count").textContent, "1");
});

test("rejects uploaded images over 20 MiB and keeps only one eligible image", async () => {
  const { context, elements } = createPopupHarness();
  await loadPopupScripts(context);
  const fileInput = elements.get("recipe-files");
  fileInput.files = [
    { name: "meal.png", type: "image/png", size: 1024 },
    { name: "too-large.jpg", type: "image/jpeg", size: 20 * 1024 * 1024 + 1 },
    { name: "extra.webp", type: "image/webp", size: 512 },
  ];

  fileInput.dispatch("change");

  assert.deepEqual(fileInput.files.map((file) => file.name), ["meal.png"]);
  assert.match(elements.get("file-selection-status").textContent, /over 20 MiB: too-large\.jpg/);
  assert.match(elements.get("file-selection-status").textContent, /Only one file can be selected/);
});

test("shows a clear no-dish result without leaving the demo recipe visible", async () => {
  const recipeResponse = {
    ok: true,
    data: {
      isDish: false,
      confidence: 0.98,
      dishName: null,
      language: "en",
      recipe: null,
    },
  };
  const { context, elements } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  assert.equal(elements.get("dish-name").textContent, "No dish found");
  assert.equal(elements.get("recipe-status").hidden, false);
  assert.match(elements.get("recipe-status").textContent, /not identified as a dish/);
  for (const id of [
    "recipe-category",
    "dish-description",
    "recipe-details",
    "ingredients-heading",
    "ingredients",
    "steps-heading",
    "instructions",
    "youtube-link",
    "references-block",
    "footer-note",
  ]) {
    assert.equal(elements.get(id).hidden, true, `Expected #${id} to be hidden`);
  }
  assert.deepEqual(elements.get("ingredients").children, []);
  assert.deepEqual(elements.get("instructions").children, []);
});

test("shows a distinct message when multiple dishes are identified", async () => {
  const recipeResponse = {
    ok: true,
    data: {
      isDish: false,
      confidence: 0.98,
      dishCount: 2,
      dishName: null,
      language: "en",
      recipe: null,
    },
  };
  const { context, elements } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  assert.equal(elements.get("dish-name").textContent, "Multiple dishes found");
  assert.match(elements.get("recipe-status").textContent, /multiple dishes/);
  assert.equal(elements.get("recipe-details").hidden, true);
});

test("shows malformed successful data as an incomplete result", async () => {
  const recipeResponse = {
    ok: true,
    data: {
      isDish: true,
      dishName: "Soup",
      recipe: { ingredients: ["water"], steps: "not-an-array" },
    },
  };
  const { context, elements } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  assert.equal(elements.get("dish-name").textContent, "Recipe unavailable");
  assert.equal(elements.get("recipe-status").hidden, false);
  assert.match(elements.get("recipe-status").textContent, /incomplete result/);
  assert.equal(elements.get("ingredients").children.length, 0);
  assert.equal(elements.get("instructions").children.length, 0);
});

test("clears demo recipe details when the API returns an error", async () => {
  const recipeResponse = {
    ok: false,
    error: { code: "bad_response", message: "The service returned invalid data." },
  };
  const { context, elements } = createPopupHarness({ recipeResponse });
  await loadPopupScripts(context);
  await vm.runInContext("loadRecipeResponse()", context);

  assert.equal(elements.get("dish-name").textContent, "Recipe unavailable");
  assert.equal(elements.get("recipe-status").hidden, false);
  assert.match(elements.get("recipe-status").textContent, /bad_response/);
  assert.equal(elements.get("recipe-details").hidden, true);
  assert.equal(elements.get("ingredients-heading").hidden, true);
});

test("displays a selected image and falls back if it fails to load", async () => {
  const { context, elements, imageTag } = createPopupHarness({
    selectedImageUrl: "https://example.test/pad-thai.jpg",
  });
  await loadPopupScripts(context);
  await vm.runInContext("loadPopupImage()", context);

  const image = elements.get("dish-image");
  assert.equal(image.src, "https://example.test/pad-thai.jpg");
  assert.equal(image.alt, "Image selected from a webpage");
  assert.equal(imageTag.textContent, "SELECTED IMAGE");

  image.dispatch("error");

  assert.equal(image.src, "chrome-extension://test/assets/pasta.svg");
  assert.equal(image.alt, "Illustration of a bowl of tomato pasta");
  assert.equal(imageTag.textContent, "RECIPE IDEA");
});

test("uses the bundled image when no selected image is available", async () => {
  const { context, elements } = createPopupHarness();
  await loadPopupScripts(context);
  await vm.runInContext("loadPopupImage()", context);

  assert.equal(
    elements.get("dish-image").src,
    "chrome-extension://test/assets/pasta.svg",
  );
});

test("exposes an accessible favorite control and core recipe UI", async () => {
  const html = await readProjectFile("popup.html");
  const getButtonAttributes = (id) => {
    const match = html.match(new RegExp(`<button\\b(?=[^>]*\\bid="${id}")[^>]*>`, "s"));
    assert.ok(match, `Expected #${id} button in popup markup`);
    return match[0];
  };

  const button = getButtonAttributes("favorite-button");
  assert.match(button, /type="button"/);
  assert.match(button, /aria-label="Add recipe to favorites"/);
  assert.match(button, /aria-pressed="false"/);
  assert.match(html, /id="show-favorites"[^>]*>\s*Favorites/);

  for (const id of [
    "dish-name",
    "dish-image",
    "recipe-status",
    "ingredients",
    "instructions",
  ]) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
});

test("routes selected text into the in-page lookup card", async () => {
  const onInstalled = createChromeEvent();
  const onClicked = createChromeEvent();
  const injectedFiles = [];
  const sentMessages = [];
  const chrome = {
    runtime: {
      onInstalled,
      onMessage: createChromeEvent(),
    },
    contextMenus: {
      onClicked,
      removeAll(callback) { callback(); },
      create() {},
    },
    scripting: {
      async executeScript(options) {
        if (options.files) {
          injectedFiles.push(options.files);
        }
        return [];
      },
    },
    tabs: {
      async sendMessage(tabId, message, options) {
        sentMessages.push({ tabId, message, options });
      },
    },
  };
  const context = vm.createContext({ chrome, console, URL });
  vm.runInContext(await readProjectFile("background.js"), context, {
    filename: "background.js",
  });

  onClicked.dispatch(
    { menuItemId: "use-text-in-dishfind", selectionText: "  Pad Thai  " },
    { id: 7, windowId: 2 },
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    JSON.parse(JSON.stringify(injectedFiles)),
    [["render-recipe.js", "shadow-card.js", "lookup.js"]],
  );
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].tabId, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(sentMessages[0].message)), {
    type: "COOKS_SHOW_LOOKUP",
    payload: {
      selectionType: "text",
      fallbackText: "Pad Thai",
      fallbackImageDetails: null,
      imagePermissionGranted: true,
    },
  });
});

test("returns a structured bad-input response for an empty lookup", async () => {
  const onMessage = createChromeEvent();
  const chrome = {
    runtime: {
      id: "test-extension",
      onInstalled: createChromeEvent(),
      onMessage,
    },
    contextMenus: {
      onClicked: createChromeEvent(),
      removeAll(callback) { callback(); },
      create() {},
    },
  };
  const context = vm.createContext({ chrome, console, URL });
  vm.runInContext(await readProjectFile("background.js"), context, {
    filename: "background.js",
  });
  let response;

  onMessage.dispatch(
    { type: "IDENTIFY_DISH_FROM_TEXT", payload: { text: " " } },
    { id: "test-extension", tab: { id: 7 } },
    (value) => { response = value; },
  );

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    type: "COOKS_ERROR",
    payload: {
      ok: false,
      error: { code: "bad_input", message: "The text selection is empty." },
    },
  });
});

test("uses the active highlighted text for an in-page lookup request", async () => {
  const messageListeners = createChromeEvent();
  const requests = [];
  const card = {
    open(_data, options) {
      this.openOptions = options;
      this.opened = true;
    },
    isOpen() {
      return this.opened;
    },
    update(data) {
      this.updatedData = data;
    },
    setStatus(message) {
      this.status = message;
    },
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: messageListeners,
        async sendMessage(request) {
          requests.push(request);
          return {
            type: "COOKS_RECIPE_RESULT",
            payload: {
              ok: true,
              data: { isDish: true, dishName: "Pad Thai" },
            },
          };
        },
      },
    },
    window: {
      location: { href: "https://example.test/article" },
      getSelection: () => ({ toString: () => "  Pad Thai  " }),
    },
    __cooksCard: card,
  });
  vm.runInContext(await readProjectFile("lookup.js"), context, {
    filename: "lookup.js",
  });

  messageListeners.dispatch({
    type: "COOKS_SHOW_LOOKUP",
    payload: { selectionType: "text", fallbackText: "fallback text" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
    type: "IDENTIFY_DISH_FROM_TEXT",
    payload: {
      text: "Pad Thai",
      pageUrl: "https://example.test/article",
    },
  });
  assert.equal(card.openOptions.title, "Pad Thai");
  assert.equal(card.updatedData.dishName, "Pad Thai");
});

test("shows a structured generic error when the service worker disconnects", async () => {
  const messageListeners = createChromeEvent();
  const messages = [];
  const card = {
    open(_data, options) {
      this.openOptions = options;
      this.opened = true;
    },
    isOpen() {
      return this.opened;
    },
    showMessage(message) {
      messages.push(message);
    },
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: messageListeners,
        async sendMessage() {
          throw new Error("The service worker stopped before replying.");
        },
      },
    },
    window: {
      location: { href: "https://example.test/article" },
      getSelection: () => ({ toString: () => "sushi" }),
    },
    __cooksCard: card,
  });
  vm.runInContext(await readProjectFile("lookup.js"), context, {
    filename: "lookup.js",
  });

  messageListeners.dispatch({
    type: "COOKS_SHOW_LOOKUP",
    payload: { selectionType: "text", fallbackText: "sushi" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(card.openOptions.loading, true);
  assert.deepEqual(messages, [
    "Cooks could not complete this lookup. Please try again. (client_unavailable)",
  ]);
});

test("shows a generic error when a lookup message returns no response", async () => {
  const messageListeners = createChromeEvent();
  const messages = [];
  const card = {
    open() { this.opened = true; },
    isOpen() { return this.opened; },
    showMessage(message) { messages.push(message); },
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: messageListeners,
        async sendMessage() {
          return undefined;
        },
      },
    },
    window: {
      location: { href: "https://example.test/article" },
      getSelection: () => ({ toString: () => "sushi" }),
    },
    __cooksCard: card,
  });
  vm.runInContext(await readProjectFile("lookup.js"), context, {
    filename: "lookup.js",
  });

  messageListeners.dispatch({
    type: "COOKS_SHOW_LOOKUP",
    payload: { selectionType: "text", fallbackText: "sushi" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(messages, [
    "Cooks could not complete this lookup. Please try again. (client_unavailable)",
  ]);
});

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
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
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

function createPopupHarness(storageData = {}) {
  const ids = [
    "dish-name",
    "recipe-status",
    "recipe-category",
    "dish-description",
    "cook-time",
    "servings",
    "difficulty",
    "ingredients",
    "instructions",
    "youtube-link",
    "references",
    "dish-image",
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
      },
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
    },
  };
  const context = vm.createContext({
    chrome,
    document,
    location: { protocol: "https:" },
    console: { error() {}, log() {} },
    URL,
  });

  return { context, elements, imageTag };
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

test("exposes accessible like/save controls and core recipe UI", async () => {
  const html = await readProjectFile("popup.html");
  const getButtonAttributes = (id) => {
    const match = html.match(new RegExp(`<button\\b(?=[^>]*\\bid="${id}")[^>]*>`, "s"));
    assert.ok(match, `Expected #${id} button in popup markup`);
    return match[0];
  };

  for (const [id, label] of [
    ["like-button", "Like this recipe"],
    ["save-button", "Save this recipe for later"],
  ]) {
    const button = getButtonAttributes(id);
    assert.match(button, /type="button"/);
    assert.match(button, new RegExp(`aria-label="${label}"`));
    assert.match(button, /aria-pressed="false"/);
  }

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

test("connects selected text lookup to recipe processing and popup display", async () => {
  const onInstalled = createChromeEvent();
  const onClicked = createChromeEvent();
  const onMessage = createChromeEvent();
  const storage = {};
  const openedPopups = [];
  const recipeResponse = {
    ok: true,
    data: {
      isDish: true,
      confidence: 0.9,
      dishName: "Pad Thai",
      recipe: { ingredients: ["rice noodles"], steps: ["Stir-fry."] },
    },
  };
  const chrome = {
    runtime: {
      id: "test-extension",
      onInstalled,
      onMessage,
    },
    contextMenus: {
      onClicked,
      removeAll(callback) { callback(); },
      create() {},
    },
    storage: {
      local: {
        async set(values) {
          Object.assign(storage, values);
        },
      },
    },
    action: {
      async openPopup(options) {
        openedPopups.push(options);
      },
    },
  };
  const context = vm.createContext({
    chrome,
    console,
    URL,
    geminiClientReady: Promise.resolve(async (text) => {
      assert.equal(text, "Pad Thai");
      return recipeResponse;
    }),
  });
  vm.runInContext(await readProjectFile("background.js"), context, {
    filename: "background.js",
  });

  onClicked.dispatch(
    { menuItemId: "use-text-in-dishfind", selectionText: "  Pad Thai  " },
    { id: 7, windowId: 2 },
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(storage.selectedText, "Pad Thai");
  assert.equal(storage.selectedImageUrl, "");
  assert.deepEqual(storage.recipeResponse, recipeResponse);
  assert.deepEqual(JSON.parse(JSON.stringify(openedPopups)), [{ windowId: 2 }]);
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

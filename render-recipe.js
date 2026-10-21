// Shared recipe renderer. Loaded by popup.html AND injected as a content
// script, so the toolbar popup and the in-page Shadow DOM card use identical
// rendering code. Every function takes a `root` (document or a ShadowRoot);
// both support getElementById().

(() => {
  // Placeholder data shape (moved here from popup.js so both UIs share it).
  const demoRecipe = {
    // The name of the dish
    name: "Creamy Tomato Pasta",
    // A short category label displayed above the dish name.
    category: "QUICK & COMFORTING",
    // A short description of the dish.
    description: "A cozy tomato pasta with garlic, basil, and a silky sauce.",
    // Path or URL of the dish image displayed in the popup.
    image: "assets/pasta.svg",
    // Basic recipe information displayed near the dish image.
    cookTime: "25 min",
    servings: "2 servings",
    difficulty: "Easy",
    // Each ingredient is a string.
    ingredients: ["200 g pasta", "1 cup crushed tomatoes", "2 cloves garlic"],
    // Ordered list of cooking instructions; each is a string.
    instructions: [
      "Cook the pasta.",
      "Prepare the sauce.",
      "Combine the pasta and sauce."
    ],
    // Link to YouTube recipe videos related to the dish.
    youtubeSearchUrl:
      "https://www.youtube.com/results?search_query=creamy+tomato+pasta+recipe",
    // External references related to the recipe.
    references: [
      {
        label: "Pasta basics",
        url: "https://www.bbcgoodfood.com/recipes/collection/pasta-recipes"
      }
    ]
  };

  // Set an element's text, using `fallback` when the value is missing/empty.
  function setText(id, value, fallback = "", root = document) {
    const element = root.getElementById(id);
    if (element) {
      element.textContent =
        typeof value === "string" && value.trim() ? value : fallback;
    }
  }

  // Only http(s) links are allowed; returns null for malformed/unsafe URLs.
  function safeHttpUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:"
        ? parsed.href
        : null;
    } catch {
      return null;
    }
  }

  // Accepts either the Gemini result ({ isDish, dishName, recipe }) or the
  // demo/contract shape ({ name, ingredients, instructions, ... }).
  // Returns one display model, or null when there is nothing to show.
  function toDisplayModel(data) {
    if (data?.isDish && data.recipe) {
      return {
        name: data.dishName,
        category: "RECIPE",
        description: "Recipe generated from your selected text.",
        cookTime: "",
        servings: "",
        difficulty: "",
        ingredients: data.recipe.ingredients,
        instructions: data.recipe.steps,
        youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${data.dishName} recipe`)}`,
        references: []
      };
    }
    if (data && typeof data.name === "string") {
      return data;
    }
    return null;
  }

  function fillList(root, id, items) {
    const list = root.getElementById(id);
    if (!list) return;
    list.replaceChildren();
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item; // textContent only: never inject untrusted HTML
      list.append(li);
    }
  }

  function renderRecipe(data, root = document) {
    const status = root.getElementById("recipe-status");
    const model = toDisplayModel(data);

    if (!model) {
      if (status) {
        status.hidden = false;
        status.textContent =
          "The selected text was not identified as a dish. Try another selection.";
      }
      return;
    }

    setText("dish-name", model.name, "Recipe", root);
    setText("recipe-category", model.category, "RECIPE", root);
    setText("dish-description", model.description, "", root);
    setText("cook-time", model.cookTime, "", root);
    setText("servings", model.servings, "", root);
    setText("difficulty", model.difficulty, "", root);

    fillList(root, "ingredients", model.ingredients);
    fillList(root, "instructions", model.instructions);

    const youtubeLink = root.getElementById("youtube-link");
    if (youtubeLink) {
      const href = safeHttpUrl(model.youtubeSearchUrl);
      youtubeLink.hidden = !href;
      if (href) youtubeLink.href = href;
    }

    const references = root.getElementById("references");
    if (references) {
      references.replaceChildren();
      for (const ref of Array.isArray(model.references) ? model.references : []) {
        const href = safeHttpUrl(ref?.url);
        if (!href) continue; // skip malformed URLs
        const a = document.createElement("a");
        a.href = href;
        a.textContent = ref.label || href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        references.append(a);
      }
    }

    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
  }

  globalThis.CooksRender = { demoRecipe, setText, renderRecipe };
})();

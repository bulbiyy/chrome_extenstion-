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
      if (
        typeof data.dishName !== "string" ||
        !data.dishName.trim() ||
        !Array.isArray(data.recipe.ingredients) ||
        data.recipe.ingredients.length === 0 ||
        !data.recipe.ingredients.every(
          (item) => typeof item === "string" && item.trim(),
        ) ||
        !Array.isArray(data.recipe.steps) ||
        data.recipe.steps.length === 0 ||
        !data.recipe.steps.every(
          (step) => typeof step === "string" && step.trim(),
        )
      ) {
        return null;
      }
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
    if (
      data &&
      typeof data.name === "string" &&
      data.name.trim() &&
      Array.isArray(data.ingredients) &&
      data.ingredients.length > 0 &&
      data.ingredients.every((item) => typeof item === "string" && item.trim()) &&
      Array.isArray(data.instructions) &&
      data.instructions.length > 0 &&
      data.instructions.every((step) => typeof step === "string" && step.trim())
    ) {
      return data;
    }
    return null;
  }

  function setRecipeDetailsVisible(root, visible) {
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
      const element = root.getElementById(id);
      if (element) element.hidden = !visible;
    }
  }

  function renderMessage(message, title = "Recipe unavailable", root = document) {
    setText("dish-name", title, "Recipe unavailable", root);
    setRecipeDetailsVisible(root, false);

    for (const id of ["ingredients", "instructions", "references"]) {
      const element = root.getElementById(id);
      if (element) element.replaceChildren();
    }

    const status = root.getElementById("recipe-status");
    if (status) {
      status.hidden = false;
      status.textContent = message;
    }
  }

  function fillList(root, id, items) {
    const list = root.getElementById(id);
    if (!list) return;
    list.replaceChildren();
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
      if (data?.isDish === false) {
        if (data.dishCount >= 2) {
          renderMessage(
            "The selection contains multiple dishes. Choose one dish at a time.",
            "Multiple dishes found",
            root,
          );
        } else {
          renderMessage(
            "The selection was not identified as a dish. Try another selection.",
            "No dish found",
            root,
          );
        }
      } else {
        renderMessage(
          "The recipe service returned an incomplete result. Try again.",
          "Recipe unavailable",
          root,
        );
      }
      return;
    }

    setRecipeDetailsVisible(root, true);
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

  globalThis.CooksRender = { demoRecipe, setText, renderRecipe, renderMessage };
})();

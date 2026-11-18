// Shared recipe rendering

(() => {
  // Demo recipe data
  const demoRecipe = {
    name: "Creamy Tomato Pasta",
    category: "QUICK & COMFORTING",
    description: "A cozy tomato pasta with garlic, basil, and a silky sauce.",
    image: "assets/pasta.svg",
    cookTime: "25 min",
    servings: "2 servings",
    difficulty: "Easy",
    ingredients: ["200 g pasta", "1 cup crushed tomatoes", "2 cloves garlic"],
    instructions: [
      "Cook the pasta.",
      "Prepare the sauce.",
      "Combine the pasta and sauce."
    ],
    youtubeSearchUrl:
      "https://www.youtube.com/results?search_query=creamy+tomato+pasta+recipe",
    references: [
      {
        label: "Pasta basics",
        url: "https://www.bbcgoodfood.com/recipes/collection/pasta-recipes"
      }
    ]
  };

  // Safe text and URL helpers
  function setText(id, value, fallback = "", root = document) {
    const element = root.getElementById(id);
    if (element) {
      element.textContent =
        typeof value === "string" && value.trim() ? value : fallback;
    }
  }

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

  // Normalize recipe response shapes
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
    setLoading(false, root);
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

  function setLoading(loading, root = document, message = "Finding a recipe…") {
    const status = root.getElementById("recipe-status");
    if (!status) return;
    status.classList?.toggle("is-loading", loading);
    status.setAttribute?.("aria-busy", String(loading));
    if (loading) {
      status.hidden = false;
      status.textContent = message;
    } else {
      status.classList?.remove("is-loading");
      status.hidden = true;
      status.textContent = "";
    }
  }

  function fillList(root, id, items) {
    const list = root.getElementById(id);
    if (!list) return;
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item; // Render recipe text safely
      list.append(li);
    }
  }

  function configureCollapsibleSection(root, buttonId, listId, itemCount, collapseAt) {
    const button = root.getElementById(buttonId);
    const list = root.getElementById(listId);
    if (!button || !list) return;

    const expanded = itemCount < collapseAt;
    list.hidden = !expanded;
    button.setAttribute("aria-expanded", String(expanded));
    button.onclick = () => {
      const nextExpanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(nextExpanded));
      list.hidden = !nextExpanded;
    };
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
    configureCollapsibleSection(root, "ingredients-toggle", "ingredients", model.ingredients.length, 8);
    configureCollapsibleSection(root, "steps-toggle", "instructions", model.instructions.length, 6);

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
        if (!href) continue;
        const a = document.createElement("a");
        a.href = href;
        a.textContent = ref.label || href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        references.append(a);
      }
    }

    if (status) {
      status.classList?.remove("is-loading");
      status.setAttribute?.("aria-busy", "false");
      status.hidden = true;
      status.textContent = "";
    }
  }

  globalThis.CooksRender = { demoRecipe, setText, renderRecipe, renderMessage, setLoading };
})();

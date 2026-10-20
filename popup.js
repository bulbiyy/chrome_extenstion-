// PBI 1: EXTENSION SKELETON



// HELPER FUNCTION: SET TEXT

// WHAT TO IMPLEMENT:
// 1. Find the element using document.getElementById().
// 2. Check that the element exists.
// 3. Set its textContent to the supplied value.
// 4. If the value is empty, display the fallback text.
//
// WHY:
// This avoids displaying empty fields when some recipe data
// is missing.

function setText(id, value, fallback = "") {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = typeof value === "string" && value.trim()
      ? value
      : fallback;
  }
}


// MAIN FUNCTION: RENDER RECIPE

// INPUT:
// A recipe object following the shared structure defined above.

// INTEGRATION:
// The UI should accept the same object regardless of whether it comes from demo data, Gemini, or the classification component.

function renderRecipe(data) {
  const ingredients = document.getElementById("ingredients");
  const instructions = document.getElementById("instructions");
  const status = document.getElementById("recipe-status");

  if (!data?.isDish || !data.recipe) {
    if (status) {
      status.hidden = false;
      status.textContent = "The selected text was not identified as a dish. Try another selection.";
    }
    return;
  }

  setText("dish-name", data.dishName, "Recipe");
  setText("recipe-category", "RECIPE");
  setText("dish-description", "Recipe generated from your selected text.");
  setText("cook-time", "");
  setText("servings", "");
  setText("difficulty", "");

  if (ingredients) {
    ingredients.replaceChildren();
    for (const item of data.recipe.ingredients) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      ingredients.append(listItem);
    }
  }

  if (instructions) {
    instructions.replaceChildren();
    for (const step of data.recipe.steps) {
      const listItem = document.createElement("li");
      listItem.textContent = step;
      instructions.append(listItem);
    }
  }

  const youtubeLink = document.getElementById("youtube-link");
  if (youtubeLink) {
    youtubeLink.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${data.dishName} recipe`)}`;
  }

  if (status) {
    status.hidden = true;
    status.textContent = "";
  }
}

// Display the stored Gemini recipe or report why a recipe is unavailable.
async function loadRecipeResponse() {
  const title = document.getElementById("dish-name");
  if (!title) {
    console.error("Could not find the recipe title element.");
    return;
  }
  const defaultTitle = title.textContent;
  try {
    const response = await getRecipeResponse();
    if (!response) {
      title.textContent = await getSelectedText() || defaultTitle;
      return;
    }

    if (!response.ok) {
      const status = document.getElementById("recipe-status");
      if (status) {
        status.hidden = false;
        const error = response.error || {};
        const details = [
          error.code,
          Number.isInteger(error.status) ? `HTTP ${error.status}` : null
        ].filter(Boolean);
        status.textContent = [
          error.message || "The recipe request could not be completed.",
          details.length ? `(${details.join(", ")})` : ""
        ].filter(Boolean).join(" ");
      }
      return;
    }

    renderRecipe(response.data);
  } catch (error) {
    console.error("Could not load the recipe response:", error);
  }
}

// Show the captured image, falling back to the bundled test image if needed.
async function loadPopupImage() {
  const image = document.getElementById("dish-image");
  if (!image) {
    console.error("Could not find the popup image element.");
    return;
  }

  const imageTag = document.querySelector(".image-tag");
  const testImageUrl = chrome.runtime.getURL("assets/pasta.svg");
  image.dataset.source = "test";
  image.addEventListener("error", () => {
    if (image.dataset.source === "selected") {
      image.dataset.source = "test";
      image.src = testImageUrl;
      image.alt = "Illustration of a bowl of tomato pasta";
      if (imageTag) {
        imageTag.textContent = "RECIPE IDEA";
      }
      return;
    }

    console.error("Could not load the test image:", testImageUrl);
  });

  try {
    const imageUrl = await getSelectedImage();
    if (!imageUrl) {
      image.src = testImageUrl;
      return;
    }

    image.dataset.source = "selected";
    image.src = imageUrl;
    image.alt = "Image selected from a webpage";
    if (imageTag) {
      imageTag.textContent = "SELECTED IMAGE";
    }
  } catch (error) {
    console.error("Could not load the selected image:", error);
    image.src = testImageUrl;
  }
}

loadRecipeResponse();
loadPopupImage();

const recipe = {
  // The name of the dish 
  name: "Creamy Tomato Pasta",

  // A short category label displayed above the dish name.
  category: "QUICK & COMFORTING",

  // A short description of the dish.
  description: "A cozy tomato pasta with garlic, basil, and a silky sauce.",

  // Path or URL of the dish image displayed in the popup.
  // Replace the demo image with a real image when available.
  image: "assets/pasta.svg",

  // Basic recipe information displayed near the dish image.
  cookTime: "25 min",
  servings: "2 servings",
  difficulty: "Easy",

  // List of ingredients.
  // Each ingredient should be a string.
  ingredients: [
    "200 g pasta",
    "1 cup crushed tomatoes",
    "2 cloves garlic"
  ],

  // Ordered list of cooking instructions.
  // Each instruction should be a string.
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
// Suugestion
// LIKE BUTTON

// PURPOSE:
// Allow the user to like or unlike the displayed recipe.
if (location.protocol === "chrome-extension:") {
  renderRecipe(recipe);
}
// PBI 1: EXTENSION SKELETON

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
  // TODO: Find the HTML element using its ID.
  // TODO: If the element exists, set its textContent.
  // TODO: Use fallback when value is missing or empty.
}


// MAIN FUNCTION: RENDER RECIPE

// INPUT:
// A recipe object following the shared structure defined above.

// INTEGRATION:
// The UI should accept the same object regardless of whether it comes from demo data, Gemini, or the classification component.

function renderRecipe(data) {

  // 1. DISPLAY BASIC RECIPE INFORMATION
  // the dish name in the element "dish-name".
  // the category in "recipe-category".
  // the description in "dish-description".
  // the cooking time in "cook-time".
  // the number of servings in "servings".
  // the difficulty in "difficulty".

  // 2. DISPLAY THE DISH IMAGE
  // Find the image element with ID "dish-image".
  //     If the element and image path exist:
  //   - Set the image element's src to data.image.
  //   - Set its alt text to describe the dish.

  // 3. DISPLAY THE INGREDIENTS
  // Find the list element with ID "ingredients".
  // Clear any existing ingredient list items.
  // Check that data.ingredients is an array.
  // For each ingredient:
  //   - Create a new <li> element.
  //   - Set its textContent to the ingredient.
  //   - Append it to the ingredients list.

  // SECURITY:
  // Use textContent instead of inserting untrusted HTML.


  // 4. DISPLAY THE COOKING INSTRUCTION

  // 5. SET UP THE YOUTUBE RECIPE LINK

  // 6. DISPLAY REFERENCE LINKS
}

// Allow users to select an image from a webpage
// and use that exact image in the Cooks popup.
//
// Possible implementation:
// 1. Add a Chrome context-menu option when users right-click an image.
// 2. Capture the selected image URL using a background service worker.
// 3. Pass the image URL to the popup using chrome.storage or messaging.
// 4. Display the selected image instead of the default recipe image.


// Suugestion
// LIKE BUTTON

// PURPOSE:
// Allow the user to like or unlike the displayed recipe.

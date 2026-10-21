// PBI 1: EXTENSION SKELETON
 
// setText() and renderRecipe() now live in render-recipe.js (CooksRender),
// shared with the in-page Shadow DOM card (shadow-card.js).
 
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
 
    CooksRender.renderRecipe(response.data);
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
 
// The demo recipe and its documented shape now live in render-recipe.js
// as CooksRender.demoRecipe.
 
// Suugestion
// LIKE BUTTON
 
// PURPOSE:
// Allow the user to like or unlike the displayed recipe.
if (location.protocol === "chrome-extension:") {
  CooksRender.renderRecipe(CooksRender.demoRecipe);
}
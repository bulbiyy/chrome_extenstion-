let currentDishData = null;

// Load saved recipe result
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
      currentDishData = null;
      const error = response.error || {};
      const details = [
        error.code,
        Number.isInteger(error.status) ? `HTTP ${error.status}` : null
      ].filter(Boolean);
      const message = [
        error.message || "The recipe request could not be completed.",
        details.length ? `(${details.join(", ")})` : ""
      ].filter(Boolean).join(" ");
      CooksRender.renderMessage(message);
      return;
    }

    currentDishData = isValidDish(response.data) ? response.data : null;
    CooksRender.renderRecipe(response.data);
    if (currentDishData) {
      await updateSaveButtonState();
    } else {
      setSaveButtonEnabled(false);
    }
  } catch (error) {
    console.error("Could not load the recipe response:", error);
    currentDishData = null;
    setSaveButtonEnabled(false);
  }
}

function isValidDish(data) {
  return Boolean(
    data?.isDish === true &&
    typeof data.dishName === "string" &&
    data.dishName.trim() &&
    Number.isFinite(data.confidence) &&
    data.confidence >= 0.75 &&
    data.confidence <= 1 &&
    Array.isArray(data.recipe?.ingredients) &&
    data.recipe.ingredients.length > 0 &&
    data.recipe.ingredients.every((item) => typeof item === "string" && item.trim()) &&
    Array.isArray(data.recipe?.steps) &&
    data.recipe.steps.length > 0 &&
    data.recipe.steps.every((step) => typeof step === "string" && step.trim())
  );
}

function setSaveButtonEnabled(enabled) {
  const saveButton = document.getElementById("save-button");
  if (saveButton) {
    saveButton.disabled = !enabled;
    if (!enabled) {
      saveButton.setAttribute("aria-pressed", "false");
    }
  }
}

function setSaveStatus(message) {
  const status = document.getElementById("save-status");
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
}

function getSavedRecipeStorageKey(userId) {
  return `cooksSavedRecipes:${encodeURIComponent(userId)}`;
}

function getInstructionCharacterCount(recipe) {
  return recipe.steps.join("").length;
}

function isSameSavedRecipe(savedRecipe, dishData) {
  return typeof savedRecipe?.dishName === "string" &&
    savedRecipe.dishName.trim().toLocaleLowerCase() ===
      dishData.dishName.trim().toLocaleLowerCase() &&
    Array.isArray(savedRecipe.recipe?.steps) &&
    getInstructionCharacterCount(savedRecipe.recipe) ===
      getInstructionCharacterCount(dishData.recipe);
}

function isSavedDish(savedRecipes, dishData) {
  return savedRecipes.some((recipe) =>
    isSameSavedRecipe(recipe, dishData)
  );
}

async function updateSaveButtonState() {
  const saveButton = document.getElementById("save-button");
  if (!saveButton || !currentDishData) {
    setSaveButtonEnabled(false);
    return;
  }

  const userId = await CooksUserSession.getCurrentUser();
  const storageKey = getSavedRecipeStorageKey(userId);
  const stored = await chrome.storage.local.get(storageKey);
  const savedRecipes = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
  saveButton.disabled = false;
  saveButton.setAttribute(
    "aria-pressed",
    String(isSavedDish(savedRecipes, currentDishData))
  );
}

async function toggleSavedRecipe() {
  const saveButton = document.getElementById("save-button");
  if (!saveButton || !isValidDish(currentDishData)) {
    setSaveStatus("Only a valid generated dish can be saved.");
    return;
  }

  saveButton.disabled = true;
  setSaveStatus("");
  try {
    const userId = await CooksUserSession.getCurrentUser();
    const storageKey = getSavedRecipeStorageKey(userId);
    const stored = await chrome.storage.local.get(storageKey);
    const savedRecipes = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
    const alreadySaved = isSavedDish(savedRecipes, currentDishData);
    const updatedRecipes = alreadySaved
      ? savedRecipes.filter((recipe) =>
          !isSameSavedRecipe(recipe, currentDishData)
        )
      : [...savedRecipes, {
          ...currentDishData,
          savedAt: new Date().toISOString()
        }];

    await chrome.storage.local.set({ [storageKey]: updatedRecipes });
    saveButton.setAttribute("aria-pressed", String(!alreadySaved));
    setSaveStatus(alreadySaved
      ? "Removed from your saved recipes."
      : "Recipe saved to your account on this device.");
  } catch (error) {
    console.error("Could not save the recipe:", error);
    setSaveStatus("Could not update your saved recipes. Please try again.");
  } finally {
    saveButton.disabled = false;
  }
}
 
// Load selected recipe image
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

document.getElementById("save-button")?.addEventListener("click", toggleSavedRecipe);

const recipeFiles = document.getElementById("recipe-files");
const fileSelectionStatus = document.getElementById("file-selection-status");
const fileUploadButton = document.getElementById("file-upload-button");
let fileDragDepth = 0;
const MAX_UPLOADED_IMAGE_BYTES = 20 * 1024 * 1024;  // 15 MiB
const supportedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const supportedImageExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif"
]);

function isSupportedImage(file) {
  const mimeType = file.type.toLowerCase();
  if (mimeType) {
    return supportedImageTypes.has(mimeType);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && supportedImageExtensions.has(extension));
}

recipeFiles?.addEventListener("change", () => {
  if (!recipeFiles || !fileSelectionStatus) {
    return;
  }

  const files = Array.from(recipeFiles.files || []);
  const supportedFiles = files.filter(isSupportedImage);
  const oversizedFiles = supportedFiles.filter(
    (file) => file.size > MAX_UPLOADED_IMAGE_BYTES
  );
  const eligibleFiles = supportedFiles.filter(
    (file) => file.size <= MAX_UPLOADED_IMAGE_BYTES
  );
  const acceptedFiles = eligibleFiles.slice(0, 1);
  const rejectedFiles = files.filter((file) => !isSupportedImage(file));
  const additionalFiles = eligibleFiles.slice(1);
  const acceptedFileList = new DataTransfer();
  acceptedFiles.forEach((file) => acceptedFileList.items.add(file));
  recipeFiles.files = acceptedFileList.files;

  const messages = [];
  if (acceptedFiles.length) {
    messages.push(
      `Selected locally (not uploaded): ${acceptedFiles.map((file) => file.name).join(", ")}`
    );
  }
  if (rejectedFiles.length) {
    messages.push(
      `Rejected unsupported file types: ${rejectedFiles.map((file) => file.name).join(", ")}. Choose JPEG, PNG, WebP, HEIC, or HEIF images.`
    );
  }
  if (oversizedFiles.length) {
    messages.push(
      `Rejected files over 20 MiB: ${oversizedFiles.map((file) => file.name).join(", ")}.`
    );
  }
  if (additionalFiles.length) {
    messages.push(
      `Only one file can be selected. Not selected: ${additionalFiles.map((file) => file.name).join(", ")}.`
    );
  }

  fileSelectionStatus.hidden = messages.length === 0;
  fileSelectionStatus.textContent = messages.join(" ");
});

function containsDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

fileUploadButton?.addEventListener("dragenter", (event) => {
  if (!containsDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  fileDragDepth += 1;
  fileUploadButton.classList.add("is-dragging");
});

fileUploadButton?.addEventListener("dragover", (event) => {
  if (!containsDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

fileUploadButton?.addEventListener("dragleave", (event) => {
  if (!containsDraggedFiles(event)) {
    return;
  }

  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (fileDragDepth === 0) {
    fileUploadButton.classList.remove("is-dragging");
  }
});

fileUploadButton?.addEventListener("drop", (event) => {
  if (!containsDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  fileDragDepth = 0;
  fileUploadButton.classList.remove("is-dragging");

  if (!recipeFiles || !event.dataTransfer.files.length) {
    return;
  }

  const droppedFiles = new DataTransfer();
  Array.from(event.dataTransfer.files).forEach((file) => droppedFiles.items.add(file));
  recipeFiles.files = droppedFiles.files;
  recipeFiles.dispatchEvent(new Event("change", { bubbles: true }));
});

// Demo recipe preview
if (location.protocol === "chrome-extension:") {
  CooksRender.renderRecipe(CooksRender.demoRecipe);
}

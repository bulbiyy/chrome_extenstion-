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
  const saveButton = document.getElementById("favorite-button");
  if (saveButton) {
    saveButton.disabled = !enabled;
    if (!enabled) {
      saveButton.setAttribute("aria-pressed", "false");
      saveButton.textContent = "♡";
      saveButton.setAttribute("aria-label", "Add recipe to favorites");
      saveButton.title = "Add to favorites";
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
  const saveButton = document.getElementById("favorite-button");
  if (!saveButton || !currentDishData) {
    setSaveButtonEnabled(false);
    return;
  }

  const userId = await CooksUserSession.getCurrentUser();
  const storageKey = getSavedRecipeStorageKey(userId);
  const stored = await chrome.storage.local.get(storageKey);
  const savedRecipes = Array.isArray(stored[storageKey]) ? stored[storageKey] : [];
  const isSaved = isSavedDish(savedRecipes, currentDishData);
  saveButton.disabled = false;
  saveButton.setAttribute("aria-pressed", String(isSaved));
  saveButton.textContent = isSaved ? "♥" : "♡";
  saveButton.setAttribute("aria-label", isSaved ? "Remove recipe from favorites" : "Add recipe to favorites");
  saveButton.title = isSaved ? "Remove from favorites" : "Add to favorites";
}

async function toggleSavedRecipe() {
  const saveButton = document.getElementById("favorite-button");
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
          savedImage: document.getElementById("dish-image")?.src || "",
          savedAt: new Date().toISOString()
        }];

    await chrome.storage.local.set({ [storageKey]: updatedRecipes });
    saveButton.setAttribute("aria-pressed", String(!alreadySaved));
    saveButton.textContent = alreadySaved ? "♡" : "♥";
    saveButton.setAttribute("aria-label", alreadySaved ? "Add recipe to favorites" : "Remove recipe from favorites");
    saveButton.title = alreadySaved ? "Add to favorites" : "Remove from favorites";
    setSaveStatus(alreadySaved
      ? "Removed from your favorites."
      : "Recipe added to your favorites.");
    await refreshFavorites();
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

const authView = document.getElementById("auth-view");
const recipeView = document.getElementById("recipe-view");
const favoritesView = document.getElementById("favorites-view");
const accountView = document.getElementById("account-view");
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const authModeToggle = document.getElementById("auth-mode-toggle");
const ACCOUNT_STORE_KEY = "cooksAccounts";
let creatingAccount = false;
let activeProfile = null;

async function getAccounts() {
  const stored = await chrome.storage.local.get(ACCOUNT_STORE_KEY);
  return Array.isArray(stored[ACCOUNT_STORE_KEY]) ? stored[ACCOUNT_STORE_KEY] : [];
}

function makeSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 150000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), (value) => value.toString(16).padStart(2, "0")).join("");
}

function showView(view) {
  if (authView) authView.hidden = view !== "auth";
  if (recipeView) recipeView.hidden = view !== "recipe";
  if (favoritesView) favoritesView.hidden = view !== "favorites";
  if (accountView) accountView.hidden = view !== "account";
}

function setAuthMode(create) {
  creatingAccount = create;
  document.getElementById("username-field").hidden = !create;
  document.getElementById("auth-username").required = create;
  document.getElementById("auth-password").autocomplete = create ? "new-password" : "current-password";
  document.getElementById("auth-heading").textContent = create ? "Create your account" : "Welcome to Cooks";
  document.getElementById("auth-submit").textContent = create ? "Create account" : "Sign in";
  authModeToggle.textContent = create ? "Already have an account? Sign in" : "Create an account";
  authError.hidden = true;
}

function showAccount(profile) {
  activeProfile = profile;
  document.getElementById("account-username").textContent = profile.username;
  document.getElementById("account-email").textContent = profile.email;
}

async function refreshFavorites() {
  const userId = await CooksUserSession.getCurrentUser();
  const key = getSavedRecipeStorageKey(userId);
  const stored = await chrome.storage.local.get(key);
  const recipes = Array.isArray(stored[key]) ? stored[key] : [];
  const list = document.getElementById("favorites-list");
  if (!list) return;
  list.replaceChildren();
  document.getElementById("favorites-empty").hidden = recipes.length > 0;
  document.getElementById("favorites-count").textContent = String(recipes.length);
  for (const recipe of recipes) {
    const row = document.createElement("article");
    row.className = "favorite-item";
    const image = document.createElement("img");
    image.src = recipe.savedImage || chrome.runtime.getURL("assets/pasta.svg");
    image.alt = "";
    const name = document.createElement("strong");
    name.textContent = recipe.dishName;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "favorite-open";
    open.setAttribute("aria-label", `Open ${recipe.dishName} recipe`);
    open.textContent = "→";
    open.addEventListener("click", () => {
      CooksRender.renderRecipe(recipe);
      const dishImage = document.getElementById("dish-image");
      dishImage.src = recipe.savedImage || chrome.runtime.getURL("assets/pasta.svg");
      dishImage.alt = `Image of ${recipe.dishName}`;
      currentDishData = recipe;
      updateSaveButtonState();
      showView("recipe");
    });
    row.append(image, name, open);
    list.append(row);
  }
}

authModeToggle?.addEventListener("click", () => setAuthMode(!creatingAccount));
authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.hidden = true;
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  const username = document.getElementById("auth-username").value.trim();
  const password = document.getElementById("auth-password").value;
  try {
    const accounts = await getAccounts();
    let profile;
    if (creatingAccount) {
      if (accounts.some((account) => account.email === email)) throw new Error("An account with this email already exists.");
      const salt = makeSalt();
      profile = { userId: email, email, username, salt, passwordHash: await hashPassword(password, salt) };
      await chrome.storage.local.set({ [ACCOUNT_STORE_KEY]: [...accounts, profile] });
    } else {
      profile = accounts.find((account) => account.email === email);
      if (!profile || profile.passwordHash !== await hashPassword(password, profile.salt)) throw new Error("Email or password is incorrect.");
    }
    const sessionProfile = { userId: profile.userId, email: profile.email, username: profile.username };
    await CooksUserSession.signIn(sessionProfile);
    showAccount(sessionProfile);
    showView("recipe");
    await updateSaveButtonState();
    await refreshFavorites();
  } catch (error) {
    authError.textContent = error.message || "Could not sign in. Please try again.";
    authError.hidden = false;
  }
});

document.getElementById("show-favorites")?.addEventListener("click", async () => { await refreshFavorites(); showView("favorites"); });
document.getElementById("show-recipe")?.addEventListener("click", () => showView("recipe"));
document.getElementById("back-from-favorites")?.addEventListener("click", () => showView("recipe"));
document.getElementById("account-button")?.addEventListener("click", () => showView("account"));
document.getElementById("favorites-account-button")?.addEventListener("click", () => showView("account"));
document.getElementById("back-from-account")?.addEventListener("click", () => showView("recipe"));

async function signOutToLogin() {
  await CooksUserSession.signOut();
  activeProfile = null;
  authForm.reset();
  setAuthMode(false);
  showView("auth");
}

document.getElementById("sign-out")?.addEventListener("click", signOutToLogin);
document.getElementById("switch-account")?.addEventListener("click", signOutToLogin);
document.getElementById("delete-account")?.addEventListener("click", async () => {
  if (!activeProfile || !confirm("Delete this account and its saved recipes from this device?")) return;
  const accounts = await getAccounts();
  await chrome.storage.local.set({ [ACCOUNT_STORE_KEY]: accounts.filter((account) => account.userId !== activeProfile.userId) });
  await chrome.storage.local.remove(getSavedRecipeStorageKey(activeProfile.userId));
  await signOutToLogin();
});

document.getElementById("change-password-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("account-error");
  error.hidden = true;
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const accounts = await getAccounts();
  const index = accounts.findIndex((account) => account.userId === activeProfile?.userId);
  if (index < 0 || accounts[index].passwordHash !== await hashPassword(current, accounts[index].salt)) {
    error.textContent = "Current password is incorrect.";
    error.hidden = false;
    return;
  }
  const salt = makeSalt();
  accounts[index] = { ...accounts[index], salt, passwordHash: await hashPassword(next, salt) };
  await chrome.storage.local.set({ [ACCOUNT_STORE_KEY]: accounts });
  event.target.reset();
  error.textContent = "Password updated.";
  error.hidden = false;
});

(async () => {
  if (!authView) return;
  const userId = await CooksUserSession.getCurrentUser();
  if (userId === "anonymous") {
    showView("auth");
    return;
  }
  const profile = (await getAccounts()).find((account) => account.userId === userId);
  if (!profile) {
    await CooksUserSession.signOut();
    showView("auth");
    return;
  }
  const sessionProfile = { userId: profile.userId, email: profile.email, username: profile.username };
  showAccount(sessionProfile);
  showView("recipe");
  await updateSaveButtonState();
  await refreshFavorites();
})();

document.getElementById("favorite-button")?.addEventListener("click", toggleSavedRecipe);

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
  currentDishData = {
    isDish: true,
    confidence: 1,
    dishName: CooksRender.demoRecipe.name,
    recipe: {
      ingredients: CooksRender.demoRecipe.ingredients,
      steps: CooksRender.demoRecipe.instructions,
    },
    category: CooksRender.demoRecipe.category,
    description: CooksRender.demoRecipe.description,
    cookTime: CooksRender.demoRecipe.cookTime,
    servings: CooksRender.demoRecipe.servings,
    difficulty: CooksRender.demoRecipe.difficulty,
  };
  updateSaveButtonState();
}

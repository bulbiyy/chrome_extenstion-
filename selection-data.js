// Retrieve the saved highlighted text, or null when there is no usable selection.
async function getSelectedText() {
  const result = await chrome.storage.local.get("selectedText");
  return typeof result.selectedText === "string" && result.selectedText.trim()
    ? result.selectedText.trim()
    : null;
}

// Retrieve the saved image URL, or null when no image was selected.
async function getSelectedImage() {
  const result = await chrome.storage.local.get("selectedImageUrl");
  return typeof result.selectedImageUrl === "string" && result.selectedImageUrl
    ? result.selectedImageUrl
    : null;
}

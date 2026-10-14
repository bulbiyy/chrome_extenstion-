async function getSelectedText() {
  const result = await chrome.storage.local.get("selectedText");
  return typeof result.selectedText === "string" && result.selectedText.trim()
    ? result.selectedText.trim()
    : null;
}

async function getSelectedImage() {
  const result = await chrome.storage.local.get("selectedImageUrl");
  return typeof result.selectedImageUrl === "string" && result.selectedImageUrl
    ? result.selectedImageUrl
    : null;
}

const IMAGE_MENU_ID = "use-image-in-dishfind";
const TEXT_MENU_ID = "use-text-in-dishfind";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("Could not reset DishFind's context menu:", chrome.runtime.lastError.message);
      return;
    }

    chrome.contextMenus.create(
      {
        id: IMAGE_MENU_ID,
        title: "Use image in DishFind",
        contexts: ["image"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create DishFind's context menu:", chrome.runtime.lastError.message);
        }
      }
    );

    chrome.contextMenus.create(
      {
        id: TEXT_MENU_ID,
        title: "Use selected text in DishFind",
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Could not create DishFind's text menu:", chrome.runtime.lastError.message);
        }
      }
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== IMAGE_MENU_ID && info.menuItemId !== TEXT_MENU_ID) {
    return;
  }

  if (!tab || typeof tab.windowId !== "number") {
    console.error("Could not determine which browser window to open DishFind in.");
    return;
  }

  let selection;
  if (info.menuItemId === IMAGE_MENU_ID) {
    if (!info.srcUrl) {
      return;
    }

    let imageUrl;
    try {
      imageUrl = new URL(info.srcUrl);
    } catch (error) {
      console.error("The selected image URL is invalid:", error);
      return;
    }

    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
      console.error("DishFind can only use images with HTTP or HTTPS URLs.");
      return;
    }

    selection = {
      selectedImageUrl: imageUrl.href,
      selectedText: ""
    };
  } else {
    const selectedText = info.selectionText?.trim();
    if (!selectedText) {
      return;
    }

    selection = { selectedText };
  }

  chrome.storage.local.set(selection)
    .then(() => chrome.action.openPopup({ windowId: tab.windowId }))
    .catch((error) => {
      console.error("Could not save the selection or open DishFind:", error);
    });
});

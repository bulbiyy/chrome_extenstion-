(() => {
  if (globalThis.__cooksCardLoaded) return;
  globalThis.__cooksCardLoaded = true;
 
  const HOST_ID = "cooks-card-host";
  const TEST_IMAGE = "assets/pasta.svg";
  let host = null;
  let shadow = null;
 
  // Same markup as popup.html, wrapped in .cooks-shell (no <body> in a shadow tree).
  const CARD_HTML = `
    <div class="cooks-shell">
      <main class="recipe-card" aria-labelledby="dish-name">
        <div class="topline">
          <span class="brand-mark" aria-hidden="true">c.</span>
          <span class="brand-name">Cooks</span>
          <div class="header-actions">
            <button class="icon-button like-button" id="like-button" type="button"
              aria-label="Like this recipe" aria-pressed="false" title="Like recipe">♡</button>
            <button class="icon-button save-button" id="save-button" type="button"
              aria-label="Save this recipe for later" aria-pressed="false" title="Save recipe">♧</button>
          </div>
        </div>
        <div class="hero-wrap">
          <img id="dish-image" class="hero-image" alt="">
          <span class="image-tag" id="image-tag">RECIPE IDEA</span>
        </div>
        <section class="recipe-content">
          <p class="eyebrow" id="recipe-category"></p>
          <h1 id="dish-name"></h1>
          <p class="recipe-status" id="recipe-status" role="status" aria-live="polite" hidden></p>
          <p class="description" id="dish-description"></p>
          <div class="meta-row" aria-label="Recipe details">
            <span><span aria-hidden="true">◷</span> <strong id="cook-time"></strong></span>
            <span><span aria-hidden="true">♧</span> <strong id="servings"></strong></span>
            <span class="difficulty" id="difficulty"></span>
          </div>
          <div class="section-heading">
            <h2>What you'll need</h2><span class="small-note">INGREDIENTS</span>
          </div>
          <ul id="ingredients" class="ingredient-list"></ul>
          <div class="section-heading steps-heading">
            <h2>Make it</h2><span class="small-note">IN A FEW STEPS</span>
          </div>
          <ol id="instructions" class="steps-list"></ol>
          <a id="youtube-link" class="video-link" target="_blank" rel="noopener noreferrer">
            <span class="play-icon" aria-hidden="true">▶</span>
            <span><strong>Watch a recipe video</strong><small>YouTube · cooking walkthroughs</small></span>
            <span class="link-arrow" aria-hidden="true">↗</span>
          </a>
          <div class="references-block">
            <h2>References</h2>
            <div id="references" class="reference-list"></div>
          </div>
          <p class="footer-note">A starting point for your next meal ✳</p>
        </section>
      </main>
    </div>`;
 
  function openCard(data = CooksRender.demoRecipe, options = {}) {
    closeCard();
 
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "all: initial; position: fixed; top: 16px; right: 16px; " +
      "z-index: 2147483647; max-height: calc(100vh - 32px); overflow-y: auto;";
 
    shadow = host.attachShadow({ mode: "open" });
 
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("popup.css");
    shadow.append(stylesheet);
 
    const wrapper = document.createElement("div");
    wrapper.innerHTML = CARD_HTML; 
    shadow.append(wrapper);
 
    document.documentElement.append(host);
 
    if (data) CooksRender.renderRecipe(data, shadow); 
    if (options.title) CooksRender.setText("dish-name", options.title, "", shadow);
    setStatus(options.status);
    setImage(shadow, options.imageUrl);
    enableDismiss();
  }
 
  // re-render the open card with new data 
  function updateCard(data) {
    if (host && shadow) CooksRender.renderRecipe(data, shadow);
  }
 
  // show the status line inside the card.
  function setStatus(message) {
    const status = shadow?.getElementById("recipe-status");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
  }
 
  function setImage(root, imageUrl) {
    const image = root.getElementById("dish-image");
    const tag = root.getElementById("image-tag");
    const testUrl = chrome.runtime.getURL(TEST_IMAGE);
    if (!image) return;
 
    // if a selected image can't load use test image.
    image.addEventListener("error", () => {
      if (image.src !== testUrl) {
        image.src = testUrl;
        image.alt = "Illustration of a bowl of tomato pasta";
        if (tag) tag.textContent = "RECIPE IDEA";
      }
    });
 
    if (imageUrl) {
      image.src = imageUrl;
      image.alt = "Image selected from a webpage";
      if (tag) tag.textContent = "SELECTED IMAGE";
    } else {
      image.src = testUrl;
      image.alt = "Illustration of a bowl of tomato pasta";
    }
  }
 
  function closeCard() {
    disableDismiss();
    if (host) host.remove();
    host = null;
    shadow = null;
  }
 
  // outside-click dismiss
  function onPointerDownOutside(event) {
    if (host && !event.composedPath().includes(host)) {
      closeCard();
    }
  }
 
  function onKeyDown(event) {
    if (event.key === "Escape") closeCard();
  }
 

  function onWindowBlur() {
    setTimeout(() => {
      if (host && document.activeElement?.tagName === "IFRAME") closeCard();
    }, 0);
  }
 
  // listeners exist only while a card is open.
  function enableDismiss() {
    document.addEventListener("pointerdown", onPointerDownOutside, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
  }
 
  function disableDismiss() {
    document.removeEventListener("pointerdown", onPointerDownOutside, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onWindowBlur);
  }

  globalThis.__cooksCard = {
    open: openCard,
    update: updateCard,
    setStatus,
    close: closeCard,
    isOpen: () => host !== null
  };
})();
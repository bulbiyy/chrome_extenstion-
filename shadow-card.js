// PBI 20: show the Cooks card on top of the current page inside a Shadow DOM,
// so the site's CSS can't break the card and our CSS can't leak into the site.
// Content script. Needs render-recipe.js loaded first (see manifest.json).

(() => {
  if (globalThis.__cooksCardLoaded) return;
  globalThis.__cooksCardLoaded = true;

  const HOST_ID = "cooks-card-host";
  const TEST_IMAGE = "assets/pasta.svg";
  let host = null;

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

  // `data` can be a Gemini result ({ isDish, dishName, recipe }) or the demo shape.
  // `options.imageUrl` optionally replaces the bundled test image.
  function openCard(data = CooksRender.demoRecipe, options = {}) {
    closeCard();

    host = document.createElement("div");
    host.id = HOST_ID;
    // Inline styles on the host only: pin it above the page.
    host.style.cssText =
      "all: initial; position: fixed; top: 16px; right: 16px; " +
      "z-index: 2147483647; max-height: calc(100vh - 32px); overflow-y: auto;";

    const shadow = host.attachShadow({ mode: "open" });

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("popup.css");
    shadow.append(stylesheet);

    const wrapper = document.createElement("div");
    wrapper.innerHTML = CARD_HTML; // static, trusted markup (no page data)
    shadow.append(wrapper);

    document.documentElement.append(host);

    CooksRender.renderRecipe(data, shadow); // render into the shadow root
    setImage(shadow, options.imageUrl);
  }

  function setImage(shadow, imageUrl) {
    const image = shadow.getElementById("dish-image");
    const tag = shadow.getElementById("image-tag");
    const testUrl = chrome.runtime.getURL(TEST_IMAGE);
    if (!image) return;

    // If a selected image can't load (blocked/hotlink-protected), use the test image.
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
    if (host) host.remove();
    host = null;
  }

  // TEMPORARY test trigger for PBI 20: Ctrl+Shift+Y toggles the demo card.
  // PBI 13 (lookup button) will call __cooksCard.open() instead.
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "y") {
      host ? closeCard() : openCard();
    }
  });

  // Same content-script world as content.js, so later PBIs can call these.
  globalThis.__cooksCard = { open: openCard, close: closeCard, isOpen: () => host !== null };
})();

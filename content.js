// PBI 20: Render the Cooks card inside a Shadow DOM so the host page's CSS
// can't break our styles and our CSS can't leak into the page.
// Depends on popup.js (loaded first via manifest) for `recipe` and `renderRecipe`.
 
(() => {
  const HOST_ID = "cooks-extension-host";
  let host = null;
 
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
          <span class="image-tag">RECIPE IDEA</span>
        </div>
        <section class="recipe-content">
          <p class="eyebrow" id="recipe-category"></p>
          <h1 id="dish-name"></h1>
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
 
  function openCard(data = recipe) {
    closeCard();
 
    host = document.createElement("div");
    host.id = HOST_ID;
    // Inline styles on the host only: position it above the page.
    host.style.cssText =
      "all: initial; position: fixed; top: 16px; right: 16px; " +
      "z-index: 2147483647; max-height: calc(100vh - 32px); overflow-y: auto;";
 
    const shadow = host.attachShadow({ mode: "open" });
 
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("popup.css");
    shadow.appendChild(link);
 
    const wrapper = document.createElement("div");
    wrapper.innerHTML = CARD_HTML; // static, trusted markup (no page data)
    shadow.appendChild(wrapper);
 
    document.documentElement.appendChild(host);
    renderRecipe(data, shadow); // render into the shadow root, not document
  }
 
  function closeCard() {
    if (host) host.remove();
    host = null;
  }
 
  // Lookup button
  const BTN_HOST_ID = "cooks-lookup-host";
  //working only for short string for now
  const MAX_SELECTION_LENGTH = 200; 
  let btnHost = null;
  let lastLookupText = "";
 
  const BUTTON_HTML = `
    <style>
      button {
        all: initial;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 999px;
        background: #d85b3f;
        color: #fff;
        font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        white-space: nowrap;
      }
      button:hover { background: #a83d2a; }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    </style>
    <button type="button" aria-label="Look up this dish with Cooks">Find Recipe</button>`;
 
  function hideLookupButton() {
    if (btnHost) btnHost.remove();
    btnHost = null;
  }
 
  function showLookupButton(rect, text) {
    hideLookupButton();
    lastLookupText = text;
 
    const BTN_W = 120;
    const BTN_H = 32;
    let top = rect.bottom + 8;
    if (top + BTN_H > window.innerHeight) top = Math.max(8, rect.top - BTN_H - 8);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - BTN_W - 8);
 
    btnHost = document.createElement("div");
    btnHost.id = BTN_HOST_ID;
    btnHost.style.cssText =
      `all: initial; position: fixed; top: ${top}px; left: ${left}px; z-index: 2147483647;`;
 
    const shadow = btnHost.attachShadow({ mode: "open" });
    shadow.innerHTML = BUTTON_HTML; 
 
    const button = shadow.querySelector("button");
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", handleLookup);
 
    document.documentElement.appendChild(btnHost);
  }
 
  // Hook for the Gemini work: `lastLookupText` 
  function handleLookup() {
    hideLookupButton();
    openCard(recipe);
  }
 
  function checkSelection(e) {
    // Ignore clicks inside our own UI (button or card).
    if (e && e.composedPath().some((n) => n === btnHost || n === host)) return;
 
    // Wait a tick so the browser has finished updating the selection.
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text || text.length > MAX_SELECTION_LENGTH || sel.rangeCount === 0) {
        hideLookupButton();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hideLookupButton();
        return;
      }
      showLookupButton(rect, text);
    }, 0);
  }
 
  document.addEventListener("mouseup", checkSelection);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key.startsWith("Arrow")) checkSelection(e);
  });
  document.addEventListener("scroll", hideLookupButton, true);
 
  window.__cooks = {
    openCard,
    closeCard,
    getSelectedText: () => lastLookupText
  };
})();
 
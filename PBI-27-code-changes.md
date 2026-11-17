# PBI 27: Loading indicator UI

## `lookup.js`

Text and image lookups open the card with a loading message and indicator enabled:

```js
{ title: text, status: "Finding a recipe…", loading: true }
```

```js
{ imageUrl, title: "Selected image", status: "Looking at this image…", loading: true }
```

## `shadow-card.js`

The card activates the shared loading state when opened for a lookup:

```js
if (options.loading) CooksRender.setLoading(true, shadow, options.status);
else setStatus(options.status);
```

The card exposes a loading method to lookup code:

```js
setLoading: (message) => {
  if (shadow) CooksRender.setLoading(true, shadow, message);
},
```

## `render-recipe.js`

The shared renderer displays the accessible loading message and clears it when loading ends:

```js
function setLoading(loading, root = document, message = "Finding a recipe…") {
  const status = root.getElementById("recipe-status");
  if (!status) return;
  status.classList?.toggle("is-loading", loading);
  status.setAttribute?.("aria-busy", String(loading));
  if (loading) {
    status.hidden = false;
    status.textContent = message;
  } else {
    status.classList?.remove("is-loading");
    status.hidden = true;
    status.textContent = "";
  }
}
```

The renderer exports it for use by the card:

```js
globalThis.CooksRender = { demoRecipe, setText, renderRecipe, renderMessage, setLoading };
```

## `popup.css`

The loading message displays a small animated spinner:

```css
.recipe-status.is-loading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recipe-status.is-loading::before {
  content: "";
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
  border: 2px solid #e8c9bf;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: recipe-loading-spin 0.75s linear infinite;
}

@keyframes recipe-loading-spin {
  to { transform: rotate(360deg); }
}
```

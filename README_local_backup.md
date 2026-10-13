# Cooks Chrome Extension Sprint )

This is a minimal Chrome Extension Manifest V3 starter for the team's recipe popup UI.

## Current demo
- Hardcoded recipe object in `popup.js`.
- Rounded recipe card with image, recipe title, cooking details, ingredients, steps, YouTube search link, and reference links.
- Like button interaction (visual only; it is not persisted yet).
- Defensive rendering for absent fields and malformed reference URLs.

## Team integration contract
The `recipe` object in `popup.js` is the placeholder data shape. Teammates can replace its values or call `renderRecipe(recipeData)` when API/classification output is ready. Keep UI rendering separate from API calls.

```js
{
  name: "Dish name",
  category: "CATEGORY LABEL",
  description: "Short description",
  image: "assets/dish.svg",
  cookTime: "25 min",
  servings: "2 servings",
  difficulty: "Easy",
  ingredients: ["ingredient 1", "ingredient 2"],
  instructions: ["step 1", "step 2"],
  youtubeSearchUrl: "https://www.youtube.com/results?search_query=...",
  references: [{ label: "Reference name", url: "https://example.com" }]
}
```

## Important next steps
- This is the **popup** version. A popup that appears beside selected text or over the current webpage (like the screenshot) requires a content script and a trigger/positioning mechanism; that is separate from the toolbar popup and can be added once the team confirms how it should open.
- The demo contains no Gemini API call. API calls and secret handling should be implemented in the appropriate service/backend by the Illia and Ayushi owning that work.
- Recipe and reference data here are sample content for UI development, not real impementation.

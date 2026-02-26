# Wishlist Starter (GitHub Pages)

Simple static wishlist website with:
- Add item name + product link
- Optional product photo link
- Category, priority, price, size, color, and note fields
- Full `Edit item` button on each card (edit all fields)
- Filters (`All`, `Not bought`, `Bought`)
- Search
- Local browser save (uses `localStorage`)

## Files
- `index.html`
- `styles.css`
- `script.js`

## Run locally
Open `index.html` in your browser.

## Publish to GitHub Pages
1. Create a GitHub repo and put these files in the root.
2. Commit and push to `main` (or your default branch).
3. In GitHub, go to `Settings` -> `Pages`.
4. Under `Build and deployment`, choose:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` and `/ (root)`
5. Save, then wait about 1-2 minutes.
6. Your site will be at:
   - `https://<your-username>.github.io/<repo-name>/`

## Customize quickly
- Edit starter items in `script.js` (`STARTER_ITEMS`).
- Edit colors/fonts in `styles.css` (`:root` variables).
- Add your own product photos by pasting image links in the `Photo link` field.

# Quick Translate

A Manifest V3 extension (Chromium / Helium) for on the fly translation of
selected text and full page translation, using the public (unofficial)
`translate.googleapis.com` endpoint.

## Installation (dev, unpacked)

1. Open `chrome://extensions` (works the same in Helium).
2. Turn on "Developer mode" in the top right corner.
3. Click "Load unpacked" and select this folder.
4. The icon will appear in the toolbar.

## Usage

The extension UI (menus and popup) is in Italian, so the labels below are
quoted as they appear on screen.

- **Translate selection**: select some text, then right click and choose
  "Traduci selezione" (Translate selection). A popup appears with the
  original text and the translation.
- **Full page translation**: right click on the page and choose
  "Traduci pagina intera" (Translate whole page), or open the extension
  popup and click the matching button.
- **Restore**: right click and choose "Ripristina pagina originale"
  (Restore original page), or use the button in the popup, to go back to
  the original text without reloading the page.
- **Target language**: set from the toolbar popup (stored in
  `chrome.storage.sync`, defaults to `it`).
- **Keyboard shortcuts**: visible in the toolbar popup, under
  "Scorciatoie da tastiera" (Keyboard shortcuts). Suggested defaults
  (customizable from `chrome://extensions/shortcuts`, also linked directly
  from the popup):
  - `Ctrl+Shift+Y` (`Cmd+Shift+Y` on Mac): translate the selected text
  - `Ctrl+Shift+U` (`Cmd+Shift+U` on Mac): translate the whole page
  - `Ctrl+Shift+O` (`Cmd+Shift+O` on Mac): restore the original page

## Project structure

```
quick-translate/
├── manifest.json      Extension manifest (Manifest V3)
├── src/
│   ├── background.js  Service worker: context menus, shortcuts, translation calls
│   ├── content.js     Injected in every page: selection popup, full page translation
│   ├── content.css    Styles for the floating popup and the page toast
│   ├── popup.html     Toolbar popup UI
│   └── popup.js       Toolbar popup logic
├── icons/
├── PRIVACY.md
└── CHANGELOG.md
```

## Technical notes

- No API key required: it uses the public `dt=t` endpoint of Google
  Translate. This is not an officially supported use of Google services.
  For a production project it is better to switch to the Cloud Translation
  API or DeepL (just replace `translateRaw()` in `src/background.js`).
- Full page translation groups text nodes into blocks (about 1600
  characters) joined by `\n` to reduce the number of requests; if the
  number of translated lines does not match the original, the block is
  retranslated node by node as a fallback.
- `script`, `style`, `noscript`, `textarea`, `input`, `code`, `pre` and
  `contenteditable` elements are excluded.
- Permissions are kept minimal on purpose: no `<all_urls>` in the
  permissions (content scripts are declared via `content_scripts`, and the
  fetch to Google Translate is isolated in `host_permissions`).

## Known limitations

- The public endpoint comes with no SLA and no documented rate limits:
  heavy use can result in temporary blocks by Google.
- Very dynamic pages (SPAs with continuous re-rendering) may need a new
  translation after route changes, since there is no active
  `MutationObserver` in this v1.

## Privacy

See [PRIVACY.md](PRIVACY.md) for what data leaves the browser and where it
goes.

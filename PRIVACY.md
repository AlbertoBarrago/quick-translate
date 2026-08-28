# Privacy Policy — Quick Translate

Quick Translate does not collect, store, or sell any personal data.

## What is sent, and where

- When you select text or trigger a full page translation, the text is sent
  to Google's public translation endpoint (`translate.googleapis.com`) to
  obtain the translated text. This is the only network request the
  extension makes.
- No text, browsing history, or usage data is sent to the extension author
  or to any third party other than the translation endpoint above.

## What is stored locally

- Your preferred target language is stored in `chrome.storage.sync` (synced
  across your signed-in browser instances by the browser itself). It never
  leaves the browser's own sync mechanism.

## Permissions

- `activeTab`, `scripting`: used to run the translation logic on the page
  you are currently viewing, and to inject the content script when it is
  not already active.
- `storage`: used to save the target language preference.
- `contextMenus`: used to add the "Translate selection" / "Translate whole
  page" / "Restore" entries to the right-click menu.
- `host_permissions` on `translate.googleapis.com`: required to call the
  translation endpoint.

## Contact

For questions about this policy, contact the author via the repository
listed in the extension's store page.

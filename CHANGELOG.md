# Changelog

All notable changes to this project are documented in this file.

## [1.0.1]

- Project restructured under `src/` for the extension source files;
  `manifest.json`, icons, and docs stay at the repository root.
- Background script and popup now re-inject the content script and retry
  the message when a tab has none active (e.g. a tab opened before install
  or after a service worker restart), instead of silently failing.
- Full page translation shows an on-page status toast while it runs and on
  completion/error, instead of failing silently.
- Popup shows an inline status message when a tab can't be translated.
- Added `PRIVACY.md` and `.gitignore`.
- All code comments translated to English.
- Throttled translation requests and added a retry-with-backoff on HTTP 429
  from Google Translate, since the per-node fallback in full page
  translation could otherwise burst many requests at once and trigger the
  rate limit almost immediately.

## [1.0.0]

- Initial release: selection translation, full page translation and
  restore, right-click menu, keyboard shortcuts, target language stored in
  `chrome.storage.sync`.
- Translation via the public `translate.googleapis.com` endpoint.

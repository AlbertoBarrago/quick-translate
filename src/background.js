// background.js — service worker (Manifest V3)

const DEFAULT_TARGET_LANG = "it";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "qt-translate-selection",
    title: "Traduci selezione",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "qt-translate-page",
    title: "Traduci pagina intera",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "qt-restore-page",
    title: "Ripristina pagina originale",
    contexts: ["page"]
  });

  chrome.storage.sync.get("targetLang", (data) => {
    if (!data.targetLang) {
      chrome.storage.sync.set({ targetLang: DEFAULT_TARGET_LANG });
    }
  });
});

// Injects the content script/CSS into a tab with no active receiver.
// Needed for tabs opened before the extension was installed/reloaded, or
// after the service worker restarted. Fails silently on pages where
// injection isn't allowed (chrome://, Web Store, etc.).
async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
}

// Sends a message to the tab; if there's no receiver, re-inject the
// content script and retry once, so the user isn't left without a response.
function sendMessageWithRetry(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    if (!chrome.runtime.lastError) return;

    injectContentScript(tabId)
      .then(() => chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError))
      .catch(() => {
        // page can't be translated (chrome://, Web Store, etc.): no further recovery possible
      });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "qt-translate-selection") {
    sendMessageWithRetry(tab.id, { type: "QT_TRANSLATE_SELECTION", text: info.selectionText || "" });
  } else if (info.menuItemId === "qt-translate-page") {
    sendMessageWithRetry(tab.id, { type: "QT_TRANSLATE_PAGE" });
  } else if (info.menuItemId === "qt-restore-page") {
    sendMessageWithRetry(tab.id, { type: "QT_RESTORE_PAGE" });
  }
});

// Keyboard shortcuts (chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    if (command === "translate-selection") {
      sendMessageWithRetry(tabId, { type: "QT_COMMAND_TRANSLATE_SELECTION" });
    } else if (command === "translate-page") {
      sendMessageWithRetry(tabId, { type: "QT_TRANSLATE_PAGE" });
    } else if (command === "restore-page") {
      sendMessageWithRetry(tabId, { type: "QT_RESTORE_PAGE" });
    }
  });
});

// Calls the public (unofficial) Google Translate endpoint.
async function translateRaw(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx&sl=auto&tl=" +
    encodeURIComponent(targetLang) +
    "&dt=t&q=" +
    encodeURIComponent(text);

  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("Errore traduzione: HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  // data[0] is an array of segments [translatedText, originalText, ...]
  return data[0].map((segment) => segment[0]).join("");
}

// Messages from the content script: single or chunked translation.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QT_TRANSLATE_TEXT") {
    (async () => {
      try {
        const { targetLang } = await chrome.storage.sync.get("targetLang");
        const lang = targetLang || DEFAULT_TARGET_LANG;
        const translated = await translateRaw(message.text, lang);
        sendResponse({ ok: true, translated });
      } catch (err) {
        sendResponse({ ok: false, error: String(err), status: err.status });
      }
    })();
    return true; // async response
  }

  if (message.type === "QT_GET_TARGET_LANG") {
    chrome.storage.sync.get("targetLang", (data) => {
      sendResponse({ targetLang: data.targetLang || DEFAULT_TARGET_LANG });
    });
    return true;
  }
});

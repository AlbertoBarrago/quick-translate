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

function swallowNoReceiver() {
  if (chrome.runtime.lastError) {
    // Nessun content script sulla tab (pagina chrome://, tab pre-installazione, ecc.)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "qt-translate-selection") {
    chrome.tabs.sendMessage(
      tab.id,
      { type: "QT_TRANSLATE_SELECTION", text: info.selectionText || "" },
      swallowNoReceiver
    );
  } else if (info.menuItemId === "qt-translate-page") {
    chrome.tabs.sendMessage(tab.id, { type: "QT_TRANSLATE_PAGE" }, swallowNoReceiver);
  } else if (info.menuItemId === "qt-restore-page") {
    chrome.tabs.sendMessage(tab.id, { type: "QT_RESTORE_PAGE" }, swallowNoReceiver);
  }
});

// Scorciatoie da tastiera (chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    if (command === "translate-selection") {
      chrome.tabs.sendMessage(tabId, { type: "QT_COMMAND_TRANSLATE_SELECTION" }, swallowNoReceiver);
    } else if (command === "translate-page") {
      chrome.tabs.sendMessage(tabId, { type: "QT_TRANSLATE_PAGE" }, swallowNoReceiver);
    } else if (command === "restore-page") {
      chrome.tabs.sendMessage(tabId, { type: "QT_RESTORE_PAGE" }, swallowNoReceiver);
    }
  });
});

// Richiama l'endpoint pubblico (non ufficiale) di Google Translate.
async function translateRaw(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx&sl=auto&tl=" +
    encodeURIComponent(targetLang) +
    "&dt=t&q=" +
    encodeURIComponent(text);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Errore traduzione: HTTP " + res.status);
  }
  const data = await res.json();
  // data[0] è un array di segmenti [testoTradotto, testoOriginale, ...]
  return data[0].map((segment) => segment[0]).join("");
}

// Messaggi dal content script: traduzione singola o a blocchi.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QT_TRANSLATE_TEXT") {
    (async () => {
      try {
        const { targetLang } = await chrome.storage.sync.get("targetLang");
        const lang = targetLang || DEFAULT_TARGET_LANG;
        const translated = await translateRaw(message.text, lang);
        sendResponse({ ok: true, translated });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // risposta asincrona
  }

  if (message.type === "QT_GET_TARGET_LANG") {
    chrome.storage.sync.get("targetLang", (data) => {
      sendResponse({ targetLang: data.targetLang || DEFAULT_TARGET_LANG });
    });
    return true;
  }
});

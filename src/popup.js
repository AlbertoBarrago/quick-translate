const langSelect = document.getElementById("lang");
const translateBtn = document.getElementById("translatePage");
const restoreBtn = document.getElementById("restorePage");

chrome.storage.sync.get("targetLang", (data) => {
  langSelect.value = data.targetLang || "it";
});

langSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ targetLang: langSelect.value });
});

const statusEl = document.getElementById("status");

function showStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle("status-error", !!isError);
  statusEl.classList.add("status-visible");
}

function clearStatus() {
  statusEl.classList.remove("status-visible", "status-error");
  statusEl.textContent = "";
}

// Injects content script/CSS into a tab with no active receiver (tab
// opened before install, service worker restarted, etc.) and retries.
async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
}

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    chrome.tabs.sendMessage(tabId, message, () => {
      if (!chrome.runtime.lastError) {
        clearStatus();
        return;
      }

      showStatus("Preparazione della pagina in corso…", false);

      injectContentScript(tabId)
        .then(
          () =>
            new Promise((resolve) => {
              chrome.tabs.sendMessage(tabId, message, () => resolve(!chrome.runtime.lastError));
            })
        )
        .then((ok) => {
          if (ok) {
            clearStatus();
          } else {
            showStatus("Impossibile tradurre questa pagina.", true);
          }
        })
        .catch(() => {
          showStatus(
            "Questa pagina non supporta la traduzione (es. chrome://, Web Store).",
            true
          );
        });
    });
  });
}

translateBtn.addEventListener("click", () => {
  sendToActiveTab({ type: "QT_TRANSLATE_PAGE" });
});

restoreBtn.addEventListener("click", () => {
  sendToActiveTab({ type: "QT_RESTORE_PAGE" });
});

// ---------- Keyboard shortcuts ----------
const COMMAND_LABELS = {
  "translate-selection": "Traduci selezione",
  "translate-page": "Traduci pagina intera",
  "restore-page": "Ripristina originale"
};

function renderShortcuts(commands) {
  const list = document.getElementById("shortcutsList");
  list.innerHTML = "";

  commands
    .filter((c) => c.name && c.name !== "_execute_action")
    .forEach((c) => {
      const row = document.createElement("div");
      row.className = "shortcut-row";

      const label = document.createElement("span");
      label.textContent = COMMAND_LABELS[c.name] || c.description || c.name;

      const key = document.createElement("span");
      key.className = "shortcut-key" + (c.shortcut ? "" : " unset");
      key.textContent = c.shortcut || "non impostata";

      row.appendChild(label);
      row.appendChild(key);
      list.appendChild(row);
    });
}

chrome.commands.getAll((commands) => renderShortcuts(commands));

document.getElementById("editShortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

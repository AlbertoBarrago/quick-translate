const langSelect = document.getElementById("lang");
const translateBtn = document.getElementById("translatePage");
const restoreBtn = document.getElementById("restorePage");

chrome.storage.sync.get("targetLang", (data) => {
  langSelect.value = data.targetLang || "it";
});

langSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ targetLang: langSelect.value });
});

function sendToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Quick Translate: nessun content script su questa tab (es. pagina chrome:// o tab aperta prima dell'installazione). Ricarica la pagina e riprova.",
          chrome.runtime.lastError.message
        );
      }
    });
  });
}

translateBtn.addEventListener("click", () => {
  sendToActiveTab({ type: "QT_TRANSLATE_PAGE" });
});

restoreBtn.addEventListener("click", () => {
  sendToActiveTab({ type: "QT_RESTORE_PAGE" });
});

// ---------- Scorciatoie da tastiera ----------
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

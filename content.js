// content.js — gira in ogni pagina

const CHUNK_MAX_CHARS = 1600;
const NODE_SEP = "\n";
const ORIGINAL_ATTR = "data-qt-original";

let fullPageTranslated = false;

// ---------- Utility: comunicazione con il background ----------
function requestTranslation(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "QT_TRANSLATE_TEXT", text }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res || !res.ok) {
        reject(new Error((res && res.error) || "Errore sconosciuto"));
        return;
      }
      resolve(res.translated);
    });
  });
}

// ---------- Popup fluttuante per la selezione ----------
let floatingBox = null;

function removeFloatingBox() {
  if (floatingBox) {
    floatingBox.remove();
    floatingBox = null;
  }
}

function showFloatingBox(anchorRect, originalText, translatedText, isError) {
  removeFloatingBox();

  const box = document.createElement("div");
  box.className = "qt-floating-box";

  const close = document.createElement("button");
  close.className = "qt-close-btn";
  close.textContent = "×";
  close.addEventListener("click", removeFloatingBox);
  box.appendChild(close);

  if (isError) {
    const err = document.createElement("div");
    err.className = "qt-error";
    err.textContent = translatedText;
    box.appendChild(err);
  } else {
    const orig = document.createElement("div");
    orig.className = "qt-original";
    orig.textContent = originalText;
    box.appendChild(orig);

    const arrow = document.createElement("div");
    arrow.className = "qt-arrow";
    arrow.textContent = "↓";
    box.appendChild(arrow);

    const trans = document.createElement("div");
    trans.className = "qt-translated";
    trans.textContent = translatedText;
    box.appendChild(trans);

    const copyBtn = document.createElement("button");
    copyBtn.className = "qt-copy-btn";
    copyBtn.textContent = "Copia traduzione";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(translatedText);
        copyBtn.textContent = "Copiato ✓";
        copyBtn.classList.add("qt-copied");
        setTimeout(() => {
          copyBtn.textContent = "Copia traduzione";
          copyBtn.classList.remove("qt-copied");
        }, 1500);
      } catch (err) {
        copyBtn.textContent = "Errore copia";
      }
    });
    box.appendChild(copyBtn);
  }

  document.body.appendChild(box);

  const top = window.scrollY + anchorRect.bottom + 8;
  const left = Math.min(
    window.scrollX + anchorRect.left,
    window.scrollX + document.documentElement.clientWidth - box.offsetWidth - 16
  );

  box.style.top = top + "px";
  box.style.left = Math.max(8, left) + "px";

  floatingBox = box;
}

document.addEventListener("mousedown", (e) => {
  if (floatingBox && !floatingBox.contains(e.target)) {
    removeFloatingBox();
  }
});

async function translateSelectionText(text) {
  const selection = window.getSelection();
  let rect = { top: 100, bottom: 120, left: 100 };
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    if (rects.length > 0) rect = rects[rects.length - 1];
  }

  showFloatingBox(rect, text, "Traduzione in corso…", false);

  try {
    const translated = await requestTranslation(text);
    showFloatingBox(rect, text, translated, false);
  } catch (err) {
    showFloatingBox(rect, text, "Errore: " + err.message, true);
  }
}

// ---------- Traduzione dell'intera pagina ----------
function isSkippableElement(el) {
  const tag = el.tagName;
  return (
    tag === "SCRIPT" ||
    tag === "STYLE" ||
    tag === "NOSCRIPT" ||
    tag === "TEXTAREA" ||
    tag === "INPUT" ||
    tag === "CODE" ||
    tag === "PRE" ||
    el.isContentEditable
  );
}

function collectTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (isSkippableElement(parent)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function chunkNodes(nodes) {
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const node of nodes) {
    const len = node.nodeValue.length;
    if (currentLen + len > CHUNK_MAX_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(node);
    currentLen += len + NODE_SEP.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function translateChunk(nodes) {
  const originalTexts = nodes.map((n) => n.nodeValue);
  const joined = originalTexts.join(NODE_SEP);

  let translatedJoined;
  try {
    translatedJoined = await requestTranslation(joined);
  } catch (err) {
    return; // lascia il chunk intatto in caso di errore
  }

  const parts = translatedJoined.split(NODE_SEP);

  if (parts.length === nodes.length) {
    nodes.forEach((node, i) => {
      node.setAttribute && null; // no-op, i nodi sono Text, non Element
      if (!node[ORIGINAL_ATTR]) node[ORIGINAL_ATTR] = node.nodeValue;
      node.nodeValue = parts[i];
    });
  } else {
    // Il numero di righe non combacia: traduci nodo per nodo (più lento ma sicuro)
    for (const node of nodes) {
      try {
        const t = await requestTranslation(node.nodeValue);
        if (!node[ORIGINAL_ATTR]) node[ORIGINAL_ATTR] = node.nodeValue;
        node.nodeValue = t;
      } catch (e) {
        // ignora singolo errore
      }
    }
  }
}

async function translateFullPage() {
  const nodes = collectTextNodes(document.body);
  const chunks = chunkNodes(nodes);

  for (const chunk of chunks) {
    await translateChunk(chunk);
  }

  fullPageTranslated = true;
}

function restoreFullPage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    if (n[ORIGINAL_ATTR] !== undefined) {
      n.nodeValue = n[ORIGINAL_ATTR];
      delete n[ORIGINAL_ATTR];
    }
  }
  fullPageTranslated = false;
}

// ---------- Listener messaggi dal background/popup ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QT_TRANSLATE_SELECTION") {
    translateSelectionText(message.text);
  } else if (message.type === "QT_COMMAND_TRANSLATE_SELECTION") {
    const text = window.getSelection()?.toString().trim();
    if (text) translateSelectionText(text);
  } else if (message.type === "QT_TRANSLATE_PAGE") {
    translateFullPage();
  } else if (message.type === "QT_RESTORE_PAGE") {
    restoreFullPage();
  }
});

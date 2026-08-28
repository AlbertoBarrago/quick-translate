// content.js — runs on every page

// Guard against double execution: the background script can re-inject this
// file as a retry when a tab has no active receiver, and if it was already
// present the re-run would redeclare the top-level consts below and throw.
// Everything is wrapped in this IIFE so a second injection is a harmless no-op.
if (!window.__qtContentScriptLoaded) {
  window.__qtContentScriptLoaded = true;
  (function () {
    const CHUNK_MAX_CHARS = 1600;
    const NODE_SEP = "\n";
    const ORIGINAL_ATTR = "data-qt-original";

    let fullPageTranslated = false;

    // ---------- Utility: communication with the background script ----------
    const REQUEST_THROTTLE_MS = 150;
    const RATE_LIMIT_BACKOFF_MS = 1500;

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function requestTranslation(text) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "QT_TRANSLATE_TEXT", text }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res || !res.ok) {
            const err = new Error((res && res.error) || "Errore sconosciuto");
            err.status = res && res.status;
            reject(err);
            return;
          }
          resolve(res.translated);
        });
      });
    }

    function getTargetLang() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "QT_GET_TARGET_LANG" }, (res) => {
          resolve((res && res.targetLang) || "it");
        });
      });
    }

    // Throttles every request and retries once on a 429 (rate limit) after a
    // backoff, instead of giving up immediately. Google's endpoint can react
    // to a burst of many requests (e.g. the per-node fallback below) by
    // blocking with 429, so spacing calls out keeps that from happening.
    async function translateText(text, targetLang) {
      await sleep(REQUEST_THROTTLE_MS);
      try {
        return await requestTranslation(text);
      } catch (err) {
        if (err.status !== 429) throw err;
        await sleep(RATE_LIMIT_BACKOFF_MS);
        return requestTranslation(text);
      }
    }

    // ---------- Floating popup for text selection ----------
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
        window.scrollX + document.documentElement.clientWidth - box.offsetWidth - 16,
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
        const targetLang = await getTargetLang();
        const translated = await translateText(text, targetLang);
        showFloatingBox(rect, text, translated, false);
      } catch (err) {
        showFloatingBox(rect, text, "Errore: " + err.message, true);
      }
    }

    // ---------- Full page translation ----------
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
        },
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

    async function translateChunk(nodes, targetLang) {
      const originalTexts = nodes.map((n) => n.nodeValue);
      const joined = originalTexts.join(NODE_SEP);

      let translatedJoined;
      try {
        translatedJoined = await translateText(joined, targetLang);
      } catch (err) {
        return false; // leave the chunk untouched on error
      }

      const parts = translatedJoined.split(NODE_SEP);

      if (parts.length === nodes.length) {
        nodes.forEach((node, i) => {
          if (!node[ORIGINAL_ATTR]) node[ORIGINAL_ATTR] = node.nodeValue;
          node.nodeValue = parts[i];
        });
        return true;
      }

      // Line count mismatch: translate node by node (slower but safe)
      let anyFailed = false;
      for (const node of nodes) {
        try {
          const t = await translateText(node.nodeValue, targetLang);
          if (!node[ORIGINAL_ATTR]) node[ORIGINAL_ATTR] = node.nodeValue;
          node.nodeValue = t;
        } catch (e) {
          anyFailed = true;
        }
      }
      return !anyFailed;
    }

    // ---------- On-screen status toast for full page translation ----------
    let pageToast = null;

    function showPageToast(text, isError) {
      if (!pageToast) {
        pageToast = document.createElement("div");
        pageToast.className = "qt-page-toast";
        document.body.appendChild(pageToast);
      }
      pageToast.textContent = text;
      pageToast.classList.toggle("qt-page-toast-error", !!isError);
    }

    function removePageToastAfter(delayMs) {
      const el = pageToast;
      pageToast = null;
      if (!el) return;
      setTimeout(() => el.remove(), delayMs);
    }

    async function translateFullPage() {
      showPageToast("Traduzione pagina in corso…", false);

      try {
        const targetLang = await getTargetLang();
        const nodes = collectTextNodes(document.body);
        const chunks = chunkNodes(nodes);

        let failedChunks = 0;
        for (const chunk of chunks) {
          const ok = await translateChunk(chunk, targetLang);
          if (!ok) failedChunks++;
        }

        fullPageTranslated = true;

        if (failedChunks > 0) {
          showPageToast(`Traduzione completata con ${failedChunks} sezioni non tradotte.`, true);
          removePageToastAfter(4000);
        } else {
          showPageToast("Pagina tradotta.", false);
          removePageToastAfter(1500);
        }
      } catch (err) {
        showPageToast("Errore durante la traduzione della pagina.", true);
        removePageToastAfter(4000);
      }
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

    // ---------- Message listener from background/popup ----------
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
  })();
}

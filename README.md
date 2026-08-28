# Quick Translate

Autore: **Alberto Barrago** ([albz.it](https://albz.it))

Estensione Manifest V3 (Chromium / Helium) per traduzione al volo del testo
selezionato e traduzione dell'intera pagina, tramite l'endpoint pubblico
(non ufficiale) `translate.googleapis.com`.

## Installazione (dev, non pacchettizzata)

1. Apri `chrome://extensions` (funziona identico in Helium).
2. Attiva "Modalità sviluppatore" in alto a destra.
3. Clicca "Carica estensione non pacchettizzata" e seleziona questa cartella.
4. L'icona comparirà nella toolbar.

## Uso

- **Traduzione selezione**: seleziona del testo → tasto destro →
  "Traduci selezione". Compare un popup con originale e traduzione.
- **Traduzione pagina intera**: tasto destro sulla pagina → "Traduci pagina
  intera", oppure apri il popup dell'estensione e clicca il bottone
  corrispondente.
- **Ripristino**: tasto destro → "Ripristina pagina originale" (o bottone nel
  popup) per tornare al testo originale, senza ricaricare la pagina.
- **Lingua target**: impostabile dal popup della toolbar (salvata in
  `chrome.storage.sync`, default `it`).
- **Scorciatoie da tastiera**: visibili nel popup della toolbar, sotto
  "Scorciatoie da tastiera". Default suggeriti (personalizzabili da
  `chrome://extensions/shortcuts`, link diretto anche dal popup):
  - `Ctrl+Shift+Y` (`Cmd+Shift+Y` su Mac): traduci il testo selezionato
  - `Ctrl+Shift+U` (`Cmd+Shift+U` su Mac): traduci l'intera pagina
  - `Ctrl+Shift+O` (`Cmd+Shift+O` su Mac): ripristina l'originale

## Note tecniche

- Nessuna API key richiesta: usa l'endpoint pubblico `dt=t` di Google
  Translate. Non è un uso ufficialmente supportato da Google — per un
  progetto da produzione conviene passare a Cloud Translation API o DeepL
  (basta sostituire `translateRaw()` in `background.js`).
- La traduzione della pagina intera raggruppa i nodi di testo in blocchi
  (~1600 caratteri) uniti da `\n`, per ridurre il numero di richieste; se il
  numero di righe tradotte non combacia con l'originale, il blocco viene
  ritradotto nodo per nodo come fallback.
- Vengono esclusi `script`, `style`, `noscript`, `textarea`, `input`, `code`,
  `pre` e gli elementi `contenteditable`.
- Permessi richiesti volutamente minimi: niente `<all_urls>` nei permessi (i
  content script sono dichiarati via `content_scripts`, il fetch verso
  Google Translate è isolato in `host_permissions`).

## Limiti noti

- L'endpoint pubblico non garantisce SLA né rate limit documentati: uso
  intenso può risultare in blocchi temporanei da parte di Google.
- Pagine molto dinamiche (SPA con re-render continuo) possono richiedere una
  nuova traduzione dopo cambi di route, dato che non c'è un
  `MutationObserver` attivo in questa v1.

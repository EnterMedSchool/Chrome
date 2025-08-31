
// v3.0.0 content — multi-pin windows, quick palette, per-site toggle, tag filters, robust matching
let GLOSSARY = [];
let LOOKUP = {};
let TAGS = {};
let META = {};
let STATE = { compiled: [], enabled: true, highlightCount: 0, paletteOpen: false };

const STORAGE_META = "ems_glossary_meta_v3";
const EXCLUDED_TAGS = new Set(["SCRIPT","STYLE","NOSCRIPT","CODE","PRE","TEXTAREA","INPUT","SELECT","KBD","SAMP","IFRAME"]);
const HIGHLIGHT_CLASS = "ems-glossary-highlight";
const DATA_MARKED = "data-ems-glossary-marked";
const DOMAIN = location.hostname.replace(/^www\./, "");

// Initial bootstrap
chrome.runtime.sendMessage({ type: "getGlossaryCache" }, (res) => {
  if (!res) return;
  GLOSSARY = res.cache || [];
  LOOKUP = res.index || {};
  TAGS = res.tags || {};
  META = Object.assign({
    caseSensitive:false, highlightUnderline:true, useTagColors:true, fontScale:1,
    popupMaxHeightVh:76, popupMaxWidthPx:580, imageThumbMaxW:220, imageThumbMaxH:180,
    domainRules:{}, enabledTags:{}, highlightCap:700, hoverDelayMs:100
  }, res.meta || {});

  STATE.enabled = getEnabledForDomain(DOMAIN);
  injectStyles();
  setupGlobalHotkeys();
  if (STATE.enabled && Object.keys(LOOKUP).length) {
    buildAndStart();
    scanOpenShadowRoots(); // try to highlight inside open shadow roots
  } else if (!Object.keys(LOOKUP).length) {
    // Trigger a single refresh and retry once
    chrome.runtime.sendMessage({ type: "forceRefresh" }, () => setTimeout(() => {
      chrome.runtime.sendMessage({ type: "getGlossaryCache" }, (r2) => {
        if (!r2) return;
        GLOSSARY = r2.cache || []; LOOKUP = r2.index || {}; TAGS = r2.tags || {}; META = Object.assign(META, r2.meta || {});
        STATE.enabled = getEnabledForDomain(DOMAIN);
        if (STATE.enabled) buildAndStart();
      });
    }, 1200));
  }
});

function getEnabledForDomain(host) {
  const rules = META.domainRules || {};
  if (host in rules) return !!rules[host];
  return META.enableOnThisSite !== false;
}

function injectStyles() {
  const css = `
  :root { --ems-accent: #fff59d; --ems-bg: #12131b; --ems-panel: #161928; }
  @media (prefers-color-scheme: light) {
    :root { --ems-bg: #f8fafc; --ems-panel: #ffffff; }
  }
  .ems-glossary-highlight {
    background: var(--ems-accent);
    border-bottom: ${META.highlightUnderline ? "1px dotted rgba(0,0,0,0.5)" : "none"};
    border-radius: 6px; padding: 0 .2em; cursor: help; box-decoration-break: clone;
  }
  .ems-hide-highlights .ems-glossary-highlight { background: transparent !important; border: none !important; }
  .ems-dim-highlights .ems-glossary-highlight { filter: grayscale(0.2) opacity(0.5); }

  .ems-pop { position: fixed; z-index: 2147483647; max-width: ${META.popupMaxWidthPx}px; min-width: 340px;
    max-height: ${META.popupMaxHeightVh}vh; color: #e6e6eb; background: linear-gradient(180deg, #171923, var(--ems-bg));
    border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.55);
    padding: 12px 14px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: ${Math.round((META.fontScale || 1) * 14)}px; line-height: 1.45; display: none; isolation: isolate;
    contain: layout paint style; box-sizing: border-box; overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  }
  .ems-pop * { mix-blend-mode: normal; }
  .ems-pop .titlebar { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom: 8px;
     position: sticky; top: -8px; background: linear-gradient(180deg, #171923, var(--ems-bg)); padding-top: 8px; }
  .ems-pop .term-chip { display:inline-block; font-weight: 800; letter-spacing: .2px; padding: 4px 10px; border-radius: 10px;
    color:#1a1b22; background: var(--ems-accent); border-bottom:${META.highlightUnderline ? "1px dotted rgba(0,0,0,0.4)" : "none"}; user-select:none; }
  .ems-pop .controls { display:flex; gap:8px; align-items:center; }
  .ems-pop .btn { border: 1px solid rgba(255,255,255,0.08); background: #202538; color: #cfd3e6; padding: 4px 8px;
    border-radius: 8px; font-size: 12px; text-decoration: none; cursor: pointer; }
  .ems-pop .btn.primary { background:#4f7cff; color:white; border-color: #4f7cff; }
  .ems-pop .btn.icon { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; padding:0; }
  .ems-pop .hero { background: linear-gradient(180deg, #1f2230, #151826); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; color: #e6e6eb; }
  .ems-pop .chips { display:flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px 0; }
  .ems-pop .chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #2a2f45; border: 1px solid rgba(255,255,255,0.06); color: #cfd3e6; }
  .ems-pop .images { display:flex; gap:10px; margin: 8px 0; flex-wrap: wrap; }
  .ems-pop .images img { max-width: ${META.imageThumbMaxW}px; max-height: ${META.imageThumbMaxH}px; border-radius: 10px; border:1px solid rgba(255,255,255,0.06); cursor: zoom-in; }
  .ems-pop .section { background: var(--ems-panel); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
  .ems-pop .section h4 { margin: 0 0 6px 0; font-size: 13px; color: #cfd3e6; letter-spacing: .2px; }
  .ems-pop .section ul { margin: 0 0 0 18px; }
  .ems-pop .footer { margin-top: 8px; display:flex; justify-content: space-between; align-items: center; font-size:12px; color:#a8adc6; }
  .ems-pop.dragging { cursor: grabbing; user-select: none; }

  /* Pinned windows (multiple) */
  .ems-window { position: fixed; z-index: 2147483647; }
  .ems-window .ems-pop { display: block; }
  .ems-min { opacity: .75; height: 42px; overflow: hidden; }

  /* Lightbox */
  #ems-lightbox { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.8); display: none; align-items: center; justify-content: center; }
  #ems-lightbox img { max-width: calc(100vw - 48px); max-height: calc(100vh - 48px); border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }

  /* Command palette */
  #ems-palette { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.45); display: none; align-items: flex-start; justify-content: center; padding-top: 12vh; }
  #ems-palette .box { width: min(720px, calc(100vw - 32px)); background: var(--ems-panel); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.55); }
  #ems-palette input { width: 100%; box-sizing: border-box; border: none; outline: none; padding: 14px 14px; font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: transparent; color: #e6e6eb; }
  #ems-palette ul { list-style: none; margin: 0; padding: 6px 0; max-height: 52vh; overflow: auto; }
  #ems-palette li { padding: 8px 14px; border-top: 1px solid rgba(255,255,255,.06); display:flex; justify-content: space-between; gap: 10px; align-items: center; }
  #ems-palette li.active { background: rgba(79,124,255,.15); }
  #ems-palette .tag { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #2a2f45; border: 1px solid rgba(255,255,255,0.06); color: #cfd3e6; }
  `;
  const style = document.createElement("style");
  style.id = "ems-inline-style";
  style.textContent = css;
  document.documentElement.appendChild(style);
}

function buildAndStart() {
  STATE.compiled = buildCompiledChunks();
  if (!STATE.compiled.length) return;
  STATE.highlightCount = 0;
  const walkers = getTextNodes(document.body);
  for (const node of walkers) {
    if (STATE.highlightCount >= (META.highlightCap || 700)) break;
    highlightNodeWithChunks(node, STATE.compiled);
  }
  setupMutationObserver(STATE.compiled);
  ensureLightbox();
}

function setupGlobalHotkeys() {
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.altKey && e.key === "G") { /* handled below */ }
    // palette: Cmd/Ctrl+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      togglePalette(true);
      return;
    }
    // quick toggle highlights: Alt+Shift+E
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      STATE.enabled = !STATE.enabled;
      document.documentElement.classList.toggle("ems-hide-highlights", !STATE.enabled);
      chrome.runtime.sendMessage({ type: "updateMeta", patch: { domainRules: Object.assign({}, META.domainRules || {}, { [DOMAIN]: STATE.enabled }) } }, () => {});
      return;
    }
    // dim highlights (Alt+D)
    if (e.altKey && e.key.toLowerCase() === "d") {
      document.documentElement.classList.toggle("ems-dim-highlights");
      return;
    }
  }, { capture: true });
}

// Command palette
function togglePalette(open) {
  let pal = document.getElementById("ems-palette");
  if (!open) { if (pal) pal.style.display = "none"; STATE.paletteOpen = false; return; }
  STATE.paletteOpen = true;
  if (!pal) {
    pal = document.createElement("div");
    pal.id = "ems-palette";
    pal.innerHTML = `<div class="box"><input type="text" placeholder="Search EMS terms…"><ul></ul></div>`;
    document.body.appendChild(pal);
    pal.addEventListener("click", (e) => { if (e.target.id === "ems-palette") togglePalette(false); });
    document.addEventListener("keydown", (e) => { if (STATE.paletteOpen && e.key === "Escape") togglePalette(false); });
    const input = pal.querySelector("input");
    const list = pal.querySelector("ul");
    let idx = 0; let results = [];
    function render() {
      list.innerHTML = "";
      results.slice(0, 50).forEach((r, i) => {
        const li = document.createElement("li");
        if (i === idx) li.classList.add("active");
        const left = document.createElement("div"); left.textContent = r.title;
        const right = document.createElement("span"); right.className = "tag"; right.textContent = r.primary_tag || "";
        li.appendChild(left); li.appendChild(right);
        li.addEventListener("click", () => openPinnedById(r.id));
        list.appendChild(li);
      });
    }
    function search(q) {
      q = q.trim().toLowerCase();
      if (!q) { results = []; render(); return; }
      const found = [];
      for (const e of GLOSSARY) {
        const hay = [ ...(e.names||[]), ...(e.aliases||[]), ...(e.abbr||[]) ].join(" ").toLowerCase();
        if (hay.includes(q)) found.push({ id: e.id, title: e.names?.[0] || e.id, primary_tag: e.primary_tag });
        if (found.length > 100) break;
      }
      results = found; idx = 0; render();
    }
    input.addEventListener("input", () => search(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { idx = Math.min(results.length-1, idx+1); render(); e.preventDefault(); }
      if (e.key === "ArrowUp") { idx = Math.max(0, idx-1); render(); e.preventDefault(); }
      if (e.key === "Enter" && results[idx]) { openPinnedById(results[idx].id); togglePalette(false); }
      if (e.key === "Escape") togglePalette(false);
    });
  }
  pal.style.display = "flex";
  pal.querySelector("input").value = "";
  pal.querySelector("input").focus();
  pal.querySelector("ul").innerHTML = "";
}

function getTextNodes(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${DATA_MARKED}]`)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n; while ((n = walker.nextNode())) out.push(n);
  return out;
}
function shouldSkip(el) {
  if (!el) return true;
  if (el.closest && (el.closest(".ems-pop") || el.closest(".ems-window"))) return true;
  if (EXCLUDED_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  if (el.closest && el.closest(`.${HIGHLIGHT_CLASS}`)) return true;
  return false;
}

// Manual boundary tests (Unicode)
const WORD_RE = /\p{L}|\p{N}|_/u;
function isWordChar(ch) { return !!ch && WORD_RE.test(ch); }
function validBoundary(text, start, len) {
  const before = text[start - 1];
  const after = text[start + len];
  return !isWordChar(before) && !isWordChar(after);
}

function buildCompiledChunks() {
  const tokens = Object.keys(LOOKUP);
  if (!tokens.length) return [];
  const escaped = tokens.map(escapeRegex).sort((a,b) => b.length - a.length);
  const parts = chunkRegex(escaped, 30000);
  const flags = META.caseSensitive ? 'g' : 'gi';
  return parts.map(p => new RegExp("(" + p + ")", flags));
}

function highlightNodeWithChunks(textNode, compiled) {
  if (!textNode || !textNode.nodeValue) return;
  let node = textNode;
  for (const re of compiled) {
    node = highlightNodeWithRegex(node, re);
    if (!node) break;
    if (STATE.highlightCount >= (META.highlightCap || 700)) break;
  }
}
function highlightNodeWithRegex(textNode, re) {
  let s = textNode.nodeValue; let match; let last = 0; const parts = []; let changed = false;
  re.lastIndex = 0;
  while ((match = re.exec(s)) !== null) {
    if (STATE.highlightCount >= (META.highlightCap || 700)) break;
    const term = match[1];
    const start = match.index;
    const end = start + term.length;
    const key = META.caseSensitive ? term : term.toLowerCase();
    const idx = LOOKUP[key];
    if (idx == null) continue;
    // Tag filter
    const entry = GLOSSARY[idx];
    if (entry?.primary_tag && META.enabledTags && Object.keys(META.enabledTags).length) {
      if (META.enabledTags[entry.primary_tag] === false) continue;
    }
    if (!validBoundary(s, start, term.length)) continue;
    changed = true;
    parts.push(document.createTextNode(s.slice(last, start)));
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.setAttribute(DATA_MARKED, "1");
    span.textContent = s.slice(start, end);
    span.dataset.emsId = entry?.id || "";
    // color by tag
    if (META.useTagColors && entry?.primary_tag) {
      const tag = TAGS[entry.primary_tag]; const accent = tag && (tag.accent || tag.color);
      if (accent) { span.style.background = accent; }
    }
    if (META.highlightUnderline) span.style.borderBottom = "1px dotted rgba(0,0,0,0.5)";
    attachPopoverHandlers(span);
    parts.push(span);
    STATE.highlightCount++;
    last = end;
  }
  if (!changed) return textNode;
  parts.push(document.createTextNode(s.slice(last)));
  const parent = textNode.parentNode;
  for (const p of parts) parent.insertBefore(p, textNode);
  parent.removeChild(textNode);
  return parts[parts.length - 1].nodeType === Node.TEXT_NODE ? parts[parts.length - 1] : null;
}

// popover + pinned windows
let HIDE_TIMER = null; let CURRENT_ANCHOR = null; let PINNED_TEMP = null; // temp (hover) popup
let WINDOWS = []; // array of {el, id}

function attachPopoverHandlers(el) {
  const hoverDelay = META.hoverDelayMs || 100;
  let delayTimer = null;
  const pop = ensureTempPopover();
  function show() {
    clearTimeout(HIDE_TIMER);
    clearTimeout(delayTimer);
    delayTimer = setTimeout(() => {
      CURRENT_ANCHOR = el;
      const entry = getEntryById(el.dataset.emsId);
      renderPopover(pop, entry);
      pop.style.display = "block";
      positionPopoverAbsolute(pop, el);
    }, hoverDelay);
  }
  function scheduleHide() {
    clearTimeout(delayTimer);
    clearTimeout(HIDE_TIMER);
    HIDE_TIMER = setTimeout(() => { pop.style.display = "none"; CURRENT_ANCHOR = null; }, 160);
  }
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", scheduleHide);
  el.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const entry = getEntryById(el.dataset.emsId);
    openPinned(entry, { near: el });
  });
}
function ensureTempPopover() {
  if (PINNED_TEMP && document.body.contains(PINNED_TEMP)) return PINNED_TEMP;
  const pop = createEmptyPanel();
  pop.classList.add("ems-pop");
  // Keep the temporary popover visible while hovered
  pop.addEventListener("mouseenter", () => {
    clearTimeout(HIDE_TIMER);
  });
  pop.addEventListener("mouseleave", () => {
    clearTimeout(HIDE_TIMER);
    HIDE_TIMER = setTimeout(() => {
      pop.style.display = "none";
      CURRENT_ANCHOR = null;
    }, 160);
  });
  document.body.appendChild(pop);
  PINNED_TEMP = pop;
  return pop;
}
function createEmptyPanel() {
  const pop = document.createElement("div");
  pop.innerHTML = `
      <div class="titlebar">
        <span class="term-chip"></span>
        <div class="controls">
          <a class="btn action-copy" style="display:none;">Copy</a>
          <a class="btn action-watch" target="_blank" rel="noopener" style="display:none;">Watch</a>
          <a class="btn action-notes" target="_blank" rel="noopener" style="display:none;">Notes</a>
          <button class="btn icon minimize" title="Minimize">–</button>
          <button class="btn icon close" title="Close">✕</button>
        </div>
      </div>
      <div class="hero def"></div>
      <div class="chips aliases"></div>
      <div class="chips tags"></div>
      <div class="images"></div>
      <div class="sections"></div>
      <div class="footer"><span>EMS Glossary</span><a class="more" target="_blank" rel="noopener">More</a></div>
  `;
  // Scroll capture
  pop.addEventListener("wheel", (e) => {
    const canScroll = pop.scrollHeight > pop.clientHeight;
    if (!canScroll) return;
    e.preventDefault(); pop.scrollTop += e.deltaY;
  }, { passive: false });
  return pop;
}
function renderPopover(pop, entry) {
  const chip = pop.querySelector(".term-chip");
  const defEl = pop.querySelector(".def");
  const aliasesWrap = pop.querySelector(".aliases");
  const tagsWrap = pop.querySelector(".tags");
  const imagesWrap = pop.querySelector(".images");
  const sectionsWrap = pop.querySelector(".sections");
  const moreLink = pop.querySelector(".more");

  chip.textContent = entry?.names?.[0] || entry?.id || "";
  if (META.useTagColors && entry?.primary_tag && TAGS[entry.primary_tag]?.accent) {
    chip.style.background = TAGS[entry.primary_tag].accent;
    document.documentElement.style.setProperty("--ems-accent", TAGS[entry.primary_tag].accent);
  } else {
    chip.style.background = "var(--ems-accent)";
  }
  defEl.textContent = entry?.definition || "";

  // actions
  const copyBtn = pop.querySelector(".action-copy");
  copyBtn.style.display = "inline-flex";
  copyBtn.onclick = async () => {
    const txt = `${chip.textContent}\n\n${entry?.definition || ""}`.trim();
    try { await navigator.clipboard.writeText(txt); copyBtn.textContent = "Copied"; setTimeout(() => copyBtn.textContent="Copy", 1200); } catch {}
  };
  const watchBtn = pop.querySelector(".action-watch");
  const notesBtn = pop.querySelector(".action-notes");
  watchBtn.style.display = "none"; notesBtn.style.display = "none";
  if (Array.isArray(entry?.actions)) {
    for (const a of entry.actions) {
      const label = (a.label || "").toLowerCase();
      if (label.includes("watch")) {
        watchBtn.href = a.href; watchBtn.style.display = "inline-flex"; if (a.variant === "primary") watchBtn.classList.add("primary"); else watchBtn.classList.remove("primary");
      } else if (label.includes("note")) {
        notesBtn.href = a.href; notesBtn.style.display = "inline-flex"; if (a.variant === "primary") notesBtn.classList.add("primary"); else notesBtn.classList.remove("primary");
      }
    }
  }

  // aliases/abbr
  aliasesWrap.innerHTML = "";
  const aliasList = []; if (Array.isArray(entry?.aliases)) aliasList.push(...entry.aliases); if (Array.isArray(entry?.abbr)) aliasList.push(...entry.abbr);
  for (const a of aliasList) { const el = document.createElement("span"); el.className = "chip"; el.textContent = a; aliasesWrap.appendChild(el); }

  // tags
  tagsWrap.innerHTML = "";
  const tagList = []; if (entry?.primary_tag) tagList.push(entry.primary_tag); if (Array.isArray(entry?.tags)) tagList.push(...entry.tags);
  for (const t of tagList) { const el = document.createElement("span"); el.className = "chip"; el.textContent = t; tagsWrap.appendChild(el); }

  // images
  imagesWrap.innerHTML = "";
  if (Array.isArray(entry?.images)) {
    for (const im of entry.images) {
      if (!im?.src) continue;
      const img = document.createElement("img"); img.src = im.src; img.alt = im.alt || "";
      img.addEventListener("click", () => openLightbox(im.src)); imagesWrap.appendChild(img);
    }
  }

  // sections
  sectionsWrap.innerHTML = "";
  const order = ["why_it_matters","how_youll_see_it","problem_solving","pathophysiology","diagnosis","imaging","treatment","mnemonics","pearls","pitfalls","red_flags","algorithm","exam_appearance","see_also","prerequisites","differentials","actions","cases"];
  const pretty = (k) => k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()).replace("Dont","Don't");
  const addSection = (key, val) => {
    if (val == null) return;
    const sec = document.createElement("div"); sec.className = "section";
    const h = document.createElement("h4"); h.textContent = pretty(key); sec.appendChild(h);
    if (key === "differentials" && Array.isArray(val)) {
      const ul = document.createElement("ul");
      for (const item of val) {
        const li = document.createElement("li");
        if (item && typeof item === "object") {
          const name = item.name || item.id || ""; const hint = item.hint ? ` — ${item.hint}` : "";
          if (item.id) { const a = document.createElement("a"); a.href="#"; a.textContent = name; a.onclick = (e)=>{e.preventDefault(); openPinnedById(item.id);}; li.appendChild(a); li.appendChild(document.createTextNode(hint)); }
          else { li.textContent = name + hint; }
        } else { li.textContent = String(item); }
        ul.appendChild(li);
      }
      sec.appendChild(ul);
    } else if (key === "actions" && Array.isArray(val)) {
      const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="8px"; wrap.style.flexWrap="wrap";
      for (const a of val) { const btn = document.createElement("a"); btn.className = "btn"+(a.variant==="primary"?" primary":""); btn.href=a.href||"#"; btn.target="_blank"; btn.rel="noopener"; btn.textContent=a.label||"Open"; wrap.appendChild(btn); }
      sec.appendChild(wrap);
    } else if (key === "cases" && Array.isArray(val)) {
      for (const c of val) {
        const card = document.createElement("div"); card.style.background="#141828"; card.style.border="1px solid rgba(255,255,255,.06)"; card.style.borderRadius="10px"; card.style.padding="8px 10px"; card.style.marginTop="6px";
        if (c.stem) { const p = document.createElement("div"); p.textContent=c.stem; p.style.fontWeight="600"; card.appendChild(p); }
        if (Array.isArray(c.clues) && c.clues.length) { const ul = document.createElement("ul"); ul.style.margin="4px 0 0 18px"; for (const cl of c.clues) { const li = document.createElement("li"); li.textContent=cl; ul.appendChild(li);} card.appendChild(ul); }
        if (c.answer) { const p = document.createElement("div"); p.textContent="Answer: "+c.answer; p.style.marginTop="6px"; card.appendChild(p); }
        if (c.teaching) { const p = document.createElement("div"); p.textContent=c.teaching; p.style.opacity=".9"; p.style.marginTop="4px"; card.appendChild(p); }
        sec.appendChild(card);
      }
    } else if (key === "see_also" && Array.isArray(val)) {
      const ul = document.createElement("ul");
      for (const id of val) { const li = document.createElement("li"); const a = document.createElement("a"); a.href="#"; a.textContent=String(id).replace(/-/g," "); a.onclick=(e)=>{e.preventDefault(); openPinnedById(String(id));}; li.appendChild(a); ul.appendChild(li); }
      sec.appendChild(ul);
    } else if (key === "prerequisites" && Array.isArray(val)) {
      const ul = document.createElement("ul");
      for (const item of val) { const li = document.createElement("li"); const id = (typeof item==="string")?item:item?.id;
        if (id) { const a = document.createElement("a"); a.href="#"; a.textContent=id.replace(/-/g," "); a.onclick=(e)=>{e.preventDefault(); openPinnedById(id);}; li.appendChild(a); }
        else { li.textContent = typeof item==="string" ? item : JSON.stringify(item); }
        ul.appendChild(li);
      }
      sec.appendChild(ul);
    } else {
      if (Array.isArray(val)) { const ul = document.createElement("ul"); for (const item of val) { const li=document.createElement("li"); li.textContent=String(item); ul.appendChild(li);} sec.appendChild(ul); }
      else { const div = document.createElement("div"); div.textContent=String(val); sec.appendChild(div); }
    }
    sectionsWrap.appendChild(sec);
  };
  for (const k of order) if (entry[k] != null) addSection(k, entry[k]);
  const skip = new Set(["id","names","aliases","abbr","patterns","primary_tag","tags","definition","sources","images","html"].concat(order));
  for (const [k,v] of Object.entries(entry||{})) if (!skip.has(k) && v!=null) addSection(k,v);
  const url = Array.isArray(entry?.sources) && entry.sources[0]?.url ? entry.sources[0].url : "";
  if (url) { moreLink.href=url; moreLink.style.display="inline"; } else { moreLink.style.display="none"; }
}

function getEntryById(id) { return GLOSSARY.find(x => x.id === id); }

function ensureLightbox() {
  if (document.getElementById("ems-lightbox")) return;
  const lb = document.createElement("div"); lb.id = "ems-lightbox"; lb.innerHTML = `<img alt="">`;
  document.body.appendChild(lb); lb.addEventListener("click", () => lb.style.display = "none");
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.style.display = "none"; });
}
function openLightbox(src) { const lb = document.getElementById("ems-lightbox"); lb.querySelector("img").src = src; lb.style.display = "flex"; }

function positionPopoverAbsolute(pop, target) {
  const rect = target.getBoundingClientRect(); const margin=6;
  let top = rect.bottom + margin; let left = rect.left;
  const width = pop.offsetWidth || (META.popupMaxWidthPx || 580); const height = pop.offsetHeight || 320;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top + height > window.innerHeight - 8) top = rect.top - height - margin;
  pop.style.top = `${Math.max(8, top)}px`; pop.style.left = `${Math.max(8, left)}px`;
}

// Multiple pinned windows
function openPinned(entry, opts={}) {
  if (!entry) return;
  const win = document.createElement("div"); win.className = "ems-window";
  const panel = createEmptyPanel(); panel.classList.add("ems-pop"); win.appendChild(panel);
  document.body.appendChild(win);
  renderPopover(panel, entry);
  // position near anchor or center
  if (opts.near) { const rect = opts.near.getBoundingClientRect(); win.style.left = `${Math.max(8, rect.left)}px`; win.style.top = `${Math.max(8, rect.bottom + 6)}px`; }
  else { win.style.left = "24px"; win.style.top = "24px"; }
  // controls
  const closeBtn = panel.querySelector(".close"); closeBtn.onclick = () => { win.remove(); };
  const minBtn = panel.querySelector(".minimize"); minBtn.onclick = () => { panel.classList.toggle("ems-min"); };
  // draggable by titlebar
  const tb = panel.querySelector(".titlebar"); tb.style.cursor="grab";
  let DRAG=null;
  tb.addEventListener("mousedown",(e)=>{
    e.preventDefault(); const rect = win.getBoundingClientRect(); DRAG = {dx:e.clientX - rect.left, dy:e.clientY - rect.top};
    const move=(ev)=>{ if(!DRAG) return; let x=ev.clientX-DRAG.dx; let y=ev.clientY-DRAG.dy;
      x=Math.max(8,Math.min(window.innerWidth - panel.offsetWidth - 8, x)); y=Math.max(8,Math.min(window.innerHeight - panel.offsetHeight - 8, y));
      win.style.left=x+"px"; win.style.top=y+"px";
    };
    const up=()=>{ DRAG=null; document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up); };
    document.addEventListener("mousemove",move); document.addEventListener("mouseup",up);
  });
}
function openPinnedById(id) { openPinned(getEntryById(id)); }

// Mutation observer
function setupMutationObserver(compiled) {
  const observer = new MutationObserver((mutations) => {
    if (!STATE.enabled) return;
    for (const m of mutations) for (const node of m.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (shouldSkip(node.parentElement)) continue;
        highlightNodeWithChunks(node, compiled);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (shouldSkip(node)) continue;
        const nodes = getTextNodes(node);
        for (const tn of nodes) { if (STATE.highlightCount >= (META.highlightCap || 700)) break; highlightNodeWithChunks(tn, compiled); }
      }
      if (STATE.highlightCount >= (META.highlightCap || 700)) break;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Shadow root highlighting (best effort; ignores closed roots)
function scanOpenShadowRoots() {
  const elements = Array.from(document.querySelectorAll("*")).slice(0, 2000);
  for (const el of elements) {
    if (el.shadowRoot) {
      const nodes = getTextNodes(el.shadowRoot);
      for (const tn of nodes) { if (STATE.highlightCount >= (META.highlightCap || 700)) break; highlightNodeWithChunks(tn, STATE.compiled); }
    }
  }
}

function chunkRegex(escapedTerms, maxLen) {
  const chunks=[]; let buf=[]; let len=0;
  for (const t of escapedTerms) { const add=t.length+1; if (len+add>maxLen && buf.length){chunks.push(buf.join("|")); buf=[t]; len=t.length;} else {buf.push(t); len+=add;} }
  if (buf.length) chunks.push(buf.join("|")); return chunks;
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

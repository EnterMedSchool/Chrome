
// v3.0.0 background — repo-locked fetch + tags + meta
const REPO = { owner: "EnterMedSchool", repo: "Anki" };
const API_BASE = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const RAW_BASE = (branch, path) => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/${branch}/${path}`;

const STORAGE = {
  cache: "ems_glossary_cache_v3",
  index: "ems_glossary_index_v3",
  meta: "ems_glossary_meta_v3",
  tags: "ems_glossary_tags_v2"
};

const DEFAULT_META = {
  lastUpdated: 0,
  scheduleMinutes: 240,
  caseSensitive: false,
  highlightUnderline: true,
  useTagColors: true,
  fontScale: 1.0,
  popupMaxHeightVh: 76,
  popupMaxWidthPx: 580,
  imageThumbMaxW: 220,
  imageThumbMaxH: 180,
  enableOnThisSite: true, // default overridden per-domain
  enabledTags: {},        // {tag: true/false} -> empty = all enabled
  highlightCap: 700,      // max highlights per page
  hoverDelayMs: 100,
  domainRules: {}         // { hostname: boolean }
};

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  refresh().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  refresh().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ems_glossary_refresh") refresh().catch(console.error);
});

function ensureAlarm() {
  chrome.alarms.create("ems_glossary_refresh", { periodInMinutes: DEFAULT_META.scheduleMinutes });
}

chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({ id: "emsRefresh", title: "Refresh EMS glossary now", contexts: ["action"] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "emsRefresh") refresh().catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "getGlossaryCache") {
    chrome.storage.local.get([STORAGE.cache, STORAGE.index, STORAGE.meta, STORAGE.tags], (st) => {
      sendResponse({
        cache: st[STORAGE.cache] || [],
        index: st[STORAGE.index] || {},
        meta: Object.assign({}, DEFAULT_META, st[STORAGE.meta] || {}),
        tags: st[STORAGE.tags] || {}
      });
    });
    return true;
  }
  if (msg?.type === "forceRefresh") {
    refresh().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "updateMeta") {
    chrome.storage.local.get([STORAGE.meta], (st) => {
      const meta = Object.assign({}, DEFAULT_META, st[STORAGE.meta] || {}, msg.patch || {});
      chrome.storage.local.set({ [STORAGE.meta]: meta }, () => sendResponse({ ok: true, meta }));
    });
    return true;
  }
});

async function refresh() {
  const branch = await getBranchFallback();
  const idx = await fetchJSON(RAW_BASE(branch, "glossary/index.json"));
  const files = Array.isArray(idx?.files) ? idx.files : [];
  const normalizedPaths = files.map(p => p.includes("/") ? p : `glossary/terms/${p}`);
  const results = await Promise.allSettled(normalizedPaths.map(p => fetchJSON(RAW_BASE(branch, p))));
  const entries = results.filter(r => r.status === "fulfilled").map(r => r.value);

  let tags = {};
  try { tags = await fetchJSON(RAW_BASE(branch, "glossary/tags.json")); } catch {}

  const { cache, index } = buildIndex(entries, /*caseSensitive*/ false);
  const meta = Object.assign({}, DEFAULT_META, { lastUpdated: Date.now(), branch });
  await chrome.storage.local.set({ [STORAGE.cache]: cache, [STORAGE.index]: index, [STORAGE.tags]: tags, [STORAGE.meta]: meta });
}

async function getBranchFallback() {
  // Try main -> master -> API default_branch
  let branch = "main";
  try {
    const probemain = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/main/README.md`, {cache:"no-cache"});
    if (probemain.ok) return "main";
  } catch {}
  try {
    const probemaster = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/master/README.md`, {cache:"no-cache"});
    if (probemaster.ok) return "master";
  } catch {}
  try {
    const info = await fetchJSON(API_BASE);
    return info?.default_branch || "main";
  } catch {}
  return "main";
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}

function buildIndex(entries, caseSensitive) {
  const seen = new Set();
  const cache = [];
  const index = {};
  const addToken = (t, i) => {
    const k = caseSensitive ? t : String(t).toLowerCase();
    if (!index[k]) index[k] = i;
  };
  for (const e of entries) {
    if (!e || !e.id || !Array.isArray(e.names)) continue;
    const signature = e.id;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const i = cache.length;
    cache.push(e);
    for (const group of ["names", "aliases", "abbr", "patterns"]) {
      const arr = Array.isArray(e[group]) ? e[group] : [];
      for (const t of arr) if (t && typeof t === "string") addToken(t, i);
    }
  }
  return { cache, index };
}


const STORAGE_META = "ems_glossary_meta_v3";
const DEFAULT_META = {
  useTagColors: true, highlightUnderline: true, fontScale: 1.0,
  popupMaxHeightVh: 76, popupMaxWidthPx: 580, imageThumbMaxW: 220, imageThumbMaxH: 180,
  highlightCap: 700, hoverDelayMs: 100, enabledTags: {}
};

async function loadMeta() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "getGlossaryCache" }, (res) => {
    const meta = Object.assign({}, DEFAULT_META, res?.meta || {});
    resolve({ meta, tags: res?.tags || {} });
  }));
}

document.addEventListener("DOMContentLoaded", async () => {
  const { meta, tags } = await loadMeta();
  const ids = ["fontScale","popupMaxHeightVh","popupMaxWidthPx","imageThumbMaxW","imageThumbMaxH","highlightCap","hoverDelayMs","useTagColors","highlightUnderline"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el.type === "checkbox") el.checked = !!meta[id]; else el.value = meta[id];
  }
  // build tag chips
  const tagWrap = document.getElementById("tags");
  const enabled = Object.assign({}, meta.enabledTags || {});
  const tagKeys = Object.keys(tags).sort();
  for (const k of tagKeys) {
    const chip = document.createElement("div"); chip.className = "tag"; chip.textContent = k; if (enabled[k] === false) chip.classList.add("off");
    chip.onclick = () => { enabled[k] = !(enabled[k] === false); chip.classList.toggle("off", enabled[k]===false); };
    tagWrap.appendChild(chip);
  }
  document.getElementById("save").onclick = async () => {
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      out[id] = (el.type === "checkbox") ? el.checked : Number(el.value);
    }
    out.enabledTags = enabled;
    await chrome.runtime.sendMessage({ type: "updateMeta", patch: out });
    alert("Saved. Reload pages to apply.");
  };
});

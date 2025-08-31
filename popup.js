
function hostname() { try { return new URL(location.href).hostname.replace(/^www\./,""); } catch { return ""; } }
document.getElementById("refresh").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "forceRefresh" });
  window.close();
};
document.getElementById("palette").onclick = async () => {
  // Dispatch a message to content to open palette
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.id) chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => {
    const ev = new KeyboardEvent('keydown', {key:'k', metaKey: /Mac|iPhone|iPad/.test(navigator.platform), ctrlKey: !/Mac|iPhone|iPad/.test(navigator.platform)});
    document.dispatchEvent(ev);
  }});
};
document.getElementById("options").onclick = () => chrome.runtime.openOptionsPage();

chrome.runtime.sendMessage({ type: "getGlossaryCache" }, (res) => {
  const n = (res.cache || []).length;
  const t = res.meta?.lastUpdated ? new Date(res.meta.lastUpdated).toLocaleString() : "never";
  const b = res.meta?.branch || "main";
  document.getElementById("meta").textContent = `${n} terms • branch ${b} • updated ${t}`;
  const domainRules = res.meta?.domainRules || {};
  const enabled = (hostname() in domainRules) ? domainRules[hostname()] : (res.meta?.enableOnThisSite !== false);
  const toggleBtn = document.getElementById("toggle");
  const setLabel = (on) => toggleBtn.textContent = on ? "Disable on this site" : "Enable on this site";
  setLabel(enabled);
  toggleBtn.onclick = async () => {
    const next = !((hostname() in domainRules) ? domainRules[hostname()] : (res.meta?.enableOnThisSite !== false));
    const rules = Object.assign({}, domainRules, { [hostname()]: next });
    await chrome.runtime.sendMessage({ type: "updateMeta", patch: { domainRules: rules } });
    setLabel(next);
  };
});

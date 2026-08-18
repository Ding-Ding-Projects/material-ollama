const STORAGE_KEY = "material-ollama-landing-settings-v1";

const DEFAULT_STATE = {
  activeTab: "overview",
  languageMode: "en",
  funnyEnglish: 3,
  funnyChinese: 3,
  showEmoji: true,
  theme: "dark",
  density: "comfortable",
  vocabularyLoaded: false,
};

const state = loadState();
const tabs = [...document.querySelectorAll("[data-tab]")];
const panels = [...document.querySelectorAll("[data-panel]")];
const searchInput = document.querySelector("#site-search-input");
const searchStatus = document.querySelector("#search-status");
const regexPopover = document.querySelector("#regex-popover");
const regexPattern = document.querySelector("#regex-pattern");
const regexFlags = document.querySelector("#regex-flags");
const regexSample = document.querySelector("#regex-sample");
const regexResult = document.querySelector("#regex-result");
let searchMode = "plain";

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...DEFAULT_STATE, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  const persistable = { ...state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
}

function applyState() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.density = state.density;
  document.documentElement.dataset.language = state.languageMode;
  document.querySelector("#language-mode").value = state.languageMode;
  document.querySelector("#funny-en").value = state.funnyEnglish;
  document.querySelector("#funny-zh").value = state.funnyChinese;
  document.querySelector("#funny-en-value").value = state.funnyEnglish;
  document.querySelector("#funny-en-value").textContent = state.funnyEnglish;
  document.querySelector("#funny-zh-value").value = state.funnyChinese;
  document.querySelector("#funny-zh-value").textContent = state.funnyChinese;
  document.querySelector("#show-emoji").checked = Boolean(state.showEmoji);
  document.querySelector("#theme-mode").value = state.theme;
  document.querySelector("#density-mode").value = state.density;
  document.querySelector("#vocabulary-status").textContent = state.vocabularyLoaded
    ? "A valid file was supplied in this browser session. Its contents stay local and are not shown here."
    : "No file loaded. This page keeps its original wording.";
  switchTab(state.activeTab, false);
}

function switchTab(tabName, persist = true) {
  const validTab = tabs.some((tab) => tab.dataset.tab === tabName) ? tabName : "overview";
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === validTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => {
    const active = panel.dataset.panel === validTab;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (persist) {
    state.activeTab = validTab;
    saveState();
  }
  const hash = `#${validTab}`;
  if (window.location.hash !== hash) history.replaceState(null, "", hash);
  document.querySelector("#content").focus({ preventScroll: true });
  runSearch();
}

function handleTabKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = tabs.indexOf(event.currentTarget);
  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex].focus();
}

function openRegexPopover() {
  regexPopover.hidden = false;
  document.querySelectorAll("[data-regex-toggle]").forEach((button) => button.setAttribute("aria-expanded", "true"));
  regexPattern.focus();
  updateRegexPreview();
}

function closeRegexPopover() {
  regexPopover.hidden = true;
  document.querySelectorAll("[data-regex-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function buildRegex() {
  try {
    return { regex: new RegExp(regexPattern.value, regexFlags.value), error: "" };
  } catch (error) {
    return { regex: null, error: error instanceof Error ? error.message : "Invalid regular expression" };
  }
}

function updateRegexPreview() {
  if (!regexPattern.value) {
    regexResult.textContent = "Enter a pattern to preview it.";
    regexResult.classList.remove("is-error");
    return;
  }
  const { regex, error } = buildRegex();
  if (error) {
    regexResult.textContent = `Pattern error: ${error}`;
    regexResult.classList.add("is-error");
    return;
  }
  const matches = regexSample.value.match(regex);
  regexResult.textContent = matches ? `Preview matched ${matches.length} segment${matches.length === 1 ? "" : "s"}.` : "Preview has no matches.";
  regexResult.classList.remove("is-error");
}

function runSearch() {
  const query = searchInput.value.trim();
  const searchable = [...document.querySelectorAll("[data-searchable]")];
  const emptySearch = document.querySelector("#global-no-results");
  if (!query) {
    searchable.forEach((item) => { item.hidden = false; });
    emptySearch.hidden = true;
    searchStatus.textContent = searchMode === "regex" ? "Regex search is active." : "Plain-text search is active.";
    return;
  }
  let matcher;
  if (searchMode === "regex") {
    try { matcher = new RegExp(query, regexFlags.value || "i"); }
    catch (error) { searchStatus.textContent = `Pattern error: ${error instanceof Error ? error.message : "invalid pattern"}`; return; }
  } else {
    const lowered = query.toLocaleLowerCase();
    matcher = { test: (value) => value.toLocaleLowerCase().includes(lowered) };
  }
  let visible = 0;
  searchable.forEach((item) => {
    const matches = matcher.test(`${item.dataset.searchable || ""} ${item.textContent || ""}`);
    item.hidden = !matches;
    if (matches) visible += 1;
  });
  emptySearch.hidden = visible !== 0;
  searchStatus.textContent = `${visible} matching surface${visible === 1 ? "" : "s"} · ${searchMode === "regex" ? "regex" : "plain text"}`;
}

function setSetting(name, value) {
  state[name] = value;
  saveState();
  applyState();
  const status = document.querySelector("#settings-status");
  if (status) status.textContent = "Saved locally in this browser.";
}

function exportSettings() {
  const safeState = { ...state, vocabularyLoaded: Boolean(state.vocabularyLoaded) };
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, settings: safeState }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "material-ollama-site-settings.json";
  link.click();
  URL.revokeObjectURL(url);
  document.querySelector("#settings-status").textContent = "Settings exported. Private file contents were not included.";
}

function importSettings(file) {
  if (!file) return;
  if (file.size > 128 * 1024) {
    document.querySelector("#settings-status").textContent = "Import refused: the settings file is larger than 128 KiB.";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const incoming = parsed?.settings;
      if (!incoming || parsed.schemaVersion !== 1 || typeof incoming !== "object") throw new Error("unsupported settings schema");
      ["languageMode", "funnyEnglish", "funnyChinese", "showEmoji", "theme", "density"].forEach((key) => {
        if (key in incoming) state[key] = incoming[key];
      });
      state.vocabularyLoaded = false;
      saveState();
      applyState();
      document.querySelector("#settings-status").textContent = "Settings imported. The private vocabulary file was intentionally omitted.";
    } catch (error) {
      document.querySelector("#settings-status").textContent = `Import refused: ${error instanceof Error ? error.message : "invalid JSON"}.`;
    }
  });
  reader.readAsText(file);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  tab.addEventListener("keydown", handleTabKeydown);
});
document.querySelectorAll("[data-tab-link]").forEach((link) => link.addEventListener("click", () => switchTab(link.dataset.tabLink)));
document.querySelectorAll("[data-regex-toggle]").forEach((button) => button.addEventListener("click", () => regexPopover.hidden ? openRegexPopover() : closeRegexPopover()));
document.querySelector("[data-regex-close]").addEventListener("click", closeRegexPopover);
document.querySelector("[data-apply-regex]").addEventListener("click", () => {
  const { error } = buildRegex();
  if (error || !regexPattern.value) { updateRegexPreview(); return; }
  searchMode = "regex";
  searchInput.value = regexPattern.value;
  closeRegexPopover();
  runSearch();
  searchInput.focus();
});
document.querySelector("[data-clear-search]").addEventListener("click", () => { searchInput.value = ""; searchMode = "plain"; closeRegexPopover(); runSearch(); searchInput.focus(); });
searchInput.addEventListener("input", runSearch);
[regexPattern, regexFlags, regexSample].forEach((field) => field.addEventListener("input", updateRegexPreview));
document.querySelectorAll("[data-article]").forEach((button) => button.addEventListener("click", () => { document.querySelector(`#${button.dataset.article}`).hidden = false; button.closest(".panel").querySelector(".article-detail").scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
document.querySelector("[data-close-article]").addEventListener("click", (event) => { event.currentTarget.closest(".article-detail").hidden = true; });

document.querySelector("#language-mode").addEventListener("change", (event) => setSetting("languageMode", event.target.value));
document.querySelector("#funny-en").addEventListener("input", (event) => setSetting("funnyEnglish", Number(event.target.value)));
document.querySelector("#funny-zh").addEventListener("input", (event) => setSetting("funnyChinese", Number(event.target.value)));
document.querySelector("#show-emoji").addEventListener("change", (event) => setSetting("showEmoji", event.target.checked));
document.querySelector("#theme-mode").addEventListener("change", (event) => setSetting("theme", event.target.value));
document.querySelector("#density-mode").addEventListener("change", (event) => setSetting("density", event.target.value));
document.querySelector("#export-settings").addEventListener("click", exportSettings);
document.querySelector("#import-settings").addEventListener("change", (event) => importSettings(event.target.files?.[0]));
document.querySelector("#reset-settings").addEventListener("click", () => { Object.assign(state, DEFAULT_STATE); saveState(); applyState(); document.querySelector("#settings-status").textContent = "Settings reset to the page's shipped values."; });
document.querySelector("#clear-vocabulary").addEventListener("click", () => { state.vocabularyLoaded = false; saveState(); applyState(); document.querySelector("#settings-status").textContent = "Private vocabulary state cleared."; });
document.querySelector("#vocabulary-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 256 * 1024) { document.querySelector("#vocabulary-status").textContent = "File refused: the local vocabulary limit is 256 KiB."; return; }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("the root value must be an object");
      state.vocabularyLoaded = true;
      saveState();
      applyState();
    } catch (error) {
      state.vocabularyLoaded = false;
      saveState();
      document.querySelector("#vocabulary-status").textContent = `File refused: ${error instanceof Error ? error.message : "invalid JSON"}.`;
    }
  });
  reader.readAsText(file);
  event.target.value = "";
});

function updateHeartbeat() {
  const now = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  document.querySelector("#heartbeat").textContent = now;
}

const requestedTab = window.location.hash.slice(1);
applyState();
if (requestedTab) switchTab(requestedTab, false);
updateHeartbeat();
window.setInterval(updateHeartbeat, 1000);

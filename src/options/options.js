import { loadSettings, saveSettings } from "../shared/defaults.js";
import { describeSelectivity } from "../shared/ranking.js";
import { describeProgress, runRefresh } from "../shared/refresh-progress.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#save-status");
const novelty = document.querySelector("#novelty-selectivity");
const authorship = document.querySelector("#authorship-selectivity");
const categoryOptions = document.querySelector("#category-options");
const categorySummary = document.querySelector("#category-summary");
let currentSettings = null;
let taxonomy = [];
let formDirty = false;

function renderUsage(usage = {}) {
  // OpenAlex's standard API is free, so requests are the honest unit here. The
  // internal budget guard still exists to stop a runaway pass.
  const requests = Math.max(0, Number(usage.requests || 0));
  const cost = Math.max(0, Number(usage.costUsd || 0));
  document.querySelector("#usage-cost").textContent = requests.toLocaleString();
  document.querySelector("#usage-bar").style.width = `${Math.min(100, cost * 100)}%`;
  document.querySelector("#usage-detail").textContent = requests
    ? `Recorded in this browser only${usage.hasEstimatedCalls ? " · includes estimates" : ""}. Resets at midnight UTC.`
    : "No calls recorded today.";
}

function applySavedConfig(saved) {
  currentSettings = { ...currentSettings, ...saved };
  document.querySelector("#queries").value = (saved.queries || []).join("\n");
  novelty.value = saved.noveltySelectivity || novelty.value; authorship.value = saved.authorshipSelectivity || authorship.value;
  document.querySelector("#default-window").value = saved.defaultWindow || "week"; document.querySelector("#default-sort").value = saved.defaultSort || "balanced";
  renderTaxonomy(currentSettings); syncRanges(); formDirty = true; status.textContent = "Configuration restored. Save to apply it.";
}

function renderHistory(history = []) {
  const container = document.querySelector("#search-history"); container.replaceChildren();
  if (!history.length) { const empty = document.createElement("p"); empty.className = "hint"; empty.textContent = "No saved configurations yet."; container.append(empty); return; }
  for (const entry of history) {
    const row = document.createElement("div"); row.className = "history-row"; const copy = document.createElement("div");
    const scope = entry.settings?.selectedSubfields?.length ? `${entry.settings.selectedSubfields.length} subfields` : entry.settings?.selectedFields?.length ? `${entry.settings.selectedFields.length} fields` : "Preview";
    copy.textContent = entry.settings?.queries?.join(" · ") || scope; const meta = document.createElement("small"); meta.textContent = `${scope} · ${entry.resultCount || 0} matched · ${new Date(entry.savedAt).toLocaleString()}`; copy.append(meta);
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Restore"; button.addEventListener("click", () => applySavedConfig(entry.settings || {})); row.append(copy, button); container.append(row);
  }
}

async function send(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || "The extension did not respond");
  return response.result;
}

function selectedTaxonomy() {
  const fieldIds = [];
  const subfieldIds = [];
  const arxivGroups = [];
  const arxivCategories = [];
  for (const field of categoryOptions.querySelectorAll(".taxonomy-field")) {
    const parent = field.querySelector("input[data-field]");
    if (parent.checked) {
      fieldIds.push(...JSON.parse(parent.dataset.openalexFields || "[]"));
      if (parent.dataset.kind === "arxiv") arxivGroups.push(parent.value);
      continue;
    }
    for (const input of field.querySelectorAll("input[data-subfield]:checked")) {
      if (input.dataset.kind === "arxiv") arxivCategories.push(input.value);
      fieldIds.push(...JSON.parse(input.dataset.openalexFields || "[]"));
      subfieldIds.push(...JSON.parse(input.dataset.openalexSubfields || "[]"));
    }
  }
  return { fieldIds: [...new Set(fieldIds)], subfieldIds: [...new Set(subfieldIds)], arxivGroups, arxivCategories };
}

function updateCategorySummary() {
  const { arxivGroups, arxivCategories } = selectedTaxonomy();
  const pieces = [];
  if (arxivGroups.length) pieces.push(`${arxivGroups.length} arXiv group${arxivGroups.length === 1 ? "" : "s"}`);
  if (arxivCategories.length) pieces.push(`${arxivCategories.length} arXiv categor${arxivCategories.length === 1 ? "y" : "ies"}`);
  const generalFields = categoryOptions.querySelectorAll('input[data-kind="openalex"]:checked').length;
  if (generalFields) pieces.push(`${generalFields} general categor${generalFields === 1 ? "y" : "ies"}`);
  categorySummary.textContent = pieces.join(" · ") || "All research · preview mode";
}

function syncParent(fieldElement) {
  const parent = fieldElement.querySelector("input[data-field]");
  const children = [...fieldElement.querySelectorAll("input[data-subfield]")];
  const checked = children.filter((input) => input.checked).length;
  parent.indeterminate = checked > 0 && checked < children.length;
  parent.checked = children.length > 0 && checked === children.length;
  for (const child of children) child.disabled = parent.checked;
}

function renderTaxonomy(settings) {
  const selectedGroups = new Set(settings.selectedArxivGroups || []);
  const selectedCategories = new Set(settings.selectedArxivCategories || []);
  categoryOptions.replaceChildren();
  for (const field of taxonomy) {
    const details = document.createElement("details");
    details.className = "taxonomy-field";
    const summary = document.createElement("summary");
    const parentLabel = document.createElement("label");
    parentLabel.className = "taxonomy-parent";
    const parent = document.createElement("input");
    parent.type = "checkbox";
    parent.value = field.id;
    parent.dataset.field = field.id;
    parent.dataset.kind = field.kind || "arxiv";
    parent.checked = parent.dataset.kind === "arxiv" ? selectedGroups.has(field.id) : (field.openAlexFieldIds || []).some((id) => (settings.selectedFields || []).includes(String(id)));
    parent.dataset.openalexFields = JSON.stringify(field.openAlexFieldIds || []);
    parent.addEventListener("click", (event) => event.stopPropagation());
    parent.addEventListener("change", () => {
      for (const child of details.querySelectorAll("input[data-subfield]")) {
        child.checked = parent.checked;
        child.disabled = parent.checked;
      }
      parent.indeterminate = false;
      updateCategorySummary();
    });
    const name = document.createElement("span");
    name.textContent = field.name;
    const count = document.createElement("small");
    count.className = "disclosure";
    const total = field.subfields?.length || 0;
    const updateDisclosure = () => {
      count.textContent = details.open ? `Hide ${total} ▴` : `${total} subfields ▾`;
    };
    updateDisclosure();
    details.addEventListener("toggle", updateDisclosure);
    parentLabel.append(parent, name);
    summary.append(parentLabel, count);
    const children = document.createElement("div");
    children.className = "taxonomy-subfields";
    for (const subfield of field.subfields || []) {
      const label = document.createElement("label");
      label.className = "category-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = subfield.id;
      input.dataset.subfield = subfield.id;
      input.dataset.kind = field.kind || "arxiv";
      input.checked = parent.checked || (input.dataset.kind === "arxiv" ? selectedCategories.has(subfield.id) : (subfield.openAlexSubfieldIds || []).some((id) => (settings.selectedSubfields || []).includes(String(id))));
      input.dataset.openalexFields = JSON.stringify(subfield.openAlexFieldIds || []);
      input.dataset.openalexSubfields = JSON.stringify(subfield.openAlexSubfieldIds || []);
      input.disabled = parent.checked;
      input.addEventListener("change", () => {
        syncParent(details);
        updateCategorySummary();
      });
      label.append(input, document.createTextNode(subfield.name));
      children.append(label);
    }
    details.append(summary, children);
    categoryOptions.append(details);
    if (!parent.checked) syncParent(details);
  }
  updateCategorySummary();
}

function syncRange(input, valueSelector, guideSelector) {
  document.querySelector(valueSelector).textContent = input.value;
  document.querySelector(guideSelector).textContent = describeSelectivity(input.value);
}

function syncRanges() {
  syncRange(novelty, "#novelty-selectivity-value", "#novelty-guide");
  syncRange(authorship, "#authorship-selectivity-value", "#authorship-guide");
}

novelty.addEventListener("input", syncRanges);
authorship.addEventListener("input", syncRanges);

async function populate() {
  const [settings, fields, usage, history] = await Promise.all([loadSettings(), send("GET_TAXONOMY"), send("GET_API_USAGE"), send("GET_SEARCH_HISTORY")]);
  currentSettings = settings;
  taxonomy = fields;
  document.querySelector("#queries").value = settings.queries.join("\n");
  novelty.value = settings.noveltySelectivity;
  authorship.value = settings.authorshipSelectivity;
  document.querySelector("#default-window").value = settings.defaultWindow;
  document.querySelector("#default-sort").value = settings.defaultSort;
  document.querySelector("#auto-scan").value = String(settings.autoScanHours ?? 0);
  document.querySelector("#english-only").checked = settings.englishOnly;
  document.querySelector("#strict-interest").checked = Boolean(settings.strictInterestFilter);
  document.querySelector("#notifications-enabled").checked = settings.notificationsEnabled;
  document.querySelector("#api-key").value = settings.apiKey;
  renderTaxonomy(settings);
  syncRanges();
  renderUsage(usage); renderHistory(history);
}

async function resolveNotificationPermission(requested) {
  const permission = { permissions: ["notifications"] };
  if (requested) return chrome.permissions.request(permission);
  const present = await chrome.permissions.contains(permission);
  if (!requested && present) await chrome.permissions.remove(permission);
  return requested;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Saving…";
  try {
    const notificationsEnabled = await resolveNotificationPermission(
      document.querySelector("#notifications-enabled").checked,
    );
    document.querySelector("#notifications-enabled").checked = notificationsEnabled;
    const selected = selectedTaxonomy();
    const apiKey = document.querySelector("#api-key").value.trim();
    // Index depth is owned by the side panel and can change while this page is
    // open. Re-reading here stops a stale snapshot from reverting it on save.
    const live = await loadSettings();
    const savedSettings = await saveSettings({
      ...currentSettings,
      maxTimeframeDays: live.maxTimeframeDays,
      queries: document.querySelector("#queries").value.split("\n").map((value) => value.trim()).filter(Boolean),
      noveltySelectivity: Number(novelty.value),
      authorshipSelectivity: Number(authorship.value),
      defaultWindow: document.querySelector("#default-window").value,
      defaultSort: document.querySelector("#default-sort").value,
      autoScanHours: Number(document.querySelector("#auto-scan").value),
      selectedFields: selected.fieldIds,
      selectedSubfields: selected.subfieldIds,
      selectedArxivGroups: selected.arxivGroups,
      selectedArxivCategories: selected.arxivCategories,
      englishOnly: document.querySelector("#english-only").checked,
      strictInterestFilter: document.querySelector("#strict-interest").checked,
      notificationsEnabled,
      apiKey,
    });
    currentSettings = { ...savedSettings, apiKey };
    formDirty = false;
    await send("SETTINGS_CHANGED");
    status.textContent = "Saved locally. No discovery or API request was started.";
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector("#rebuild-index").addEventListener("click", async (event) => {
  const typedKey = document.querySelector("#api-key").value.trim();
  if (!typedKey) {
    status.textContent = "Add and save your personal OpenAlex API key before rebuilding.";
    return;
  }
  if (typedKey !== currentSettings?.apiKey) {
    status.textContent = "Save the new API key and field selection before rebuilding.";
    return;
  }
  if (formDirty) {
    status.textContent = "Save your changed filters before rebuilding.";
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = "Running a discovery pass at the index depth set in the side panel… keep Chrome open.";
  try {
    const result = await runRefresh(send, {
      reason: "rebuild",
      onProgress: (state) => {
        const detail = describeProgress(state);
        if (detail) status.textContent = `Running · ${detail}`;
      },
    });
    status.textContent = `Indexed ${Number(result.indexedRetrieved || 0).toLocaleString()} papers; estimated OpenAlex cost $${Number(result.estimatedApiCostUsd || 0).toFixed(3)}.`;
    renderUsage(await send("GET_API_USAGE")); renderHistory(await send("GET_SEARCH_HISTORY"));
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#clear-data").addEventListener("click", async () => {
  if (!window.confirm("Clear all screened papers, author metrics, and score history?")) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_DATA" });
    status.textContent = response?.ok ? "Research database cleared." : response?.error || "Could not clear the database.";
  } catch (error) {
    status.textContent = error.message;
  }
});

populate().catch((error) => {
  status.textContent = error.message;
});

form.addEventListener("input", () => {
  formDirty = true;
});
form.addEventListener("change", () => {
  formDirty = true;
});

import { loadSettings, saveSettings } from "../shared/defaults.js";
import { describeSelectivity } from "../shared/ranking.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#save-status");
const novelty = document.querySelector("#novelty-selectivity");
const authorship = document.querySelector("#authorship-selectivity");
const categoryOptions = document.querySelector("#category-options");
const categorySummary = document.querySelector("#category-summary");
let currentSettings = null;
let taxonomy = [];
let formDirty = false;

async function send(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || "The extension did not respond");
  return response.result;
}

function selectedTaxonomy() {
  const fieldIds = [];
  const subfieldIds = [];
  for (const field of categoryOptions.querySelectorAll(".taxonomy-field")) {
    const parent = field.querySelector("input[data-field]");
    if (parent.checked) {
      fieldIds.push(parent.value);
      continue;
    }
    subfieldIds.push(
      ...[...field.querySelectorAll("input[data-subfield]:checked")].map((input) => input.value),
    );
  }
  return { fieldIds, subfieldIds };
}

function updateCategorySummary() {
  const { fieldIds, subfieldIds } = selectedTaxonomy();
  const pieces = [];
  if (fieldIds.length) pieces.push(`${fieldIds.length} full field${fieldIds.length === 1 ? "" : "s"}`);
  if (subfieldIds.length) pieces.push(`${subfieldIds.length} subfield${subfieldIds.length === 1 ? "" : "s"}`);
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
  const selectedFields = new Set(settings.selectedFields || []);
  const selectedSubfields = new Set(settings.selectedSubfields || []);
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
    parent.checked = selectedFields.has(field.id);
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
    count.textContent = `${field.subfields?.length || 0} subfields`;
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
      input.checked = parent.checked || selectedSubfields.has(subfield.id);
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
  const [settings, fields] = await Promise.all([loadSettings(), send("GET_TAXONOMY")]);
  currentSettings = settings;
  taxonomy = fields;
  document.querySelector("#queries").value = settings.queries.join("\n");
  novelty.value = settings.noveltySelectivity;
  authorship.value = settings.authorshipSelectivity;
  document.querySelector("#default-window").value = settings.defaultWindow;
  document.querySelector("#default-sort").value = settings.defaultSort;
  document.querySelector("#refresh-hours").value = String(settings.refreshHours);
  document.querySelector("#show-arxiv-badges").checked = settings.showArxivBadges;
  document.querySelector("#english-only").checked = settings.englishOnly;
  document.querySelector("#notifications-enabled").checked = settings.notificationsEnabled;
  document.querySelector("#api-key").value = settings.apiKey;
  renderTaxonomy(settings);
  syncRanges();
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
    const savedSettings = await saveSettings({
      ...currentSettings,
      queries: document.querySelector("#queries").value.split("\n").map((value) => value.trim()).filter(Boolean),
      noveltySelectivity: Number(novelty.value),
      authorshipSelectivity: Number(authorship.value),
      defaultWindow: document.querySelector("#default-window").value,
      defaultSort: document.querySelector("#default-sort").value,
      refreshHours: Number(document.querySelector("#refresh-hours").value),
      showArxivBadges: document.querySelector("#show-arxiv-badges").checked,
      selectedFields: selected.fieldIds,
      selectedSubfields: selected.subfieldIds,
      englishOnly: document.querySelector("#english-only").checked,
      notificationsEnabled,
      apiKey,
    });
    currentSettings = { ...savedSettings, apiKey };
    formDirty = false;
    await send("SETTINGS_CHANGED");
    status.textContent = currentSettings.selectedFields.length || currentSettings.selectedSubfields.length
      ? "Saved. Filters apply now; a new field scope automatically starts a complete 30-day build."
      : "Saved. With no field selected, the feed uses a cross-disciplinary preview.";
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
  event.currentTarget.disabled = true;
  status.textContent = "Rebuilding the full 30-day index… keep Chrome open; broad fields can take several minutes.";
  try {
    const result = await send("REBUILD");
    status.textContent = `Indexed ${result.indexedRetrieved} papers; estimated OpenAlex cost $${Number(result.estimatedApiCostUsd || 0).toFixed(3)}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.querySelector("#clear-data").addEventListener("click", async () => {
  if (!window.confirm("Clear all screened papers, author metrics, and score history?")) return;
  const response = await chrome.runtime.sendMessage({ type: "CLEAR_DATA" });
  status.textContent = response?.ok ? "Research database cleared." : response?.error;
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

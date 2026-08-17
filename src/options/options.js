import { loadSettings, saveSettings } from "../shared/defaults.js";
import { RESEARCH_CATEGORIES } from "../shared/filters.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#save-status");
const novelty = document.querySelector("#min-novelty");
const researcher = document.querySelector("#min-researcher");
const categoryOptions = document.querySelector("#category-options");
const categorySummary = document.querySelector("#category-summary");
let currentSettings = null;

function selectedCategoryIds() {
  return [...categoryOptions.querySelectorAll("input:checked")].map((input) => input.value);
}

function updateCategorySummary() {
  const selected = selectedCategoryIds();
  categorySummary.textContent = selected.length
    ? `${selected.length} categor${selected.length === 1 ? "y" : "ies"} selected`
    : "All research";
}

function renderCategories(selected = []) {
  const chosen = new Set(selected);
  categoryOptions.replaceChildren();
  for (const category of RESEARCH_CATEGORIES) {
    const label = document.createElement("label");
    label.className = "category-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = category.id;
    input.checked = chosen.has(category.id);
    input.addEventListener("change", updateCategorySummary);
    label.append(input, document.createTextNode(category.label));
    categoryOptions.append(label);
  }
  updateCategorySummary();
}

function syncRange(input, output) {
  document.querySelector(output).textContent = input.value;
}

novelty.addEventListener("input", () => syncRange(novelty, "#min-novelty-value"));
researcher.addEventListener("input", () => syncRange(researcher, "#min-researcher-value"));

async function populate() {
  const settings = await loadSettings();
  currentSettings = settings;
  document.querySelector("#queries").value = settings.queries.join("\n");
  novelty.value = settings.minNovelty;
  researcher.value = settings.minResearcher;
  document.querySelector("#default-window").value = settings.defaultWindow;
  document.querySelector("#default-sort").value = settings.defaultSort;
  document.querySelector("#refresh-hours").value = String(settings.refreshHours);
  document.querySelector("#show-arxiv-badges").checked = settings.showArxivBadges;
  document.querySelector("#english-only").checked = settings.englishOnly;
  document.querySelector("#notifications-enabled").checked = settings.notificationsEnabled;
  document.querySelector("#api-key").value = settings.apiKey;
  renderCategories(settings.selectedCategories);
  syncRange(novelty, "#min-novelty-value");
  syncRange(researcher, "#min-researcher-value");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Saving…";
  try {
    await saveSettings({
      ...currentSettings,
      queries: document
        .querySelector("#queries")
        .value.split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      minNovelty: Number(novelty.value),
      minResearcher: Number(researcher.value),
      defaultWindow: document.querySelector("#default-window").value,
      defaultSort: document.querySelector("#default-sort").value,
      refreshHours: Number(document.querySelector("#refresh-hours").value),
      showArxivBadges: document.querySelector("#show-arxiv-badges").checked,
      selectedCategories: selectedCategoryIds(),
      englishOnly: document.querySelector("#english-only").checked,
      notificationsEnabled: document.querySelector("#notifications-enabled").checked,
      apiKey: document.querySelector("#api-key").value,
    });
    await chrome.runtime.sendMessage({ type: "SETTINGS_CHANGED" });
    status.textContent = "Saved. Filters apply now; Chrome is screening a fresh sample.";
  } catch (error) {
    status.textContent = error.message;
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

import {
  legacySelection,
  normalizeFieldIds,
  normalizeSubfieldIds,
} from "./filters.js";

export const WINDOWS = Object.freeze({
  day: { label: "Past day", days: 1 },
  "3d": { label: "Past 3 days", days: 3 },
  week: { label: "Past week", days: 7 },
  "2w": { label: "Past 2 weeks", days: 14 },
  month: { label: "Past month", days: 30 },
  "3m": { label: "Past 3 months", days: 90 },
  "6m": { label: "Past 6 months", days: 180 },
  year: { label: "Past year", days: 365 },
});

export const DEFAULT_SETTINGS = Object.freeze({
  queries: [],
  selectedFields: [],
  selectedSubfields: [],
  englishOnly: true,
  notificationsEnabled: false,
  defaultWindow: "week",
  defaultSort: "balanced",
  noveltySelectivity: 70,
  authorshipSelectivity: 70,
  refreshHours: 6,
  broadSample: 500,
  perQuery: 5000,
  baselinePerSubfield: 320,
  historyYears: 3,
  maxQueries: 5,
  maxAuthors: 50_000,
  maxDiscoveryWorks: 200_000,
  maxReferenceWorks: 6_000,
  maxPeerComparisons: 320,
  incrementalLookbackDays: 2,
  fullRebuildDays: 7,
  fullScanBudgetUsd: 0.75,
  incrementalScanBudgetUsd: 0.02,
  showArxivBadges: true,
});

export const INCREMENTAL_MARKERS = Object.freeze([
  "improved",
  "enhanced",
  "extension of",
  "variant of",
  "revisiting",
  "comparative study",
  "benchmarking",
  "fine-tuning",
  "fine tuning",
]);

export const SETTINGS_KEY = "settings";
export const SECRET_KEY = "openAlexApiKey";
export const REFRESH_ALARM = "filteredresearch-refresh";

export function normalizeSettings(value = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...value };
  merged.noveltySelectivity =
    value.noveltySelectivity ?? value.minNovelty ?? DEFAULT_SETTINGS.noveltySelectivity;
  merged.authorshipSelectivity =
    value.authorshipSelectivity ?? value.minResearcher ?? DEFAULT_SETTINGS.authorshipSelectivity;
  merged.queries = Array.isArray(merged.queries)
    ? merged.queries
        .map((query) => String(query).trim())
        .filter(Boolean)
        .slice(0, DEFAULT_SETTINGS.maxQueries)
    : [];
  const legacy = legacySelection(value.selectedCategories);
  merged.selectedFields = normalizeFieldIds(value.selectedFields).length
    ? normalizeFieldIds(value.selectedFields)
    : legacy.fieldIds;
  merged.selectedSubfields = normalizeSubfieldIds(value.selectedSubfields).length
    ? normalizeSubfieldIds(value.selectedSubfields)
    : legacy.subfieldIds;
  merged.defaultWindow = WINDOWS[merged.defaultWindow] ? merged.defaultWindow : "week";
  merged.defaultSort = ["balanced", "novelty", "researcher", "newest"].includes(
    merged.defaultSort,
  )
    ? merged.defaultSort
    : "balanced";

  const numericBounds = {
    noveltySelectivity: [1, 100],
    authorshipSelectivity: [1, 100],
    refreshHours: [1, 24],
    broadSample: [100, 1000],
    perQuery: [100, 10_000],
    baselinePerSubfield: [100, 500],
    historyYears: [1, 10],
    maxAuthors: [1000, 100_000],
    maxDiscoveryWorks: [5000, 250_000],
    maxReferenceWorks: [1000, 20_000],
    maxPeerComparisons: [50, 800],
    incrementalLookbackDays: [1, 7],
    fullRebuildDays: [3, 30],
    fullScanBudgetUsd: [0.05, 0.75],
    incrementalScanBudgetUsd: [0.005, 0.1],
  };
  for (const [key, [minimum, maximum]] of Object.entries(numericBounds)) {
    const parsed = Number(merged[key]);
    merged[key] = Number.isFinite(parsed)
      ? Math.min(maximum, Math.max(minimum, parsed))
      : DEFAULT_SETTINGS[key];
  }
  merged.showArxivBadges = Boolean(merged.showArxivBadges);
  merged.englishOnly = merged.englishOnly !== false;
  merged.notificationsEnabled = Boolean(merged.notificationsEnabled);
  delete merged.selectedCategories;
  delete merged.minNovelty;
  delete merged.minResearcher;
  return merged;
}

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const local = await chrome.storage.local.get(SECRET_KEY);
  return {
    ...normalizeSettings(stored[SETTINGS_KEY]),
    apiKey: String(local[SECRET_KEY] || "").trim(),
  };
}

export async function saveSettings(settings) {
  const { apiKey = "", ...publicSettings } = settings;
  const normalized = normalizeSettings(publicSettings);
  await Promise.all([
    chrome.storage.sync.set({ [SETTINGS_KEY]: normalized }),
    chrome.storage.local.set({ [SECRET_KEY]: String(apiKey).trim() }),
  ]);
  return normalized;
}

import { normalizeCategoryIds } from "./filters.js";

export const WINDOWS = Object.freeze({
  day: { label: "Past day", days: 1 },
  "3d": { label: "Past 3 days", days: 3 },
  week: { label: "Past week", days: 7 },
  "2w": { label: "Past 2 weeks", days: 14 },
  month: { label: "Past month", days: 30 },
});

export const DEFAULT_SETTINGS = Object.freeze({
  queries: [],
  selectedCategories: [],
  englishOnly: true,
  notificationsEnabled: true,
  defaultWindow: "week",
  defaultSort: "balanced",
  minNovelty: 70,
  minResearcher: 70,
  refreshHours: 6,
  broadSample: 160,
  perQuery: 70,
  historySample: 360,
  historyPerQuery: 100,
  historyYears: 3,
  maxQueries: 5,
  maxAuthors: 700,
  maxReferenceWorks: 1200,
  maxPeerComparisons: 320,
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
  merged.queries = Array.isArray(merged.queries)
    ? merged.queries
        .map((query) => String(query).trim())
        .filter(Boolean)
        .slice(0, DEFAULT_SETTINGS.maxQueries)
    : [];
  merged.selectedCategories = normalizeCategoryIds(merged.selectedCategories);
  merged.defaultWindow = WINDOWS[merged.defaultWindow] ? merged.defaultWindow : "week";
  merged.defaultSort = ["balanced", "novelty", "researcher", "newest"].includes(
    merged.defaultSort,
  )
    ? merged.defaultSort
    : "balanced";

  const numericBounds = {
    minNovelty: [0, 100],
    minResearcher: [0, 100],
    refreshHours: [1, 24],
    broadSample: [25, 500],
    perQuery: [10, 200],
    historySample: [100, 1000],
    historyPerQuery: [25, 300],
    historyYears: [1, 10],
    maxAuthors: [100, 1500],
    maxReferenceWorks: [200, 3000],
    maxPeerComparisons: [50, 800],
  };
  for (const [key, [minimum, maximum]] of Object.entries(numericBounds)) {
    const parsed = Number(merged[key]);
    merged[key] = Number.isFinite(parsed)
      ? Math.min(maximum, Math.max(minimum, parsed))
      : DEFAULT_SETTINGS[key];
  }
  merged.showArxivBadges = Boolean(merged.showArxivBadges);
  merged.englishOnly = merged.englishOnly !== false;
  merged.notificationsEnabled = merged.notificationsEnabled !== false;
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

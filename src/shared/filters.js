const LEGACY_CATEGORY_SELECTIONS = Object.freeze({
  ai: { subfieldIds: ["1702"] },
  "computer-science": { fieldIds: ["17"] },
  "math-stats": { fieldIds: ["18", "26"] }, physics: { fieldIds: ["31"] },
  "chem-materials": { fieldIds: ["15", "16", "25"] }, biology: { fieldIds: ["11", "13", "24", "34"] },
  "medicine-health": { fieldIds: ["27", "29", "30", "35", "36"] }, "psych-neuro": { fieldIds: ["28", "32"] },
  "earth-environment": { fieldIds: ["19", "23"] }, "engineering-energy": { fieldIds: ["21", "22"] },
  "social-sciences": { fieldIds: ["33"] }, "economics-business": { fieldIds: ["14", "20"] }, "arts-humanities": { fieldIds: ["12"] },
});

const AI_EVIDENCE = Object.freeze([
  /\bartificial intelligence\b/, /\bmachine learning\b/, /\bdeep learning\b/, /\breinforcement learning\b/,
  /\bneural (?:network|model|representation|architecture)/,
  /\blarge language model|\blanguage model(?:s|ing)?\b|\bllms?\b/,
  /\bgenerative ai\b|\bgenerative model/, /\bcomputer vision\b|\bimage (?:classification|segmentation|generation)/,
  /\bnatural language (?:processing|understanding|generation)/, /\bknowledge graph\b|\bexpert system\b/,
  /\bmulti[ -]?agent\b|\bautonomous agent\b|\bagent(?:ic)? (?:system|reasoning|planning)/,
  /\brobot(?:ics|ic| learning)\b/, /\btransformer(?:s| architecture)?\b|\bdiffusion model\b/,
  /\bgraph neural\b|\bfoundation model\b|\brepresentation learning\b/,
  /\b(?:few|zero)[ -]?shot\b|\bself[ -]?supervised\b|\btransfer learning\b/,
  /\bai[- ](?:based|driven|enabled|assisted|generated)\b/, /\b(?:algorithmic|automated) (?:reasoning|planning|decision making)\b/,
]);

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "via", "with", "without", "system", "systems", "method", "methods"]);

export function taxonomyId(value) { return String(value || "").match(/(\d+)\/?$/)?.[1] || ""; }
function normalizeIds(value) { return Array.isArray(value) ? [...new Set(value.map(taxonomyId).filter(Boolean))] : []; }
export function normalizeFieldIds(value) { return normalizeIds(value); }
export function normalizeSubfieldIds(value) { return normalizeIds(value); }

export function legacySelection(categoryIds) {
  const fieldIds = [], subfieldIds = [];
  for (const categoryId of Array.isArray(categoryIds) ? categoryIds : []) {
    const selection = LEGACY_CATEGORY_SELECTIONS[categoryId];
    fieldIds.push(...(selection?.fieldIds || [])); subfieldIds.push(...(selection?.subfieldIds || []));
  }
  const normalizedFields = normalizeFieldIds(fieldIds);
  return { fieldIds: normalizedFields, subfieldIds: normalizeSubfieldIds(subfieldIds).filter((id) => !(id === "1702" && normalizedFields.includes("17"))) };
}

export function selectionFromSettings(settings = {}) {
  const fieldIds = normalizeFieldIds(settings.selectedFields), subfieldIds = normalizeSubfieldIds(settings.selectedSubfields);
  return fieldIds.length || subfieldIds.length ? { fieldIds, subfieldIds } : legacySelection(settings.selectedCategories);
}
export function fieldIdsForCategories(categoryIds) { return legacySelection(categoryIds).fieldIds; }

export function normalizeSearchText(value) {
  return String(value || "").normalize("NFKD").toLocaleLowerCase("en").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) current.push(Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)));
    previous = current;
  }
  return previous[right.length] <= maximum;
}
function tokenMatches(queryToken, documentToken) {
  if (queryToken === documentToken) return true;
  if (queryToken.length < 6 || queryToken[0] !== documentToken[0]) return false;
  return editDistanceWithin(queryToken, documentToken, queryToken.length >= 10 ? 2 : 1);
}
function matchWindow(text, query) {
  const documentTokens = normalizeSearchText(text).split(" ").filter(Boolean);
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!queryTokens.length) return true;
  const normalizedText = documentTokens.join(" "), normalizedQuery = queryTokens.join(" ");
  if (normalizedText.includes(normalizedQuery)) return true;
  const meaningful = queryTokens.filter((token) => !STOP_WORDS.has(token));
  const required = meaningful.length ? meaningful : queryTokens;
  const width = Math.max(required.length + 5, 8);
  for (let start = 0; start < documentTokens.length; start += 1) {
    const window = documentTokens.slice(start, start + width);
    if (required.every((queryToken) => window.some((token) => tokenMatches(queryToken, token)))) return true;
  }
  return false;
}
function snippet(value, query) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const needle = normalizeSearchText(query).split(" ").find((token) => token.length >= 4);
  const normalized = normalizeSearchText(text); const position = needle ? normalized.indexOf(needle) : 0;
  const start = Math.max(0, position - 70), end = Math.min(text.length, start + 190);
  return `${start ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export function interestMatchEvidence(work, queries = []) {
  for (const query of queries.map(String).map((item) => item.trim()).filter(Boolean)) {
    if (matchWindow(work.title, query)) return { query, location: "title", snippet: snippet(work.title, query) };
    if (matchWindow(work.abstract, query)) return { query, location: "abstract", snippet: snippet(work.abstract, query) };
  }
  return null;
}
export function matchesInterestQuery(work, query) { return Boolean(interestMatchEvidence(work, [query])); }
export function hasCategoryEvidence(work) {
  if (taxonomyId(work.subfieldId) !== "1702") return true;
  const text = normalizeSearchText(`${work.title || ""} ${work.abstract || ""}`);
  return AI_EVIDENCE.some((pattern) => pattern.test(text));
}
export function matchesResearchFilters(work, settings = {}) {
  if (settings.englishOnly && work.language !== "en") return false;
  const selection = selectionFromSettings(settings);
  const arxivCategories = Array.isArray(work.arxivCategories) ? work.arxivCategories : [];
  const selectedArxivCategories = Array.isArray(settings.selectedArxivCategories) ? settings.selectedArxivCategories : [];
  const selectedArxivGroups = Array.isArray(settings.selectedArxivGroups) ? settings.selectedArxivGroups : [];
  const exactArxivScope = arxivCategories.length > 0 && (selectedArxivCategories.length > 0 || selectedArxivGroups.length > 0);
  if (arxivCategories.length && selectedArxivCategories.length && !arxivCategories.some((code) => selectedArxivCategories.includes(code))) return false;
  if (arxivCategories.length && selectedArxivGroups.length && !arxivCategories.some((code) => selectedArxivGroups.some((group) => code === group || code.startsWith(`${group}.`) || (group === "physics" && !/^(cs|econ|eess|math|q-bio|q-fin|stat)\./.test(code))))) return false;
  if (!exactArxivScope && (selection.fieldIds.length || selection.subfieldIds.length) && !selection.fieldIds.includes(taxonomyId(work.fieldId)) && !selection.subfieldIds.includes(taxonomyId(work.subfieldId))) return false;
  if (!hasCategoryEvidence(work)) return false;
  const queries = Array.isArray(settings.queries) ? settings.queries.map(String).map((query) => query.trim()).filter(Boolean) : [];
  return !queries.length || Boolean(interestMatchEvidence(work, queries));
}
export function discoveryScopeSignature(settings = {}) {
  const selection = selectionFromSettings(settings);
  return JSON.stringify({ fields: [...selection.fieldIds].sort(), subfields: [...selection.subfieldIds].sort(), englishOnly: Boolean(settings.englishOnly) });
}
export function researchFilterSignature(settings = {}) {
  return JSON.stringify({ scope: JSON.parse(discoveryScopeSignature(settings)), arxivGroups: [...(settings.selectedArxivGroups || [])].sort(), arxivCategories: [...(settings.selectedArxivCategories || [])].sort(), queries: (settings.queries || []).map(normalizeSearchText).filter(Boolean).sort() });
}

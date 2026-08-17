const LEGACY_CATEGORY_SELECTIONS = Object.freeze({
  ai: { subfieldIds: ["1702"] },
  "computer-science": { fieldIds: ["17"] },
  "math-stats": { fieldIds: ["18", "26"] },
  physics: { fieldIds: ["31"] },
  "chem-materials": { fieldIds: ["15", "16", "25"] },
  biology: { fieldIds: ["11", "13", "24", "34"] },
  "medicine-health": { fieldIds: ["27", "29", "30", "35", "36"] },
  "psych-neuro": { fieldIds: ["28", "32"] },
  "earth-environment": { fieldIds: ["19", "23"] },
  "engineering-energy": { fieldIds: ["21", "22"] },
  "social-sciences": { fieldIds: ["33"] },
  "economics-business": { fieldIds: ["14", "20"] },
  "arts-humanities": { fieldIds: ["12"] },
});

export function taxonomyId(value) {
  const match = String(value || "").match(/(\d+)\/?$/);
  return match?.[1] || "";
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(taxonomyId).filter(Boolean))];
}

export function normalizeFieldIds(value) {
  return normalizeIds(value);
}

export function normalizeSubfieldIds(value) {
  return normalizeIds(value);
}

export function legacySelection(categoryIds) {
  const fieldIds = [];
  const subfieldIds = [];
  for (const categoryId of Array.isArray(categoryIds) ? categoryIds : []) {
    const selection = LEGACY_CATEGORY_SELECTIONS[categoryId];
    fieldIds.push(...(selection?.fieldIds || []));
    subfieldIds.push(...(selection?.subfieldIds || []));
  }
  const normalizedFields = normalizeFieldIds(fieldIds);
  return {
    fieldIds: normalizedFields,
    subfieldIds: normalizeSubfieldIds(subfieldIds).filter(
      (id) => !(id === "1702" && normalizedFields.includes("17")),
    ),
  };
}

export function selectionFromSettings(settings = {}) {
  const explicitFields = normalizeFieldIds(settings.selectedFields);
  const explicitSubfields = normalizeSubfieldIds(settings.selectedSubfields);
  if (explicitFields.length || explicitSubfields.length) {
    return { fieldIds: explicitFields, subfieldIds: explicitSubfields };
  }
  return legacySelection(settings.selectedCategories);
}

export function fieldIdsForCategories(categoryIds) {
  return legacySelection(categoryIds).fieldIds;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function workText(work) {
  return normalizeText(
    [
      work.title,
      work.abstract,
      work.topicName,
      work.subfieldName,
      work.fieldName,
      ...(work.topics || []).flatMap((topic) => [
        topic.topicName,
        topic.subfieldName,
        topic.fieldName,
      ]),
    ].join(" "),
  );
}

function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current.push(
        Math.min(
          previous[column] + 1,
          current[column - 1] + 1,
          previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] <= maximum;
}

function tokenMatches(queryToken, documentToken) {
  if (queryToken === documentToken) return true;
  if (queryToken.length < 6 || queryToken[0] !== documentToken[0]) return false;
  const maximum = queryToken.length >= 10 ? 2 : 1;
  return editDistanceWithin(queryToken, documentToken, maximum);
}

export function matchesInterestQuery(work, query) {
  const text = workText(work);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  if (text.includes(normalizedQuery)) return true;
  const documentTokens = [...new Set(text.split(" ").filter(Boolean))];
  return normalizedQuery
    .split(" ")
    .filter(Boolean)
    .every((queryToken) => documentTokens.some((token) => tokenMatches(queryToken, token)));
}

export function matchesResearchFilters(work, settings = {}) {
  if (settings.englishOnly && work.language !== "en") return false;
  const selection = selectionFromSettings(settings);
  if (
    (selection.fieldIds.length || selection.subfieldIds.length) &&
    !selection.fieldIds.includes(taxonomyId(work.fieldId)) &&
    !selection.subfieldIds.includes(taxonomyId(work.subfieldId))
  ) {
    return false;
  }

  const queries = Array.isArray(settings.queries)
    ? settings.queries.map(String).map((query) => query.trim()).filter(Boolean)
    : [];
  return !queries.length || queries.some((query) => matchesInterestQuery(work, query));
}

export function researchFilterSignature(settings = {}) {
  const selection = selectionFromSettings(settings);
  return JSON.stringify({
    fields: selection.fieldIds.sort(),
    subfields: selection.subfieldIds.sort(),
    englishOnly: Boolean(settings.englishOnly),
    queries: (settings.queries || []).map(normalizeText).filter(Boolean).sort(),
  });
}

export const RESEARCH_CATEGORIES = Object.freeze([
  {
    id: "ai",
    label: "AI & Machine Learning",
    fieldIds: ["17"],
    keywords: [
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "neural network",
      "computer vision",
      "natural language processing",
      "large language model",
      "reinforcement learning",
      "robotics",
    ],
  },
  { id: "computer-science", label: "Computer Science", fieldIds: ["17"] },
  { id: "math-stats", label: "Mathematics & Statistics", fieldIds: ["18", "26"] },
  { id: "physics", label: "Physics & Astronomy", fieldIds: ["31"] },
  { id: "chem-materials", label: "Chemistry & Materials", fieldIds: ["15", "16", "25"] },
  { id: "biology", label: "Biology & Life Sciences", fieldIds: ["11", "13", "24", "34"] },
  { id: "medicine-health", label: "Medicine & Health", fieldIds: ["27", "29", "30", "35", "36"] },
  { id: "psych-neuro", label: "Psychology & Neuroscience", fieldIds: ["28", "32"] },
  { id: "earth-environment", label: "Earth & Environment", fieldIds: ["19", "23"] },
  { id: "engineering-energy", label: "Engineering & Energy", fieldIds: ["21", "22"] },
  { id: "social-sciences", label: "Social Sciences", fieldIds: ["33"] },
  { id: "economics-business", label: "Economics & Business", fieldIds: ["14", "20"] },
  { id: "arts-humanities", label: "Arts & Humanities", fieldIds: ["12"] },
]);

const CATEGORY_BY_ID = new Map(RESEARCH_CATEGORIES.map((category) => [category.id, category]));

export function normalizeCategoryIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((id) => CATEGORY_BY_ID.has(id)))];
}

export function fieldIdsForCategories(categoryIds) {
  return [
    ...new Set(
      normalizeCategoryIds(categoryIds).flatMap((id) => CATEGORY_BY_ID.get(id)?.fieldIds || []),
    ),
  ];
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
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return false;
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

function matchesCategory(work, category) {
  if (!category.fieldIds.includes(String(work.fieldId || ""))) return false;
  if (!category.keywords?.length) return true;
  const text = workText(work);
  return category.keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

export function matchesResearchFilters(work, settings = {}) {
  if (settings.englishOnly && work.language !== "en") return false;

  const categoryIds = normalizeCategoryIds(settings.selectedCategories);
  if (
    categoryIds.length &&
    !categoryIds.some((id) => matchesCategory(work, CATEGORY_BY_ID.get(id)))
  ) {
    return false;
  }

  const queries = Array.isArray(settings.queries)
    ? settings.queries.map(String).map((query) => query.trim()).filter(Boolean)
    : [];
  if (queries.length && !queries.some((query) => matchesInterestQuery(work, query))) return false;
  return true;
}

export function researchFilterSignature(settings = {}) {
  return JSON.stringify({
    categories: normalizeCategoryIds(settings.selectedCategories).sort(),
    englishOnly: Boolean(settings.englishOnly),
    queries: (settings.queries || []).map(normalizeText).filter(Boolean).sort(),
  });
}

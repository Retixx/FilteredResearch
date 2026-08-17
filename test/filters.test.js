import assert from "node:assert/strict";
import test from "node:test";

import {
  fieldIdsForCategories,
  matchesInterestQuery,
  matchesResearchFilters,
} from "../src/shared/filters.js";

const aiWork = {
  title: "A new artificial intelligence method for scientific discovery",
  abstract: "Machine learning identifies useful hypotheses.",
  language: "en",
  fieldId: "17",
  fieldName: "Computer Science",
  subfieldName: "Artificial Intelligence",
  topics: [],
};

test("category groups map to OpenAlex fields", () => {
  assert.deepEqual(fieldIdsForCategories(["ai", "physics"]), ["17", "31"]);
});

test("interest matching tolerates a small spelling error", () => {
  assert.equal(matchesInterestQuery(aiWork, "Artificial Intellgence"), true);
});

test("categories and interests are strict filters joined with AND", () => {
  assert.equal(
    matchesResearchFilters(aiWork, {
      englishOnly: true,
      selectedCategories: ["ai"],
      queries: ["scientific discovery"],
    }),
    true,
  );
  assert.equal(
    matchesResearchFilters(
      { ...aiWork, fieldId: "25", fieldName: "Materials Science" },
      { englishOnly: true, selectedCategories: ["ai"], queries: [] },
    ),
    false,
  );
  assert.equal(
    matchesResearchFilters(aiWork, {
      englishOnly: true,
      selectedCategories: ["ai"],
      queries: ["marine archaeology"],
    }),
    false,
  );
});

test("English-only mode rejects missing and non-English language metadata", () => {
  const settings = { englishOnly: true, selectedCategories: [], queries: [] };
  assert.equal(matchesResearchFilters({ ...aiWork, language: "pt" }, settings), false);
  assert.equal(matchesResearchFilters({ ...aiWork, language: null }, settings), false);
});

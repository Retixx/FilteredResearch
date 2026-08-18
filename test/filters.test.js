import assert from "node:assert/strict";
import test from "node:test";

import {
  discoveryScopeSignature,
  hasCategoryEvidence,
  interestMatchEvidence,
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
  subfieldId: "https://openalex.org/subfields/1702",
  subfieldName: "Artificial Intelligence",
  topics: [],
};

test("legacy broad category groups map to OpenAlex fields", () => {
  assert.deepEqual(fieldIdsForCategories(["computer-science", "physics"]), ["17", "31"]);
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
      { ...aiWork, fieldId: "25", fieldName: "Materials Science", subfieldId: "2501" },
      { englishOnly: true, selectedCategories: ["ai"], queries: [] },
    ),
    false,
  );
  // Interests no longer exclude the rest of a chosen category: requiring the
  // phrase verbatim reduced a full subfield index to a handful of papers.
  assert.equal(
    matchesResearchFilters(aiWork, {
      englishOnly: true,
      selectedCategories: ["ai"],
      queries: ["marine archaeology"],
    }),
    true,
  );
  // Strict mode restores the old exclude-everything-else behaviour.
  assert.equal(
    matchesResearchFilters(aiWork, {
      englishOnly: true,
      selectedCategories: ["ai"],
      queries: ["marine archaeology"],
      strictInterestFilter: true,
    }),
    false,
  );
  // With no category chosen the interest is still the only scope there is.
  assert.equal(
    matchesResearchFilters(aiWork, { englishOnly: true, queries: ["marine archaeology"] }),
    false,
  );
});

test("English-only mode rejects missing and non-English language metadata", () => {
  const settings = { englishOnly: true, selectedCategories: [], queries: [] };
  assert.equal(matchesResearchFilters({ ...aiWork, language: "pt" }, settings), false);
  assert.equal(matchesResearchFilters({ ...aiWork, language: null }, settings), false);
});

test("production OpenAlex URL IDs match bare hierarchical selections", () => {
  assert.equal(
    matchesResearchFilters(
      { ...aiWork, fieldId: "https://openalex.org/fields/17" },
      { englishOnly: true, selectedFields: ["17"], selectedSubfields: [], queries: [] },
    ),
    true,
  );
  assert.equal(
    matchesResearchFilters(aiWork, {
      englishOnly: true,
      selectedFields: [],
      selectedSubfields: ["1702"],
      queries: [],
    }),
    true,
  );
});

test("AI labels require actual AI evidence instead of trusting a provider category", () => {
  const physics = { ...aiWork, title: "Further aspects of supersymmetric Virasoro minimal strings", abstract: "Quantum operators and conformal field theory.", subfieldId: "1702" };
  assert.equal(hasCategoryEvidence(physics), false);
  assert.equal(matchesResearchFilters(physics, { englishOnly: true, selectedSubfields: ["1702"], queries: [] }), false);
});

test("interest phrases match title, abstract, or the paper's own topic labels", () => {
  // A paper filed under the topic counts even when it never repeats the phrase,
  // which is the point of screening by subfield rather than by wording.
  assert.equal(
    interestMatchEvidence({ title: "Mean-field games", abstract: "Trajectory optimization.", topicName: "Multi-agent system" }, ["multi-agent system"])?.location,
    "topic",
  );
  assert.equal(interestMatchEvidence({ title: "Coordination", abstract: "We study scalable multi agent systems for planning." }, ["multi-agent system"])?.location, "abstract");
  // An unrelated topic label still does not match.
  assert.equal(
    interestMatchEvidence({ title: "Crop rotation", abstract: "Yields.", topicName: "Agronomy" }, ["multi-agent system"]),
    null,
  );
});

test("changing an interest does not invalidate the discovery scope cache", () => {
  const base = { selectedSubfields: ["1702"], englishOnly: true };
  assert.equal(discoveryScopeSignature({ ...base, queries: [] }), discoveryScopeSignature({ ...base, queries: ["agents"] }));
});

test("visible arXiv category codes enforce the exact selected arXiv category", () => {
  const settings = { englishOnly: true, selectedArxivCategories: ["cs.MA"], selectedSubfields: ["1702"], queries: [] };
  assert.equal(matchesResearchFilters({ ...aiWork, arxivCategories: ["cs.MA"] }, settings), true);
  assert.equal(matchesResearchFilters({ ...aiWork, arxivCategories: ["cs.AI"] }, settings), false);
});

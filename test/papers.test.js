import assert from "node:assert/strict"; import test from "node:test";
import { groupDuplicatePapers } from "../src/shared/papers.js";
import { annotateProminence, PROMINENCE_CATALOG_SIZE } from "../src/shared/prominence.js";
test("duplicate publications become one paper with multiple sources", () => {
  const grouped = groupDuplicatePapers([
    { id:"W1", title:"Same Paper", publicationDate:"2026-08-12", authorships:[{name:"A. Author"}], sourceName:"Open MIND", url:"https://a", noveltyScore:90 },
    { id:"W2", title:"Same Paper", publicationDate:"2026-08-13", authorships:[{name:"A. Author"}], sourceName:"Zenodo", url:"https://b", noveltyScore:91 },
  ]);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].sources.length, 2); assert.equal(grouped[0].duplicateCount, 2);
});
test("the curated prominent catalog contains exactly 50 markers", () => { assert.equal(PROMINENCE_CATALOG_SIZE, 50); });
test("Anthropic affiliation creates a discreet authorship override", () => {
  const work = annotateProminence({ authorships:[{ name:"Example", institutions:["Anthropic"] }] });
  assert.equal(work.authorshipOverride, true); assert.equal(work.prominence[0].label, "Anthropic"); assert.equal(work.prominence[0].color, "#d97738");
});

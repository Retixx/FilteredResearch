import assert from "node:assert/strict";
import test from "node:test";

import { applySelectivity, selectivityToTopFraction } from "../src/shared/ranking.js";

function works(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `W${index}`,
    noveltyScore: index / 10,
    researcherScore: index / 10,
  }));
}

test("selectivity 1 includes every paper and removes the old raw-score floor", () => {
  const selected = applySelectivity(works(100), {
    noveltySelectivity: 1,
    authorshipSelectivity: 1,
  });
  assert.equal(selected.works.length, 100);
});

test("logarithmic anchors retain the documented top fractions", () => {
  assert.equal(selectivityToTopFraction(40), 0.5);
  assert.equal(selectivityToTopFraction(60), 0.2);
  assert.equal(selectivityToTopFraction(80), 0.05);
  assert.equal(selectivityToTopFraction(100), 0.0002);
});

test("both novelty and authorship thresholds must be cleared", () => {
  const candidates = [
    { id: "novel-only", noveltyScore: 100, researcherScore: 1 },
    { id: "author-only", noveltyScore: 1, researcherScore: 100 },
    { id: "both", noveltyScore: 100, researcherScore: 100 },
    ...works(997),
  ];
  const selected = applySelectivity(candidates, {
    noveltySelectivity: 80,
    authorshipSelectivity: 80,
  });
  assert.ok(selected.works.some((work) => work.id === "both"));
  assert.ok(!selected.works.some((work) => work.id === "novel-only"));
  assert.ok(!selected.works.some((work) => work.id === "author-only"));
});

test("the displayed slider value is also a strict floor", () => {
  const candidates = [{ id: "below", noveltyScore: 90, researcherScore: 77 }, { id: "pass", noveltyScore: 90, researcherScore: 90 }];
  const result = applySelectivity(candidates, { noveltySelectivity: 80, authorshipSelectivity: 80 });
  assert.deepEqual(result.works.map((work) => work.id), ["pass"]);
});

test("prominent sources bypass authorship but never novelty", () => {
  const candidates = [{ id: "prominent", noveltyScore: 95, researcherScore: 2, authorshipOverride: true }, { id: "not-novel", noveltyScore: 2, researcherScore: 99, authorshipOverride: true }];
  const result = applySelectivity(candidates, { noveltySelectivity: 80, authorshipSelectivity: 100 });
  assert.deepEqual(result.works.map((work) => work.id), ["prominent"]);
});

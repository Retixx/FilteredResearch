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

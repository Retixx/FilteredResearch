import assert from "node:assert/strict";
import test from "node:test";

import {
  cosineSimilarity,
  buildVector,
  scoreBatch,
  scoreResearcherAuthorship,
} from "../src/shared/scoring.js";

function work(id, publicationDate, title, abstract, authorId = "A1") {
  return {
    id,
    publicationDate,
    title,
    abstract,
    subfieldId: "101",
    domainId: "1",
    topics: [{ fieldId: "10" }],
    authorships: [
      { authorId, name: authorId, position: "first", isCorresponding: true },
    ],
  };
}

test("cosine similarity is high for close language and low for unrelated language", () => {
  const battery = buildVector("solid state sodium battery electrolyte transport");
  const close = buildVector("sodium battery solid electrolyte ion transport");
  const distant = buildVector("medieval poetry manuscript authorship archive");
  assert.ok(cosineSimilarity(battery, close) > 0.6);
  assert.ok(cosineSimilarity(battery, distant) < 0.1);
});

test("a genuinely distant candidate outranks an incremental rephrasing", () => {
  const references = [
    work(
      "R1",
      "2025-01-01",
      "Solid state sodium battery electrolyte transport",
      "We measure ion transport through a ceramic electrolyte for sodium batteries.",
    ),
    work(
      "R2",
      "2025-02-01",
      "Ceramic electrolytes for sodium batteries",
      "A ceramic electrolyte improves ion conductivity in a solid state cell.",
    ),
  ];
  const incremental = work(
    "C1",
    "2026-01-01",
    "Enhanced solid state sodium battery electrolyte transport",
    "We improve ion transport through a ceramic electrolyte for sodium batteries.",
  );
  const distant = work(
    "C2",
    "2026-01-01",
    "Self-assembling fungal networks compute flood escape routes",
    "Living mycelial networks encode changing water gradients and reorganize paths without a nervous system.",
  );
  const [incrementalScore, distantScore] = scoreBatch(
    [incremental, distant],
    references,
    [],
    { minTopicPeers: 0 },
  );
  assert.ok(distantScore.noveltyScore > incrementalScore.noveltyScore + 10);
  assert.deepEqual(incrementalScore.noveltyEvidence.incrementalMarkers, ["enhanced"]);
});

test("established-author signal uses career evidence and authorship role", () => {
  const paper = work("W1", "2026-01-01", "Title", "Abstract", "A-established");
  const established = {
    id: "A-established",
    name: "Established Researcher",
    hIndex: 58,
    citedByCount: 55_000,
    worksCount: 190,
    twoYearMeanCitedness: 12,
    orcid: "https://orcid.org/example",
  };
  const novice = {
    id: "A-established",
    name: "New Researcher",
    hIndex: 1,
    citedByCount: 3,
    worksCount: 2,
    twoYearMeanCitedness: 0.2,
    orcid: null,
  };
  const high = scoreResearcherAuthorship(paper, new Map([[established.id, established]]));
  const low = scoreResearcherAuthorship(paper, new Map([[novice.id, novice]]));
  assert.ok(high.score > 70);
  assert.ok(high.score > low.score + 50);
  assert.equal(high.evidence[0].hIndex, 58);
});

test("balanced discovery score preserves exceptional performance on either axis", () => {
  const [result] = scoreBatch(
    [work("C", "2026-01-01", "Totally different biological mechanism", "Unrelated mechanism")],
    [work("R", "2025-01-01", "Quantum lattice", "Bosonic lattice phase")],
    [],
    { minTopicPeers: 0 },
  );
  assert.ok(result.discoveryScore >= Math.min(result.noveltyScore, result.researcherScore));
  assert.ok(result.discoveryScore <= Math.max(result.noveltyScore, result.researcherScore));
});

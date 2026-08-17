import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAlexClient,
  cleanScholarlyText,
  normalizeAuthor,
  normalizeWork,
  reconstructAbstract,
  shortOpenAlexId,
} from "../src/shared/openalex.js";

test("reconstructAbstract restores word order from an inverted index", () => {
  assert.equal(
    reconstructAbstract({ new: [3], A: [0], genuinely: [2], idea: [4], is: [1] }),
    "A is genuinely new idea",
  );
});

test("cleanScholarlyText decodes markup and repairs concatenated title words", () => {
  assert.equal(
    cleanScholarlyText("O &lt;b&gt;FÓSSIL INVISÍVEL&lt;/b&gt;"),
    "O FÓSSIL INVISÍVEL",
  );
  assert.equal(
    cleanScholarlyText("Graphdiyne: An EfficientTwo-Dimensional PlatformAdvanced Photodetection"),
    "Graphdiyne: An Efficient Two-Dimensional Platform Advanced Photodetection",
  );
  assert.equal(
    cleanScholarlyText("FromFilamentary Failure to Durable Halide Perovskite Memristors"),
    "From Filamentary Failure to Durable Halide Perovskite Memristors",
  );
});

test("normalizeWork extracts stable IDs, topics, authors and arXiv IDs", () => {
  const work = normalizeWork({
    id: "https://openalex.org/W123",
    title: "A paper",
    language: "en",
    publication_date: "2026-08-17",
    type: "preprint",
    abstract_inverted_index: { Useful: [0], result: [1] },
    primary_topic: {
      id: "https://openalex.org/T9",
      display_name: "Novel materials",
      subfield: { id: 2204, display_name: "Materials Chemistry" },
      field: { id: 22, display_name: "Engineering" },
      domain: { id: 3, display_name: "Physical Sciences" },
    },
    authorships: [
      {
        author_position: "first",
        is_corresponding: true,
        author: { id: "https://openalex.org/A5", display_name: "Ada Researcher" },
      },
    ],
    primary_location: {
      landing_page_url: "https://arxiv.org/abs/2608.01234",
      source: { display_name: "arXiv" },
    },
    locations: [],
  });

  assert.equal(work.id, "W123");
  assert.equal(work.arxivId, "2608.01234");
  assert.equal(work.subfieldId, "2204");
  assert.equal(work.authorships[0].authorId, "A5");
  assert.equal(work.abstract, "Useful result");
  assert.equal(work.language, "en");
});

test("normalizeWork handles legacy arXiv category IDs and version suffixes", () => {
  const work = normalizeWork({
    id: "https://openalex.org/W-old",
    title: "Legacy identifier",
    publication_date: "2001-01-01",
    abstract_inverted_index: { Abstract: [0] },
    authorships: [],
    topics: [],
    primary_location: { landing_page_url: "https://arxiv.org/pdf/hep-th/9901001v3.pdf" },
  });
  assert.equal(work.arxivId, "hep-th/9901001");
});

test("normalizeAuthor reads OpenAlex bibliometric summary fields", () => {
  const author = normalizeAuthor({
    id: "https://openalex.org/A1",
    display_name: "Researcher One",
    works_count: 80,
    cited_by_count: 9000,
    orcid: "https://orcid.org/0000-0000-0000-0001",
    summary_stats: { h_index: 38, i10_index: 60, "2yr_mean_citedness": 7.2 },
    last_known_institutions: [{ display_name: "Example University" }],
  });
  assert.deepEqual(
    {
      id: author.id,
      hIndex: author.hIndex,
      i10Index: author.i10Index,
      institution: author.lastInstitution,
    },
    { id: "A1", hIndex: 38, i10Index: 60, institution: "Example University" },
  );
  assert.equal(shortOpenAlexId("https://openalex.org/A1/"), "A1");
});

test("fetchWorks keeps a stable page size so sampled pages do not overlap", async () => {
  class FakeClient extends OpenAlexClient {
    async request(_endpoint, parameters) {
      const all = Array.from({ length: 120 }, (_, index) => ({
        id: `https://openalex.org/W${index}`,
        title: `Work ${index}`,
        publication_date: "2026-08-17",
        type: "article",
        abstract_inverted_index: { Abstract: [0] },
        authorships: [],
        topics: [],
      }));
      const start = (parameters.page - 1) * parameters.per_page;
      return { results: all.slice(start, start + parameters.per_page), meta: {} };
    }
  }
  const works = await new FakeClient().fetchWorks({
    since: "2026-08-01",
    until: "2026-08-17",
    limit: 120,
    seed: 1,
  });
  assert.equal(works.length, 120);
  assert.equal(new Set(works.map((work) => work.id)).size, 120);
});

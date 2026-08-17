# Scoring reference

FilteredResearch scores are ranking heuristics. They do not establish truth, quality, reproducibility, or priority.

## Novelty

For candidate vector `c` and older peer vectors `p`:

```text
nearest_similarity = max(cosine(c, p))
semantic_distance  = 1 - nearest_similarity

raw = 100 × (
  0.78 × semantic_distance
  + 0.14 × title_phrase_rarity
  + 0.08 × field_pair_rarity
) - incremental_marker_penalty

confidence = min(1, ln(1 + peer_count) / ln(251))
novelty    = 50 + confidence × (raw - 50)
```

Texts are lowercased, tokenized, stop words removed, and capped before building TF–IDF vectors. The comparison prefers same-subfield peers, falls back to the same domain, and then the wider local reference corpus.

Why shrink to 50: with only a few peers, “no similar work found” mostly means “the local database is sparse.” A neutral score is more honest than 100.

Limitations:

- lexical distance misses conceptual equivalence expressed with different terminology;
- lexical distance can reward jargon or unusual writing;
- OpenAlex abstracts and topics are incomplete;
- a rotating sample cannot prove global novelty;
- field-combination rarity is suggestive, not evidence of a good combination.

## Researcher track record

Each feature is converted to a 0–1 saturation curve:

```text
h       = min(1, ln(1 + h_index) / ln(81))
cite    = min(1, ln(1 + citations) / ln(100001))
recent  = min(1, ln(1 + max(0, 2yr_mean_citedness)) / ln(31))
works   = min(1, ln(1 + works_count) / ln(301))
identity = 1 with ORCID, otherwise 0.35

career = 100 × (0.45h + 0.25cite + 0.15recent + 0.10works + 0.05identity)
```

Role weight is 1 for first, last, or corresponding authors and 0.86 for middle authors. The paper score combines the highest role-adjusted score with the enriched-team median.

Limitations:

- h-index and citations depend on field and career length;
- prolific careers have more opportunity to accumulate metrics;
- name disambiguation and work attribution can be wrong;
- ORCID indicates identity evidence, not research quality;
- a strong author does not guarantee a strong paper.

The MVP deliberately shows the raw evidence. A future version should calibrate field- and career-stage percentiles from an appropriate open baseline.

## Discovery score

```text
discovery = 0.72 × max(novelty, researcher)
          + 0.28 × min(novelty, researcher)
```

This is only the default ordering. The UI always displays both axes and lets the user sort each one directly.

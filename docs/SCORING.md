# Scoring model v2

Filtered Research calculates scores locally from OpenAlex metadata. It does not use an LLM and does not claim to infer scientific truth at publication time.

## Novelty signal

Each candidate is compared with up to 320 older references from the same OpenAlex subfield. If too few exist, the comparison expands to its domain, then to the available corpus.

1. Tokenize title and abstract, remove common stop words, and build log-scaled TF–IDF vectors.
2. Calculate cosine similarity against each eligible older peer and keep the nearest.
3. Combine:
   - 78% cosine idea-distance (`1 − nearest similarity`);
   - 14% unseen two- and three-token title phrases;
   - 8% uncommon cross-field topic combinations.
4. Subtract up to 14 points for wording such as “improved,” “variant of,” or “comparative study.”
5. Shrink the result toward 50 when there are few peers or insufficient text. Abstracts with at least 50 tokens get full text-completeness; shorter abstracts get 65%; title-only records get 35%.

The displayed evidence includes peer count, nearest title, nearest similarity, completeness, and any wording penalty. A high score means “lexically distant inside this local corpus,” not “the idea has never existed.” Equations, images, datasets, citation relationships, and terminology synonyms are not deeply understood by this model.

## Authorship signal

Every enriched author receives a log-scaled career score:

```text
45% h-index
25% total citations
15% two-year mean citedness
10% works count
 5% ORCID-presence evidence
```

Middle authors receive a 0.86 role multiplier. The paper score is `82% × strongest author + 18% × median enriched author`. Missing profiles remain missing and lower confidence; they are not invented.

This is deliberately named **Authorship**, not “Researcher quality.” Bibliometrics have field, career-stage, identity-resolution, access, and citation-culture biases. A high score does not make a claim about the paper itself.

## Logarithmic selectivity

v0.5 ranks the filtered time-window corpus separately on novelty and authorship, calculates a cutoff for the requested top fraction, and also treats the displayed slider number as a raw-score floor. Both gates apply with AND. A curated prominent-organization/researcher marker may bypass authorship only; it never bypasses novelty, category, language, or interest relevance.

The anchor mapping is:

```text
1 → nearly all       40 → top 50%       80 → top 5%
20 → top 75%         60 → top 20%       90 → top 1%
100 → top 0.02%
```

Values between anchors are interpolated logarithmically. At least one highest-scoring record is kept per signal for a non-empty corpus; the AND intersection can still be empty. Ties may produce more than the target fraction.

The “Best signal” sort remains a viewing order only:

```text
discovery = 0.72 × max(novelty, authorship)
          + 0.28 × min(novelty, authorship)
```

It no longer controls admission. Admission always uses the two percentile cutoffs with AND.

## Reproducibility

Indexed records store `field-corpus-heuristics-v2`, raw evidence, source metadata, and scoring time. Changing the taxonomy scope or scoring version invalidates and rebuilds the comparison corpus. OpenAlex corrections and changing recent-window membership can change ranks later.

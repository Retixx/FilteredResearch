import { INCREMENTAL_MARKERS } from "./defaults.js";

export const SCORING_VERSION = "field-corpus-heuristics-v2";

const STOPWORDS = new Set(
  `a an and are as at be been being by can could did do does for from had has have how if in into is it its may might more most no not of on or our should so such than that the their then there these they this those through to under using via was we were what when where which while who will with would`.split(
    " ",
  ),
);

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function tokenize(text, maximum = 700) {
  const tokens = String(text || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g);
  if (!tokens) return [];
  return tokens.filter((token) => !STOPWORDS.has(token)).slice(0, maximum);
}

function counts(tokens) {
  const result = new Map();
  for (const token of tokens) result.set(token, (result.get(token) || 0) + 1);
  return result;
}

export function buildVector(text, inverseDocumentFrequency = new Map()) {
  const termCounts = counts(tokenize(text));
  const vector = new Map();
  let squaredNorm = 0;
  for (const [term, frequency] of termCounts) {
    const weight = (1 + Math.log(frequency)) * (inverseDocumentFrequency.get(term) || 1);
    vector.set(term, weight);
    squaredNorm += weight * weight;
  }
  return { vector, norm: Math.sqrt(squaredNorm) };
}

export function cosineSimilarity(left, right) {
  if (!left.norm || !right.norm) return 0;
  const [smaller, larger] =
    left.vector.size <= right.vector.size
      ? [left.vector, right.vector]
      : [right.vector, left.vector];
  let dot = 0;
  for (const [term, weight] of smaller) dot += weight * (larger.get(term) || 0);
  return clamp(dot / (left.norm * right.norm), 0, 1);
}

function idfForWorks(works) {
  const documentFrequency = new Map();
  for (const work of works) {
    const unique = new Set(tokenize(`${work.title} ${work.abstract}`));
    for (const term of unique) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const total = Math.max(1, works.length);
  return new Map(
    [...documentFrequency].map(([term, frequency]) => [
      term,
      Math.log((total + 1) / (frequency + 1)) + 1,
    ]),
  );
}

function titlePhrases(title) {
  const tokens = tokenize(title, 40);
  const phrases = [];
  for (const size of [2, 3]) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.push(tokens.slice(index, index + size).join(" "));
    }
  }
  return phrases;
}

function phraseRarity(work, peers) {
  const candidate = titlePhrases(work.title);
  if (!candidate.length) return 0.5;
  const known = new Set(peers.flatMap((peer) => titlePhrases(peer.title)));
  const unseenFraction = candidate.filter((phrase) => !known.has(phrase)).length / candidate.length;
  return clamp((unseenFraction - 0.35) / 0.65, 0, 1);
}

function bridgeRarity(work, peers) {
  const fields = [...new Set((work.topics || []).map((topic) => topic.fieldId).filter(Boolean))];
  if (fields.length < 2) return 0.35;
  const pairs = [];
  for (let left = 0; left < fields.length; left += 1) {
    for (let right = left + 1; right < fields.length; right += 1) {
      pairs.push([fields[left], fields[right]].sort().join("|"));
    }
  }
  const peerPairs = new Set();
  for (const peer of peers) {
    const peerFields = [...new Set((peer.topics || []).map((topic) => topic.fieldId).filter(Boolean))];
    for (let left = 0; left < peerFields.length; left += 1) {
      for (let right = left + 1; right < peerFields.length; right += 1) {
        peerPairs.add([peerFields[left], peerFields[right]].sort().join("|"));
      }
    }
  }
  return pairs.length ? pairs.filter((pair) => !peerPairs.has(pair)).length / pairs.length : 0.35;
}

function buildPeerIndex(references) {
  const bySubfield = new Map();
  const byDomain = new Map();
  for (const reference of references) {
    if (reference.subfieldId) {
      const peers = bySubfield.get(reference.subfieldId) || [];
      peers.push(reference);
      bySubfield.set(reference.subfieldId, peers);
    }
    if (reference.domainId) {
      const peers = byDomain.get(reference.domainId) || [];
      peers.push(reference);
      byDomain.set(reference.domainId, peers);
    }
  }
  return { all: references, bySubfield, byDomain };
}

function choosePeers(work, peerIndex, minimumTopicPeers, maximumPeers) {
  const subfield = peerIndex.bySubfield.get(work.subfieldId) || [];
  const domain = peerIndex.byDomain.get(work.domainId) || [];
  const source =
    subfield.length >= minimumTopicPeers
      ? subfield
      : domain.length >= minimumTopicPeers
        ? domain
        : peerIndex.all;
  const older = source.filter(
    (reference) => reference.id !== work.id && reference.publicationDate < work.publicationDate,
  );
  return older.slice(0, maximumPeers);
}

function authorCareerScore(author) {
  const hIndex = Math.min(1, Math.log1p(author.hIndex || 0) / Math.log1p(80));
  const citations = Math.min(
    1,
    Math.log1p(author.citedByCount || 0) / Math.log1p(100_000),
  );
  const works = Math.min(1, Math.log1p(author.worksCount || 0) / Math.log1p(300));
  const recent = Math.min(
    1,
    Math.log1p(Math.max(0, author.twoYearMeanCitedness || 0)) / Math.log1p(30),
  );
  const identity = author.orcid ? 1 : 0.35;
  return 100 * (0.45 * hIndex + 0.25 * citations + 0.15 * recent + 0.1 * works + 0.05 * identity);
}

export function scoreResearcherAuthorship(work, authorMap) {
  const evidence = [];
  for (const authorship of work.authorships || []) {
    const author = authorMap.get(authorship.authorId);
    if (!author) continue;
    const careerScore = authorCareerScore(author);
    const roleWeight =
      authorship.isCorresponding || ["first", "last"].includes(authorship.position) ? 1 : 0.86;
    evidence.push({
      id: author.id,
      name: author.name,
      score: clamp(careerScore * roleWeight),
      careerScore: clamp(careerScore),
      role: authorship.isCorresponding ? "corresponding" : authorship.position,
      hIndex: author.hIndex,
      citedByCount: author.citedByCount,
      worksCount: author.worksCount,
      twoYearMeanCitedness: author.twoYearMeanCitedness,
      orcid: author.orcid,
      institution: author.lastInstitution,
    });
  }
  evidence.sort((left, right) => right.score - left.score);
  const totalAuthors = Math.max(1, work.authorships?.length || 0);
  const confidence = evidence.length / totalAuthors;
  if (!evidence.length) return { score: 0, confidence: 0, evidence: [] };
  const best = evidence[0].score;
  const median = evidence[Math.floor(evidence.length / 2)].score;
  return {
    score: clamp(0.82 * best + 0.18 * median),
    confidence: clamp(confidence, 0, 1),
    evidence: evidence.slice(0, 5),
  };
}

export function scoreBatch(candidates, references, authors, options = {}) {
  const settings = {
    minTopicPeers: 20,
    maxPeerComparisons: 320,
    incrementalMarkers: INCREMENTAL_MARKERS,
    ...options,
  };
  const allForIdf = [...references, ...candidates].filter((work) => work.abstract || work.title);
  const idf = idfForWorks(allForIdf);
  const vectors = new Map(
    allForIdf.map((work) => [work.id, buildVector(`${work.title} ${work.abstract}`, idf)]),
  );
  const peerIndex = buildPeerIndex(references);
  const authorMap = authors instanceof Map ? authors : new Map(authors.map((author) => [author.id, author]));

  return candidates.map((work) => {
    const peers = choosePeers(
      work,
      peerIndex,
      settings.minTopicPeers,
      settings.maxPeerComparisons,
    );
    let nearest = null;
    let nearestSimilarity = 0;
    const candidateVector = vectors.get(work.id) || buildVector(`${work.title} ${work.abstract}`, idf);
    for (const peer of peers) {
      const similarity = cosineSimilarity(candidateVector, vectors.get(peer.id));
      if (similarity > nearestSimilarity) {
        nearestSimilarity = similarity;
        nearest = peer;
      }
    }
    const semanticDistance = 1 - nearestSimilarity;
    const phrases = phraseRarity(work, peers);
    const bridge = bridgeRarity(work, peers);
    const haystack = `${work.title} ${work.abstract.slice(0, 800)}`.toLowerCase();
    const markers = settings.incrementalMarkers.filter((marker) => haystack.includes(marker));
    const penalty = Math.min(14, markers.length * 4.5);
    const rawNovelty = clamp(100 * (0.78 * semanticDistance + 0.14 * phrases + 0.08 * bridge) - penalty);
    const abstractTokens = tokenize(work.abstract, 200).length;
    const textCompleteness = abstractTokens >= 50 ? 1 : abstractTokens ? 0.65 : 0.35;
    const peerConfidence = Math.min(1, Math.log1p(peers.length) / Math.log1p(250));
    const noveltyConfidence = peerConfidence * textCompleteness;
    const noveltyScore = clamp(50 + noveltyConfidence * (rawNovelty - 50));

    const researcher = scoreResearcherAuthorship(work, authorMap);
    const discoveryScore = clamp(
      0.72 * Math.max(noveltyScore, researcher.score) +
        0.28 * Math.min(noveltyScore, researcher.score),
    );
    return {
      ...work,
      noveltyScore,
      noveltyConfidence,
      researcherScore: researcher.score,
      researcherConfidence: researcher.confidence,
      discoveryScore,
      nearestWorkId: nearest?.id || null,
      nearestTitle: nearest?.title || null,
      nearestSimilarity,
      noveltyEvidence: {
        peerCount: peers.length,
        semanticDistance,
        phraseRarity: phrases,
        bridgeRarity: bridge,
        incrementalMarkers: markers,
        penalty,
        textCompleteness,
      },
      researcherEvidence: researcher.evidence,
      scoringVersion: SCORING_VERSION,
      scoredAt: new Date().toISOString(),
    };
  });
}

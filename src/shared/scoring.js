import { INCREMENTAL_MARKERS } from "./defaults.js";

export const SCORING_VERSION = "peer-calibrated-novelty-v3";

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

// Raw cosine distance is not a meaningful scale on its own: in a field with a
// wide vocabulary almost every pair of papers sits at 0.05-0.20 similarity, so
// "distance" reads 80-95% for derivative and groundbreaking work alike and the
// resulting scores bunch into a narrow band. Novelty is therefore measured
// against how crowded the field itself is, not against an absolute distance.

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// How close a paper sits to the work that already exists: its nearest peer plus
// the density of the neighbourhood, so one coincidental match cannot alone make
// a paper look derivative.
function crowdingOf(vector, peerVectors) {
  if (!peerVectors.length) return { crowding: 0, nearestIndex: -1, nearestSimilarity: 0 };
  const similarities = [];
  let nearestSimilarity = 0;
  let nearestIndex = -1;
  for (let index = 0; index < peerVectors.length; index += 1) {
    const similarity = cosineSimilarity(vector, peerVectors[index]);
    similarities.push(similarity);
    if (similarity > nearestSimilarity) {
      nearestSimilarity = similarity;
      nearestIndex = index;
    }
  }
  similarities.sort((left, right) => right - left);
  const topFive = similarities.slice(0, 5);
  const neighbourhood = topFive.reduce((sum, value) => sum + value, 0) / topFive.length;
  return { crowding: 0.65 * nearestSimilarity + 0.35 * neighbourhood, nearestIndex, nearestSimilarity };
}

// The field's own crowding distribution, measured by treating sampled peers as
// candidates against the rest. Computed once per peer group and reused.
const PEER_STATS_SAMPLE = 90;
function peerCrowdingStats(peerVectors) {
  const step = Math.max(1, Math.floor(peerVectors.length / PEER_STATS_SAMPLE));
  const sampled = [];
  for (let index = 0; index < peerVectors.length && sampled.length < PEER_STATS_SAMPLE; index += step) {
    const others = peerVectors.filter((_, position) => position !== index);
    sampled.push(crowdingOf(peerVectors[index], others).crowding);
  }
  if (sampled.length < 4) return null;
  const center = median(sampled);
  const deviations = sampled.map((value) => Math.abs(value - center));
  // Median absolute deviation, scaled to a standard-deviation equivalent, so a
  // few unusual peers cannot flatten the scale.
  const scale = 1.4826 * median(deviations);
  return { center, scale: scale > 1e-4 ? scale : Math.max(1e-4, center * 0.25) };
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

// Without enough peers to describe the field, fall back to a fixed curve over
// the nearest-peer similarity rather than inventing a distribution.
function absoluteNovelty(nearestSimilarity) {
  const points = [[0.02, 96], [0.08, 88], [0.15, 74], [0.25, 58], [0.35, 42], [0.5, 24], [0.7, 8], [1, 2]];
  for (let index = 0; index < points.length; index += 1) {
    const [similarity, score] = points[index];
    if (nearestSimilarity <= similarity) {
      const [previousSimilarity, previousScore] = index ? points[index - 1] : [0, 100];
      const span = similarity - previousSimilarity || 1;
      const progress = (nearestSimilarity - previousSimilarity) / span;
      return previousScore + progress * (score - previousScore);
    }
  }
  return 2;
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
  const [source, groupKey] =
    subfield.length >= minimumTopicPeers
      ? [subfield, `subfield:${work.subfieldId}`]
      : domain.length >= minimumTopicPeers
        ? [domain, `domain:${work.domainId}`]
        : [peerIndex.all, "all"];
  const older = source.filter(
    (reference) => reference.id !== work.id && reference.publicationDate < work.publicationDate,
  );
  return { peers: older.slice(0, maximumPeers), groupKey };
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
    noveltySpread: 1.15,
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

  const statsByGroup = new Map();

  return candidates.map((work) => {
    const { peers, groupKey } = choosePeers(
      work,
      peerIndex,
      settings.minTopicPeers,
      settings.maxPeerComparisons,
    );
    const candidateVector = vectors.get(work.id) || buildVector(`${work.title} ${work.abstract}`, idf);
    const peerVectors = peers.map((peer) => vectors.get(peer.id)).filter(Boolean);
    const { crowding, nearestIndex, nearestSimilarity } = crowdingOf(candidateVector, peerVectors);
    const nearest = nearestIndex >= 0 ? peers[nearestIndex] : null;
    const semanticDistance = 1 - nearestSimilarity;

    if (!statsByGroup.has(groupKey)) statsByGroup.set(groupKey, peerCrowdingStats(peerVectors));
    const stats = statsByGroup.get(groupKey);

    const phrases = phraseRarity(work, peers);
    const bridge = bridgeRarity(work, peers);
    const haystack = `${work.title} ${work.abstract.slice(0, 800)}`.toLowerCase();
    const markers = settings.incrementalMarkers.filter((marker) => haystack.includes(marker));
    const penalty = Math.min(14, markers.length * 4.5);

    // Position against the field rather than against an absolute distance, so
    // the score uses the whole 1-100 range instead of bunching near the top.
    const relativeStanding = stats ? (stats.center - crowding) / stats.scale : null;
    const base = stats
      ? 100 * logistic(settings.noveltySpread * relativeStanding)
      : absoluteNovelty(nearestSimilarity);
    const rawNovelty = clamp(base + 9 * (phrases - 0.5) + 4 * (bridge - 0.35) - penalty);

    const abstractTokens = tokenize(work.abstract, 200).length;
    const textCompleteness = abstractTokens >= 50 ? 1 : abstractTokens ? 0.65 : 0.35;
    const peerConfidence = Math.min(1, Math.log1p(peers.length) / Math.log1p(60));
    const noveltyConfidence = peerConfidence * textCompleteness;
    // Shrink only weakly, and only toward the middle of the calibrated scale;
    // the old full shrink to 50 is what put a floor under every score.
    const shrink = 0.25 + 0.75 * noveltyConfidence;
    const noveltyScore = clamp(50 + shrink * (rawNovelty - 50));

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
        crowding,
        fieldCrowding: stats ? stats.center : null,
        relativeStanding,
        calibrated: Boolean(stats),
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

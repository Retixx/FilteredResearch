const API_ROOT = "https://api.openalex.org";

const WORK_FIELDS = [
  "id",
  "doi",
  "title",
  "language",
  "publication_date",
  "type",
  "authorships",
  "abstract_inverted_index",
  "primary_topic",
  "topics",
  "primary_location",
  "locations",
].join(",");

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
});

function decodeHtmlEntitiesOnce(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return "";
    }
  });
}

export function cleanScholarlyText(value, { repairSpacing = true } = {}) {
  let text = String(value || "");
  for (let pass = 0; pass < 2; pass += 1) text = decodeHtmlEntitiesOnce(text);
  text = text
    .normalize("NFKC")
    .replace(/<\/?[a-z][^>]{0,500}>/gi, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  if (repairSpacing) {
    text = text
      .replace(/\b([A-Z]?[a-zÀ-öø-ÿ]{4,})([A-Z][a-zÀ-öø-ÿ]{2,})\b/g, "$1 $2")
      .replace(/([,;:!?])(?=[A-Za-zÀ-öø-ÿ])/g, "$1 ");
  }
  return text.replace(/\s+/g, " ").trim();
}

const AUTHOR_FIELDS = [
  "id",
  "display_name",
  "orcid",
  "works_count",
  "cited_by_count",
  "summary_stats",
  "last_known_institutions",
].join(",");

export function shortOpenAlexId(value) {
  return String(value || "")
    .replace(/\/$/, "")
    .split("/")
    .at(-1);
}

export function reconstructAbstract(index) {
  if (!index || typeof index !== "object") return "";
  let highest = -1;
  for (const positions of Object.values(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) highest = Math.max(highest, Number(position));
  }
  if (highest < 0 || highest > 100_000) return "";
  const words = new Array(highest + 1).fill("");
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (position >= 0 && position < words.length) words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

function topicParts(topic = {}) {
  return {
    topicId: shortOpenAlexId(topic.id) || null,
    topicName: cleanScholarlyText(topic.display_name, { repairSpacing: false }) || null,
    subfieldId: topic.subfield?.id != null ? String(topic.subfield.id) : null,
    subfieldName:
      cleanScholarlyText(topic.subfield?.display_name, { repairSpacing: false }) || null,
    fieldId: topic.field?.id != null ? String(topic.field.id) : null,
    fieldName: cleanScholarlyText(topic.field?.display_name, { repairSpacing: false }) || null,
    domainId: topic.domain?.id != null ? String(topic.domain.id) : null,
    domainName: cleanScholarlyText(topic.domain?.display_name, { repairSpacing: false }) || null,
    score: Number(topic.score || 0),
  };
}

function extractArxivId(locations = []) {
  for (const location of locations) {
    const url = location?.landing_page_url || location?.pdf_url || "";
    const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+)/i);
    if (match) return match[1].replace(/\.pdf$/i, "").replace(/v\d+$/i, "");
  }
  return null;
}

export function normalizeWork(payload, { baseline = false, maxAuthors = 25 } = {}) {
  const primary = topicParts(payload.primary_topic || {});
  const locations = [payload.primary_location, ...(payload.locations || [])].filter(Boolean);
  const primaryLocation = payload.primary_location || {};
  const authorships = (payload.authorships || [])
    .slice(0, maxAuthors)
    .map((entry) => ({
      authorId: shortOpenAlexId(entry.author?.id),
      name:
        cleanScholarlyText(entry.author?.display_name || entry.raw_author_name, {
          repairSpacing: false,
        }) || "Unknown",
      orcid: entry.author?.orcid || null,
      position: entry.author_position || "middle",
      isCorresponding: Boolean(entry.is_corresponding),
    }))
    .filter((entry) => entry.authorId);
  return {
    id: shortOpenAlexId(payload.id),
    title: cleanScholarlyText(payload.title || "Untitled"),
    abstract: cleanScholarlyText(reconstructAbstract(payload.abstract_inverted_index)).slice(
      0,
      12_000,
    ),
    language: String(payload.language || "").toLowerCase() || null,
    publicationDate: payload.publication_date || new Date().toISOString().slice(0, 10),
    doi: payload.doi || null,
    url: primaryLocation.landing_page_url || payload.doi || payload.id,
    sourceName:
      cleanScholarlyText(primaryLocation.source?.display_name, { repairSpacing: false }) || null,
    workType: payload.type || "article",
    arxivId: extractArxivId(locations),
    authorships,
    topics: (payload.topics || []).slice(0, 10).map(topicParts),
    ...primary,
    isBaseline: baseline,
    fetchedAt: new Date().toISOString(),
  };
}

export function normalizeAuthor(payload) {
  const stats = payload.summary_stats || {};
  return {
    id: shortOpenAlexId(payload.id),
    name: cleanScholarlyText(payload.display_name, { repairSpacing: false }) || "Unknown",
    orcid: payload.orcid || null,
    worksCount: Number(payload.works_count || 0),
    citedByCount: Number(payload.cited_by_count || 0),
    hIndex: Number(stats.h_index || 0),
    i10Index: Number(stats.i10_index || 0),
    twoYearMeanCitedness: Number(stats["2yr_mean_citedness"] || 0),
    lastInstitution:
      cleanScholarlyText(payload.last_known_institutions?.[0]?.display_name, {
        repairSpacing: false,
      }) || null,
    fetchedAt: new Date().toISOString(),
  };
}

export function cleanWorkForDisplay(work) {
  return {
    ...work,
    title: cleanScholarlyText(work.title || "Untitled"),
    abstract: cleanScholarlyText(work.abstract || ""),
    sourceName:
      cleanScholarlyText(work.sourceName, { repairSpacing: false }) || null,
    topicName: cleanScholarlyText(work.topicName, { repairSpacing: false }) || null,
    subfieldName: cleanScholarlyText(work.subfieldName, { repairSpacing: false }) || null,
    fieldName: cleanScholarlyText(work.fieldName, { repairSpacing: false }) || null,
    nearestTitle: cleanScholarlyText(work.nearestTitle) || null,
    authorships: (work.authorships || []).map((authorship) => ({
      ...authorship,
      name:
        cleanScholarlyText(authorship.name, { repairSpacing: false }) || "Unknown",
    })),
  };
}

export class OpenAlexClient {
  constructor({ apiKey = "", timeoutMs = 25_000 } = {}) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.costUsd = 0;
  }

  async request(endpoint, parameters) {
    const url = new URL(`${API_ROOT}/${endpoint}`);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    if (this.apiKey) url.searchParams.set("api_key", this.apiKey);

    for (let attempt = 0; attempt <= 4; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < 4) {
            const retryAfter = Number(response.headers.get("Retry-After"));
            await new Promise((resolve) =>
              setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 750),
            );
            continue;
          }
          throw new Error(`OpenAlex returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
        const payload = await response.json();
        this.costUsd += Number(payload.meta?.cost_usd || 0);
        return payload;
      } catch (error) {
        if (attempt >= 4 || (error.name !== "AbortError" && !String(error).includes("fetch"))) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 750));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("OpenAlex request failed after retries");
  }

  static buildFilter(since, until, { fieldIds = [], englishOnly = false } = {}) {
    const filters = [
      `from_publication_date:${since}`,
      `to_publication_date:${until}`,
      "has_abstract:true",
      "type:article|preprint",
    ];
    if (englishOnly) filters.push("language:en");
    if (fieldIds.length) filters.push(`primary_topic.field.id:${fieldIds.join("|")}`);
    return filters.join(",");
  }

  async fetchWorks({
    since,
    until,
    limit,
    query = "",
    seed,
    baseline = false,
    fieldIds = [],
    englishOnly = false,
  }) {
    if (limit <= 0) return [];
    const works = [];
    let page = 1;
    const pageSize = Math.min(100, limit);
    while (works.length < limit) {
      const parameters = {
        filter: OpenAlexClient.buildFilter(since, until, { fieldIds, englishOnly }),
        per_page: pageSize,
        page,
        select: WORK_FIELDS,
      };
      if (query) {
        parameters.search = query;
        parameters.sort = "publication_date:desc,relevance_score:desc";
      } else {
        parameters.sample = limit;
        parameters.seed = seed;
      }
      const payload = await this.request("works", parameters);
      const results = payload.results || [];
      works.push(
        ...results.map((item) => normalizeWork(item, { baseline })).filter((work) => work.id),
      );
      if (results.length < pageSize) break;
      page += 1;
    }
    return works.slice(0, limit);
  }

  async fetchAuthors(authorIds) {
    const unique = [...new Set(authorIds.filter(Boolean))];
    const authors = [];
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100);
      const payload = await this.request("authors", {
        filter: `openalex_id:${batch.join("|")}`,
        per_page: 100,
        select: AUTHOR_FIELDS,
      });
      authors.push(...(payload.results || []).map(normalizeAuthor));
    }
    return authors.filter((author) => author.id);
  }

  async findWorkByTitle(title) {
    const payload = await this.request("works", {
      search: title,
      filter: "language:en",
      per_page: 5,
      select: WORK_FIELDS,
    });
    const target = normalizeText(title);
    const match = (payload.results || []).find((item) => normalizeText(item.title) === target);
    return match ? normalizeWork(match) : null;
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

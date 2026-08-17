import { normalizeSearchText } from "./filters.js";

const ORGS = [
  ["Anthropic", "anthropic", "#d97738"], ["OpenAI", "openai", "#202b29"], ["Google DeepMind", "deepmind", "#4285f4"], ["Meta AI", "meta ai|fair", "#1877f2"],
  ["Microsoft Research", "microsoft research", "#737373"], ["NVIDIA Research", "nvidia research|nvidia", "#76b900"], ["Apple ML", "apple machine learning|apple", "#555555"],
  ["Amazon Science", "amazon science|amazon", "#ff9900"], ["xAI", "xai", "#333333"], ["Mistral AI", "mistral ai", "#f08c32"], ["Cohere", "cohere", "#39594d"],
  ["AI2", "allen institute for ai|allen institute for artificial intelligence", "#5c6ac4"], ["Stanford HAI", "stanford institute for human centered artificial intelligence|stanford hai", "#8c1515"],
  ["MIT CSAIL", "mit csail|computer science and artificial intelligence laboratory", "#a31f34"], ["BAIR", "berkeley artificial intelligence research|bair", "#003262"],
  ["CMU ML", "carnegie mellon", "#c41230"], ["Mila", "mila", "#6b4eff"], ["Vector Institute", "vector institute", "#00a6a6"], ["Tsinghua AIR", "institute for ai industry research|tsinghua", "#6f2c91"],
  ["Shanghai AI Lab", "shanghai artificial intelligence laboratory|shanghai ai laboratory", "#d12f2f"], ["IBM Research", "ibm research", "#0f62fe"], ["CERN", "cern", "#386cb0"],
  ["NASA", "nasa", "#0b3d91"], ["Broad Institute", "broad institute", "#5b7f3a"], ["Max Planck", "max planck", "#006c66"],
];
const PEOPLE = [
  "Yann LeCun", "Geoffrey Hinton", "Yoshua Bengio", "Demis Hassabis", "David Silver", "Fei Fei Li", "Andrew Ng", "Judea Pearl", "Michael I Jordan", "Jurgen Schmidhuber",
  "Ilya Sutskever", "Dario Amodei", "Percy Liang", "Christopher Manning", "Kaiming He", "Timnit Gebru", "Joelle Pineau", "Pieter Abbeel", "Chelsea Finn", "Sergey Levine",
  "Ian Goodfellow", "Oriol Vinyals", "Noam Brown", "Richard Sutton", "Ruslan Salakhutdinov",
];
export const PROMINENCE_CATALOG_SIZE = ORGS.length + PEOPLE.length;
function includesAlias(text, aliases) { const padded = ` ${text} `; return aliases.split("|").some((alias) => padded.includes(` ${normalizeSearchText(alias)} `)); }
export function prominenceMarkers(work) {
  const markers = [];
  const affiliations = normalizeSearchText((work.authorships || []).flatMap((a) => [...(a.institutions || []), ...(a.rawAffiliations || [])]).join(" "));
  for (const [label, aliases, color] of ORGS) if (includesAlias(affiliations, aliases)) markers.push({ type: "organization", label, color });
  const authorNames = new Set((work.authorships || []).map((a) => normalizeSearchText(a.name)));
  for (const name of PEOPLE) if (authorNames.has(normalizeSearchText(name))) markers.push({ type: "researcher", label: name, color: "#477c73" });
  return markers.slice(0, 2);
}
export function annotateProminence(work) { const prominence = prominenceMarkers(work); return { ...work, prominence, authorshipOverride: prominence.length > 0 }; }

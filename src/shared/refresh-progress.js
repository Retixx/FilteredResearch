// A discovery pass runs far longer than a Manifest V3 service worker is
// guaranteed to live, and a single long message round trip fails with "the
// message channel closed before a response was received" when the worker is
// torn down mid-pass. The pass is therefore started as fire-and-forget and its
// progress is read from the state the worker already persists, which also keeps
// the worker alive because each poll is a fresh message.

export const REFRESH_POLL_MS = 1500;
const STALL_LIMIT_MS = 120_000;
const MAX_WATCH_MS = 45 * 60 * 1000;

function stamp(state) {
  return `${state?.status || ""}:${state?.updatedAt || state?.completedAt || ""}:${state?.fetched ?? ""}:${state?.phase || ""}`;
}

export function describeProgress(state) {
  if (!state || state.status !== "running") return "";
  const phase = state.phase || "starting";
  const lane = state.lane ? ` · ${state.lane}` : "";
  const counted = Number.isFinite(Number(state.fetched)) && Number(state.total)
    ? ` · ${Number(state.fetched).toLocaleString()} of ${Number(state.total).toLocaleString()}`
    : Number.isFinite(Number(state.fetched)) && Number(state.fetched)
      ? ` · ${Number(state.fetched).toLocaleString()} so far`
      : "";
  return `${phase}${lane}${counted}`;
}

export async function runRefresh(send, { reason = "manual", onProgress = null, pollMs = REFRESH_POLL_MS } = {}) {
  await send(reason === "rebuild" ? "REBUILD" : "REFRESH", { reason });
  const startedAt = Date.now();
  let lastStamp = null;
  let lastChange = Date.now();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    let state = null;
    try {
      state = await send("GET_REFRESH_STATE");
    } catch {
      // A dropped poll says nothing about the pass; the next one will tell.
      continue;
    }
    const current = stamp(state);
    if (current !== lastStamp) {
      lastStamp = current;
      lastChange = Date.now();
      onProgress?.(state);
    }
    if (state && state.status !== "running") {
      if (state.status === "error") throw new Error(state.message || "The discovery pass failed.");
      return state;
    }
    // A worker killed mid-pass leaves "running" behind with nothing advancing.
    if (Date.now() - lastChange > STALL_LIMIT_MS) {
      throw new Error("The discovery pass stopped responding. Press refresh to run it again.");
    }
    if (Date.now() - startedAt > MAX_WATCH_MS) {
      throw new Error("The discovery pass is taking unusually long; stopped watching it.");
    }
  }
}

const inbox = document.querySelector("#inbox");
const empty = document.querySelector("#empty");
const count = document.querySelector("#paper-count");
const status = document.querySelector("#status");
const template = document.querySelector("#notification-template");

async function send(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || "The extension did not respond");
  return response.result;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {
    // Invalid links are not made clickable.
  }
  return "about:blank";
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function render(entries) {
  inbox.replaceChildren();
  count.textContent = String(entries.length);
  empty.hidden = entries.length > 0;
  inbox.hidden = entries.length === 0;
  entries.forEach((entry, index) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".paper-card");
    card.classList.toggle("read", !entry.unread);
    fragment.querySelector(".paper-index").textContent = String(index + 1).padStart(2, "0");
    fragment.querySelector(".paper-date").textContent = formatDate(entry.publicationDate);
    fragment.querySelector(".paper-topic").textContent = entry.topic || "Research";
    const title = fragment.querySelector(".paper-title");
    title.textContent = entry.title || "Untitled";
    title.href = safeUrl(entry.url);
    fragment.querySelector(".novelty").textContent = String(entry.noveltyScore ?? "—");
    fragment.querySelector(".researcher").textContent = String(entry.researcherScore ?? "—");
    inbox.append(fragment);
  });
}

async function load() {
  const entries = await send("GET_NOTIFICATIONS");
  render(entries);
  status.textContent = entries.length
    ? `Newest first · ${entries.filter((entry) => entry.unread).length} unread`
    : "Inbox clear · run a pass to collect papers";
  const unreadIds = entries.filter((entry) => entry.unread).map((entry) => entry.id);
  if (unreadIds.length) await send("MARK_NOTIFICATIONS_READ", { ids: unreadIds });
}

document.querySelector("#screen-now").addEventListener("click", async (event) => {
  // currentTarget is null once the handler resumes after an await, so the
  // button is captured up front.
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = "Running one discovery pass… this uses your OpenAlex allowance.";
  try {
    const result = await send("REFRESH");
    // load() rewrites the status line, so the pass result is reported after it.
    await load();
    status.textContent = `Screened ${result.candidatesFetched} papers · ${result.notificationsGenerated || 0} new here`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#clear-inbox").addEventListener("click", async () => {
  if (!window.confirm("Clear every saved new-paper notification?")) return;
  await send("CLEAR_NOTIFICATIONS");
  render([]);
  status.textContent = "Inbox cleared";
});

load().catch((error) => {
  status.textContent = error.message;
});

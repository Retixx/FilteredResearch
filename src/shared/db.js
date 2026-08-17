const DATABASE_NAME = "filteredresearch";
const DATABASE_VERSION = 1;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const works = database.createObjectStore("works", { keyPath: "id" });
      works.createIndex("publicationDate", "publicationDate");
      works.createIndex("arxivId", "arxivId");
      works.createIndex("discoveryScore", "discoveryScore");

      const authors = database.createObjectStore("authors", { keyPath: "id" });
      authors.createIndex("fetchedAt", "fetchedAt");

      database.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function bulkPut(storeName, values) {
  if (!values.length) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (const value of values) store.put(value);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getAll(storeName) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestToPromise(transaction.objectStore(storeName).getAll());
  } finally {
    database.close();
  }
}

export async function getById(storeName, id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestToPromise(transaction.objectStore(storeName).get(id));
  } finally {
    database.close();
  }
}

export async function getMetadata(key) {
  const value = await getById("metadata", key);
  return value?.value;
}

// One connection and one transaction for a whole set of keys. Reading metadata
// one key at a time opened and closed the database once per key, which was a
// large share of the cost of building a feed.
export async function getMetadataMany(keys = []) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return {};
  const database = await openDatabase();
  try {
    const transaction = database.transaction("metadata", "readonly");
    const store = transaction.objectStore("metadata");
    const pairs = await Promise.all(
      unique.map(async (key) => [key, (await requestToPromise(store.get(key)))?.value]),
    );
    return Object.fromEntries(pairs);
  } finally {
    database.close();
  }
}

export async function setMetadata(key, value) {
  await bulkPut("metadata", [{ key, value }]);
}

export async function getWorksByArxivIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const database = await openDatabase();
  try {
    const transaction = database.transaction("works", "readonly");
    const index = transaction.objectStore("works").index("arxivId");
    const pairs = await Promise.all(
      unique.map(async (id) => [id, await requestToPromise(index.get(id))]),
    );
    return Object.fromEntries(pairs.filter(([, value]) => value));
  } finally {
    database.close();
  }
}

export async function clearDatabase() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(["works", "authors", "metadata"], "readwrite");
    transaction.objectStore("works").clear();
    transaction.objectStore("authors").clear();
    transaction.objectStore("metadata").clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function pruneCandidates(olderThanIso) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("works", "readwrite");
    const store = transaction.objectStore("works");
    const index = store.index("publicationDate");
    const request = index.openCursor(IDBKeyRange.upperBound(olderThanIso, true));
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (!cursor.value.isBaseline) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteBaselineWorks() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("works", "readwrite");
    const store = transaction.objectStore("works");
    const request = store.openCursor();
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (cursor.value.isBaseline) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

// Everything the sidebar actually displays, without reading a single work or
// author record. The feed calls this on every render, so it must stay O(1) in
// the size of the corpus.
export async function feedStats() {
  const { lastRefresh, refreshState, notificationInbox } = await getMetadataMany([
    "lastRefresh",
    "refreshState",
    "notificationInbox",
  ]);
  return {
    lastRefresh: lastRefresh || null,
    refreshState: refreshState || null,
    unreadNotifications: (notificationInbox || []).filter((item) => item.unread).length,
  };
}

async function countStore(storeName) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestToPromise(transaction.objectStore(storeName).count());
  } finally {
    database.close();
  }
}

// Full corpus counts, for the settings page only. Totals come from native
// counts; splitting baseline from candidate rows still needs a walk because
// `isBaseline` is not indexed. Keep this off the feed path.
export async function databaseStats() {
  const [works, authors, light] = await Promise.all([
    countStore("works"),
    countStore("authors"),
    feedStats(),
  ]);
  const database = await openDatabase();
  let baseline = 0;
  try {
    const transaction = database.transaction("works", "readonly");
    const request = transaction.objectStore("works").openCursor();
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (cursor.value.isBaseline) baseline += 1;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
  return { ...light, candidates: works - baseline, baseline, authors };
}

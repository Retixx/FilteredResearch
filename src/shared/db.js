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

export async function databaseStats() {
  const [works, authors, lastRefresh, refreshState, notificationInbox] = await Promise.all([
    getAll("works"),
    getAll("authors"),
    getMetadata("lastRefresh"),
    getMetadata("refreshState"),
    getMetadata("notificationInbox"),
  ]);
  return {
    candidates: works.filter((work) => !work.isBaseline).length,
    baseline: works.filter((work) => work.isBaseline).length,
    authors: authors.length,
    lastRefresh: lastRefresh || null,
    refreshState: refreshState || null,
    unreadNotifications: (notificationInbox || []).filter((item) => item.unread).length,
  };
}

export interface UploadedFileRecord {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  expiresAt: number;
  maxDownloads?: number;
  downloadCount?: number;
  file: Blob;
  digest: string;
  signature: string;
  publicKeyJwk?: JsonWebKey;
  signatureImage?: string;
}

export interface DownloadLogRecord {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  downloadedAt: number;
  downloadNumber: number;
  maxDownloads: number;
  downloadsRemaining: number;
}

const DATABASE_NAME = "cryptoproject-files";
const DATABASE_VERSION = 2;
const STORE_NAME = "uploads";
const DOWNLOAD_LOG_STORE_NAME = "download_logs";

export type DownloadResult =
  | { allowed: true; downloadsRemaining: number }
  | { allowed: false; reason: "not-found" | "expired" | "limit-reached" };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DOWNLOAD_LOG_STORE_NAME)) {
        const logStore = database.createObjectStore(DOWNLOAD_LOG_STORE_NAME, { keyPath: "id" });
        logStore.createIndex("downloadedAt", "downloadedAt", { unique: false });
        logStore.createIndex("fileId", "fileId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveUploadedFile(record: UploadedFileRecord): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listUploadedFiles(): Promise<UploadedFileRecord[]> {
  const database = await openDatabase();
  const records = await new Promise<UploadedFileRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as UploadedFileRecord[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function getUploadedFile(id: string): Promise<UploadedFileRecord | undefined> {
  const database = await openDatabase();
  const record = await new Promise<UploadedFileRecord | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as UploadedFileRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return record;
}

export async function consumeDownload(id: string): Promise<DownloadResult> {
  const database = await openDatabase();
  try {
    return await new Promise<DownloadResult>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, DOWNLOAD_LOG_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const logStore = transaction.objectStore(DOWNLOAD_LOG_STORE_NAME);
      let downloadResult: DownloadResult = { allowed: false, reason: "not-found" };
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result as UploadedFileRecord | undefined;
        if (!record) return;
        if (record.expiresAt <= Date.now()) {
          downloadResult = { allowed: false, reason: "expired" };
          return;
        }

        const storedLimit = record.maxDownloads;
        const maxDownloads =
          storedLimit !== undefined && Number.isSafeInteger(storedLimit) && storedLimit > 0 ? storedLimit : 1;
        const storedCount = record.downloadCount;
        const downloadCount =
          storedCount !== undefined && Number.isSafeInteger(storedCount) && storedCount >= 0 ? storedCount : 0;

        if (downloadCount >= maxDownloads) {
          downloadResult = { allowed: false, reason: "limit-reached" };
          return;
        }

        const nextDownloadCount = downloadCount + 1;
        const downloadsRemaining = maxDownloads - nextDownloadCount;
        downloadResult = {
          allowed: true,
          downloadsRemaining,
        };

        const logRecord: DownloadLogRecord = {
          id: crypto.randomUUID(),
          fileId: record.id,
          fileName: record.name,
          fileSize: record.size,
          downloadedAt: Date.now(),
          downloadNumber: nextDownloadCount,
          maxDownloads,
          downloadsRemaining,
        };
        logStore.add(logRecord);

        if (nextDownloadCount >= maxDownloads) {
          store.delete(id);
        } else {
          store.put({ ...record, maxDownloads, downloadCount: nextDownloadCount });
        }
      };

      transaction.oncomplete = () => resolve(downloadResult);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function listDownloadLogs(): Promise<DownloadLogRecord[]> {
  const database = await openDatabase();
  try {
    const logs = await new Promise<DownloadLogRecord[]>((resolve, reject) => {
      const request = database
        .transaction(DOWNLOAD_LOG_STORE_NAME, "readonly")
        .objectStore(DOWNLOAD_LOG_STORE_NAME)
        .getAll();
      request.onsuccess = () => resolve(request.result as DownloadLogRecord[]);
      request.onerror = () => reject(request.error);
    });
    return logs.sort((a, b) => b.downloadedAt - a.downloadedAt);
  } finally {
    database.close();
  }
}

export async function deleteUploadedFile(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

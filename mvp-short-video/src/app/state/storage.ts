import type { StorageNotice } from "../types.ts";
import type { PersistedWorkspace } from "./workspace.ts";
import {
  dbDelete,
  dbDeleteBlob,
  dbGet,
  dbGetBlob,
  dbListKeys,
  dbPut,
  dbPutBlob,
} from "../desktop.ts";

export const IDB_NAME = "clips-studio-db";
export const IDB_VERSION = 1;

export const STORES = [
  "workspace",
  "projects",
  "drafts",
  "draft_versions",
  "assets",
  "asset_authorization",
  "render_jobs",
  "asset_blobs",
] as const;

export type StoreName = (typeof STORES)[number];

export type StorageAdapter = {
  id: string;
  loadWorkspace: () => Promise<{ workspace: PersistedWorkspace | null; notice?: StorageNotice }>;
  saveWorkspace: (workspace: PersistedWorkspace) => Promise<void>;
  putRecord: (store: StoreName, key: string, value: unknown) => Promise<void>;
  getRecord: (store: StoreName, key: string) => Promise<unknown>;
  putBlob: (key: string, blob: Blob) => Promise<void>;
  getBlob: (key: string) => Promise<Blob | null>;
  deleteBlob: (key: string) => Promise<void>;
};

const openIndexedDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
  });

export const createIndexedDBAdapter = (): StorageAdapter => {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const db = () => {
    if (!dbPromise) {
      dbPromise = openIndexedDB().catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  };

  const transaction = async <T>(
    store: StoreName,
    mode: IDBTransactionMode,
    run: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, mode);
      const request = run(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(store + " 操作失败"));
    });
  };

  return {
    id: "indexeddb",

    loadWorkspace: async () => {
      try {
        const record = await transaction("workspace", "readonly", (store) => store.get("main"));
        if (!record || typeof record !== "object") {
          return { workspace: null };
        }
        return { workspace: record as unknown as PersistedWorkspace };
      } catch (error) {
        return {
          workspace: null,
          notice: {
            kind: "failed",
            message:
              "从 IndexedDB 读取工作区失败，使用本地存储：" +
              (error instanceof Error ? error.message : String(error)),
          },
        };
      }
    },

    saveWorkspace: async (workspace) => {
      await transaction("workspace", "readwrite", (store) => store.put(workspace, "main"));
    },

    putRecord: async (store, key, value) => {
      await transaction(store, "readwrite", (objectStore) => objectStore.put(value, key));
    },

    getRecord: async (store, key) => {
      return transaction(store, "readonly", (objectStore) => objectStore.get(key));
    },

    putBlob: async (key, blob) => {
      await transaction("asset_blobs", "readwrite", (objectStore) => objectStore.put(blob, key));
    },

    getBlob: async (key) => {
      const blob = await transaction("asset_blobs", "readonly", (objectStore) =>
        objectStore.get(key),
      );
      return blob instanceof Blob ? blob : null;
    },

    deleteBlob: async (key) => {
      await transaction("asset_blobs", "readwrite", (objectStore) => objectStore.delete(key));
    },
  };
};

export const LOCALSTORAGE_FALLBACK_NOTICE: StorageNotice = {
  kind: "info",
  message: "IndexedDB 不可用，已使用 localStorage 兼容存储（导入素材的原始文件不会持久化）。",
};

// 桌面端 SQLite adapter：复用 StorageAdapter 接口，数据落到应用数据目录 clips-studio.db。
export const createSQLiteAdapter = (): StorageAdapter => {
  return {
    id: "sqlite",

    loadWorkspace: async () => {
      try {
        const record = await dbGet("workspace", "main");
        if (!record || typeof record !== "object") {
          return { workspace: null };
        }
        return { workspace: record as unknown as PersistedWorkspace };
      } catch (error) {
        return {
          workspace: null,
          notice: {
            kind: "failed",
            message:
              "从 SQLite 读取工作区失败：" +
              (error instanceof Error ? error.message : String(error)),
          },
        };
      }
    },

    saveWorkspace: async (workspace) => {
      await dbPut("workspace", "main", workspace);
    },

    putRecord: async (store, key, value) => {
      await dbPut(store, key, value);
    },

    getRecord: async (store, key) => {
      return dbGet(store, key);
    },

    putBlob: async (key, blob) => {
      const buffer = await blob.arrayBuffer();
      await dbPutBlob(key, new Uint8Array(buffer));
    },

    getBlob: async (key) => {
      const bytes = await dbGetBlob(key);
      return bytes ? new Blob([bytes.buffer as ArrayBuffer]) : null;
    },

    deleteBlob: async (key) => {
      await dbDeleteBlob(key);
    },
  };
};

export const sqliteDraftIds = async (): Promise<string[]> => {
  return dbListKeys("drafts");
};

export const sqliteDeleteRecord = async (store: string, key: string) => {
  await dbDelete(store, key);
};

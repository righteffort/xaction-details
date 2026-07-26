import { openDB, type IDBPDatabase } from 'idb';
import type { XactionServiceWorkerMethods, XactionServiceWorkerRequest } from './rpc';
import type { ChaseTransaction } from './chase';

const DB_NAME = 'xaction-details-db';
const DB_VERSION = 1;

const CHASE_STORE_KEY = 'chase';

interface Db {
  [CHASE_STORE_KEY]: {
    key: string;
    value: ChaseTransaction;
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isRpcRequest(msg)) return;
  dispatch(msg).then(sendResponse);
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' });
  } catch {
    // Tab not listening, ok to swallow exception.
  }
});

let dbPromise: Promise<IDBPDatabase<Db>> | null = null;

function getDb() {
  if (dbPromise != null) {
    return dbPromise;
  }
  dbPromise = openDB<Db>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(CHASE_STORE_KEY);
    },
  });
  return dbPromise;
}
const rpcMethods: XactionServiceWorkerMethods = {
  async hasChaseTransaction(id) {
    const result = (await (await getDb()).getKey(CHASE_STORE_KEY, id)) !== undefined;
    console.debug(`have ${id} ? ${result}`);
    return result;
  },
  async putChaseTransaction(req) {
    const tx = (await getDb()).transaction(CHASE_STORE_KEY, 'readwrite');
    if (await tx.store.get(req.id)) {
      await tx.done;
      return;
    }
    await tx.store.put(req.transaction, req.id);
    console.debug(`wrote ${req.id}`);
    return;
  },
};

function isRpcRequest(msg: unknown): msg is XactionServiceWorkerRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const { method, args } = msg as { method?: unknown; args?: unknown };
  return typeof method === 'string' && method in rpcMethods && Array.isArray(args);
}

function dispatch<K extends keyof XactionServiceWorkerMethods>(req: {
  method: K;
  args: Parameters<XactionServiceWorkerMethods[K]>;
}): ReturnType<XactionServiceWorkerMethods[K]> {
  const fn = rpcMethods[req.method] as (
    ...args: Parameters<XactionServiceWorkerMethods[K]>
  ) => ReturnType<XactionServiceWorkerMethods[K]>;
  return fn(...req.args);
}

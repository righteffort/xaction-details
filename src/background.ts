import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { XactionServiceWorkerMethods, XactionServiceWorkerRequest } from './rpc';
import type { AmazonInvoice, AmazonOrderNumber } from './amazon';
import type { ChaseTransaction, ChaseTransactionId } from './chase';
import { getApiServerConfig, getXadConfig, isApiServerConfigComplete } from './config';
import { ActualHttpClient, testActual } from './testActual';

const DB_NAME = 'xaction-details-db';
const DB_VERSION = 1;
const AMAZON_STORE = 'amazon';
const CHASE_STORE = 'chase';
const NEEDS_AMAZON_STORE = 'needs_amazon';
const PRUNABLE_STORES = [AMAZON_STORE, CHASE_STORE, NEEDS_AMAZON_STORE] as const;
const DEFAULT_HISTORY_RETENTION_DAYS = 90;
const PRUNE_ALARM_NAME = 'pruneHistory';
const PRUNE_ALARM_DELAY_MINUTES = 10;

interface Db extends DBSchema {
  [AMAZON_STORE]: {
    key: AmazonOrderNumber;
    value: AmazonInvoice;
    indexes: { 'by-date': Date };
  };
  [CHASE_STORE]: {
    key: ChaseTransactionId;
    value: ChaseTransaction;
    indexes: { 'by-date': Date };
  };
  [NEEDS_AMAZON_STORE]: {
    key: AmazonOrderNumber;
    value: {
      date: Date;
      chaseTransactionId: ChaseTransactionId;
    };
    indexes: { 'by-date': Date };
  };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`Extension installed at ${new Date()}`, details);
  if (details.reason === 'install') {
    const config = await getApiServerConfig();
    if (config == null || !isApiServerConfigComplete(config)) {
      chrome.tabs.create({ url: 'src/onboarding.html' });
    }
  }
});

chrome.runtime.onMessage.addListener(async (msg) => {
  if (!isRpcRequest(msg)) {
    return;
  }
  return dispatch(msg);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) {
    return;
  }
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
      db.createObjectStore(AMAZON_STORE).createIndex('by-date', 'date');
      db.createObjectStore(CHASE_STORE).createIndex('by-date', 'date');
      db.createObjectStore(NEEDS_AMAZON_STORE).createIndex('by-date', 'transactionPostDate');
    },
  });
  return dbPromise;
}

async function pruneHistory(days: number) {
  const cutoff = new Date(Temporal.Now.instant().subtract({ hours: days * 24 }).epochMilliseconds);
  const range = IDBKeyRange.upperBound(cutoff);
  for (const s of PRUNABLE_STORES) {
    const tx = (await getDb()).transaction(s, 'readwrite');
    const index = tx.store.index('by-date');
    for await (const cursor of index.iterate(range)) {
      cursor.delete();
    }
    await tx.done;
  }
}

async function scheduleCleanup() {
  chrome.alarms.create(PRUNE_ALARM_NAME, { delayInMinutes: PRUNE_ALARM_DELAY_MINUTES });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== PRUNE_ALARM_NAME) return;
  const days =
    (await getXadConfig())?.general.historyRetentionDays || DEFAULT_HISTORY_RETENTION_DAYS;
  try {
    await pruneHistory(days);
  } catch (e) {
    console.error('pruneHistory failed', e);
  }
});

const rpcMethods: XactionServiceWorkerMethods = {
  async getNeededAmazonOrders() {
    return await (await getDb()).getAllKeys(NEEDS_AMAZON_STORE);
  },
  async putAmazonInvoice(req) {
    const tx = (await getDb()).transaction([AMAZON_STORE, NEEDS_AMAZON_STORE], 'readwrite');
    await tx.objectStore(AMAZON_STORE).put(req.invoice, req.orderNumber);
    await tx.objectStore(NEEDS_AMAZON_STORE).delete(req.orderNumber);
    await tx.done;
    await scheduleCleanup();
  },
  async hasChaseTransaction(id) {
    const result = (await (await getDb()).getKey(CHASE_STORE, id)) !== undefined;
    console.debug(`have ${id} ? ${result}`);
    return result;
  },
  async putChaseTransaction(req) {
    const tx = (await getDb()).transaction(
      [AMAZON_STORE, CHASE_STORE, NEEDS_AMAZON_STORE],
      'readwrite',
    );
    const chaseStore = tx.objectStore(CHASE_STORE);
    if (!(await chaseStore.getKey(req.id))) {
      await chaseStore.put(req.transaction, req.id);
      const orderNumber = req.transaction.merchantOrderIdentifier;
      if (orderNumber && !(await tx.objectStore(AMAZON_STORE).getKey(orderNumber))) {
        const needsAmazonStore = tx.objectStore(NEEDS_AMAZON_STORE);
        if (!(await needsAmazonStore.getKey(orderNumber))) {
          needsAmazonStore.put(
            { chaseTransactionId: req.id, date: req.transaction.transactionPostDate },
            orderNumber,
          );
        }
      }
      console.debug(`wrote ${req.id}`);
    }
    await tx.done;
    await scheduleCleanup();
  },
  async testActual() {
    console.log('testing actual');
    function fail(message = 'Internal error'): never {
      throw new Error(message);
    }
    const config = await getApiServerConfig();
    if (config == null || !isApiServerConfigComplete(config)) {
      throw new Error('Incomplete API server configuration, update extension options');
    }
    const api = new ActualHttpClient(config || fail('wtf'));
    await testActual(api);
    console.log('tested actual');
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

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { XactionServiceWorkerMethods, XactionServiceWorkerRequest } from './rpc';
import type { AmazonInvoice, AmazonOrderNumber } from './amazon';
import type { ChaseTransaction, ChaseTransactionId } from './chase';
import { getApiServerConfig, getXadConfig, isApiServerConfigComplete } from './config';
import { ActualHttpClient, testActual } from './testActual';
import { SITES, patternFor, hostnameFor, registrationIdFor } from './sites';

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

const DECLARATIVE_RULE_ID = 'xad-show-action';

// Wrap callback-based removeRules and addRules in Promise so callers can await.
function removeAllRules() {
  return new Promise<void>((resolve, reject) => {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
      if (chrome.runtime.lastError) {
        console.error('removeRules failed:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function addShowRule(grantedOrigins: string[]) {
  return new Promise<void>((resolve, reject) => {
    chrome.declarativeContent.onPageChanged.addRules(
      [
        {
          id: DECLARATIVE_RULE_ID,
          conditions: grantedOrigins.map(
            (origin) =>
              new chrome.declarativeContent.PageStateMatcher({
                pageUrl: { hostEquals: hostnameFor(origin), schemes: ['https'] },
              }),
          ),
          actions: [new chrome.declarativeContent.ShowAction()],
        },
      ],
      () => {
        if (chrome.runtime.lastError) {
          console.error('addRules failed:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

async function doSyncDeclarativeContentRules() {
  const { origins = [] } = await chrome.permissions.getAll();
  const grantedOrigins = SITES.map((site) => site.origin).filter((origin) =>
    origins.includes(patternFor(origin)),
  );
  chrome.action.disable();
  await removeAllRules();
  if (grantedOrigins.length === 0) {
    return;
  }
  await addShowRule(grantedOrigins);
}

// Avoid races in rule updates by serializing through one chained queue.
let syncQueue = Promise.resolve();
function syncDeclarativeContentRules() {
  syncQueue = syncQueue.then(doSyncDeclarativeContentRules).catch((e) => {
    console.error('syncDeclarativeContentRules failed:', e);
  });
  return syncQueue;
}

async function handlePermissionsAdded(permissions: chrome.permissions.Permissions) {
  await syncDeclarativeContentRules();
  const origins = permissions.origins || [];
  if (origins.length === 0) return;
  // Inject site's content script in open tabs.
  for (const site of SITES) {
    if (!origins.includes(patternFor(site.origin))) continue;
    const tabs = await chrome.tabs.query({ url: patternFor(site.origin) });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [site.scriptFile],
        });
      } catch (e) {
        console.error('executeScript failed for tab', tab.id, e);
      }
    }
  }
}

async function handlePermissionsRemoved() {
  await syncDeclarativeContentRules();
}

chrome.permissions.onAdded.addListener(handlePermissionsAdded);
chrome.permissions.onRemoved.addListener(handlePermissionsRemoved);

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`Extension installed at ${new Date()}. ${JSON.stringify(details)}`);

  const existing = await chrome.scripting.getRegisteredContentScripts();
  const existingIds = new Set(existing.map((s) => s.id));
  for (const site of SITES) {
    const def: chrome.scripting.RegisteredContentScript = {
      id: registrationIdFor(site),
      matches: [patternFor(site.origin)],
      js: [site.scriptFile],
      runAt: 'document_idle',
    };
    try {
      if (existingIds.has(registrationIdFor(site))) {
        await chrome.scripting.updateContentScripts([def]);
      } else {
        await chrome.scripting.registerContentScripts([def]);
      }
    } catch (e) {
      console.error('failed to register/update content script for', site.origin, e);
    }
  }
  await syncDeclarativeContentRules();

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
      db.createObjectStore(CHASE_STORE).createIndex('by-date', 'transactionPostDate');
      db.createObjectStore(NEEDS_AMAZON_STORE).createIndex('by-date', 'date');
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
    let i = 0;
    for await (const cursor of index.iterate(range)) {
      cursor.delete();
      i++;
    }
    console.debug(`pruneHistory(${days}) deleted ${i} items from ${s}`);
    await tx.done;
  }
}

async function schedulePrune() {
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

function fixDate(value: Date | string | unknown): Date {
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value: ${JSON.stringify(value)}`);
  }
  return d;
}

const rpcMethods: XactionServiceWorkerMethods = {
  async getNeededAmazonOrders() {
    return await (await getDb()).getAllKeys(NEEDS_AMAZON_STORE);
  },
  async putAmazonInvoice(req) {
    // TODO: Don't do this once structured clone message serialization is reliably available.
    req.invoice.date = fixDate(req.invoice.date);
    const tx = (await getDb()).transaction([AMAZON_STORE, NEEDS_AMAZON_STORE], 'readwrite');
    await tx.objectStore(AMAZON_STORE).put(req.invoice, req.orderNumber);
    await tx.objectStore(NEEDS_AMAZON_STORE).delete(req.orderNumber);
    await tx.done;
    await schedulePrune();
  },
  async hasChaseTransaction(id) {
    const result = (await (await getDb()).getKey(CHASE_STORE, id)) !== undefined;
    return result;
  },
  async putChaseTransaction(req) {
    // TODO: Don't do this once structured clone message serialization is reliably available.
    req.transaction.transactionPostDate = fixDate(req.transaction.transactionPostDate);
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
    }
    await tx.done;
    await schedulePrune();
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

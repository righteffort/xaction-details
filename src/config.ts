// API server configuration, backed by combination of local and sync storage.
export type ApiServerConfig = {
  // TODO: Better to be 'path' e.g. http://localhost:8080/v1 and take the user at their word
  url?: string;
  apiKey?: string;
  budgetEncryptionPassword?: string;
  syncId?: string;
  headers: Record<string, string>;
};

export type ApiServerSyncConfig = {
  url?: string;
  // Included to prefill the config form when initializing on a new device.
  headerKeys: string[];
  syncId?: string;
};

export type ApiServerLocalConfig = {
  apiKey?: string;
  budgetEncryptionPassword?: string;
  headers: Record<string, string>;
};

export const DEFAULT_HISTORY_RETENTION_DAYS = 90;

export type XadConfig = {
  actual: {
    chaseAccountId: string;
  };
  general: {
    historyRetentionDays: number;
  };
};

const API_SERVER_CONFIG_KEY = 'apiServerConfig';
const XAD_CONFIG_KEY = 'xadConfig';

export function normalizeUrl(raw: string): string {
  return parseUrl(raw).href;
}

export function getOrigin(url: string) {
  return `${parseUrl(url).origin}`;
}

function trimHeaders(headers: Record<string, string>): Record<string, string> {
  const trimmed: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    trimmed[name.trim()] = value.trim();
  }
  return trimmed;
}

export async function getApiServerConfig(): Promise<ApiServerConfig | null> {
  const [localStored, syncStored] = await Promise.all([
    chrome.storage.local.get([API_SERVER_CONFIG_KEY]),
    chrome.storage.sync.get([API_SERVER_CONFIG_KEY]),
  ]);
  const localRaw = (localStored[API_SERVER_CONFIG_KEY] ?? {}) as Partial<ApiServerLocalConfig>;
  const local: ApiServerLocalConfig = {
    ...(localRaw.apiKey !== undefined && { apiKey: localRaw.apiKey.trim() }),
    ...(localRaw.budgetEncryptionPassword !== undefined && {
      budgetEncryptionPassword: localRaw.budgetEncryptionPassword.trim(),
    }),
    headers: trimHeaders(localRaw.headers ?? {}),
  };
  const syncRaw = (syncStored[API_SERVER_CONFIG_KEY] ?? {}) as Partial<ApiServerSyncConfig>;
  const sync: ApiServerSyncConfig = {
    ...(syncRaw.url !== undefined && { url: syncRaw.url.trim() }),
    ...(syncRaw.syncId !== undefined && { syncId: syncRaw.syncId.trim() }),
    headerKeys: (syncRaw.headerKeys ?? []).map((key) => key.trim()),
  };

  const headers = { ...local.headers };
  for (const key of sync?.headerKeys ?? []) {
    if (!(key in headers)) headers[key] = '';
  }

  return {
    ...(sync.url !== undefined && { url: sync.url }),
    ...(local.apiKey !== undefined && { apiKey: local.apiKey }),
    ...(local.budgetEncryptionPassword !== undefined && {
      budgetEncryptionPassword: local.budgetEncryptionPassword,
    }),
    ...(sync.syncId !== undefined && { syncId: sync.syncId }),
    headers,
  };
}

export async function setApiServerConfig(config: ApiServerConfig) {
  const headers = trimHeaders(config.headers);
  const sync: ApiServerSyncConfig = {
    ...(config.url !== undefined && { url: config.url.trim() }),
    headerKeys: Object.keys(headers),
    ...(config.syncId !== undefined && { syncId: config.syncId.trim() }),
  };
  const local: ApiServerLocalConfig = {
    ...(config.apiKey !== undefined && { apiKey: config.apiKey.trim() }),
    ...(config.budgetEncryptionPassword !== undefined && {
      budgetEncryptionPassword: config.budgetEncryptionPassword.trim(),
    }),
    headers,
  };
  await chrome.storage.sync.set({ [API_SERVER_CONFIG_KEY]: sync });
  await chrome.storage.local.set({ [API_SERVER_CONFIG_KEY]: local });
}

export function isApiServerConfigComplete(config: ApiServerConfig) {
  return Boolean(config.url && config.apiKey && config.syncId);
}

export async function getXadConfig(): Promise<XadConfig | null> {
  const stored = await chrome.storage.sync.get([XAD_CONFIG_KEY]);
  return XAD_CONFIG_KEY in stored ? (stored[XAD_CONFIG_KEY] as XadConfig) : null;
}

export async function setXadConfig(xadConfig: XadConfig) {
  await chrome.storage.sync.set({ [XAD_CONFIG_KEY]: xadConfig });
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw.trim());
  } catch {
    throw new Error('Invalid URL format, should have form https://... or http://....');
  }
}

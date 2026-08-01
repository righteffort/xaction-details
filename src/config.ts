// Sensitive
export type ApiServerConfig = {
  url: string;
  apiKey: string;
  budgetEncryptionPassword?: string;
  syncId: string;
};
// Non-sensitive
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

export async function getApiServerConfig(): Promise<ApiServerConfig | null> {
  const stored = await chrome.storage.local.get([API_SERVER_CONFIG_KEY]);
  return API_SERVER_CONFIG_KEY in stored
    ? (stored[API_SERVER_CONFIG_KEY] as ApiServerConfig)
    : null;
}

export async function setApiServerConfig(config: ApiServerConfig) {
  await chrome.storage.local.set({ [API_SERVER_CONFIG_KEY]: config });
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

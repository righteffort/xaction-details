export type XadConfig = {
  actual: {
    apiServerUrl: string;
    apiServerApiKey: string;
    syncId: string;
    chaseAccountId: string;
    hasPermission?: boolean;
  };
};

const CONFIG_KEY = 'xadConfig';

export async function getXadConfig(): Promise<XadConfig | null> {
  const stored = await chrome.storage.local.get([CONFIG_KEY]);
  console.log(`raw stored=${JSON.stringify(stored)}`);
  return CONFIG_KEY in stored ? (stored[CONFIG_KEY] as XadConfig) : null;
}

export async function setXadConfig(xadConfig: XadConfig) {
  let hasPermission = false;
  if (xadConfig.actual.apiServerUrl) {
    hasPermission = await chrome.permissions.request({
      origins: [`${getOrigin(xadConfig.actual.apiServerUrl)}/v1/*`],
    });
  }
  await chrome.storage.local.set({ [CONFIG_KEY]: { ...xadConfig, hasPermission } });
  if (!hasPermission) {
    throw new Error('Permission was denied. Extension will not connect to Actual Budget.');
  }
}

export function isXadConfigIncomplete(xadConfig: XadConfig) {
  const config = xadConfig.actual;
  return (
    !config.apiServerUrl || !config.apiServerApiKey || !config.syncId || !config.chaseAccountId
  );
}

// Parse a (trimmed) URL, throwing a friendly error on invalid input.
function parseUrl(raw: string): URL {
  try {
    return new URL(raw.trim());
  } catch {
    throw new Error('Invalid URL format, should have form https://... or http://....');
  }
}

// Canonicalize a URL: the URL parser lowercases the scheme and hostname while
// preserving the case of the path, query, and fragment. Throws on invalid input.
export function normalizeUrl(raw: string): string {
  return parseUrl(raw).href;
}

export function getOrigin(url: string) {
  return `${parseUrl(url).origin}`;
}

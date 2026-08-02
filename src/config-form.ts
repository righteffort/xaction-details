import {
  type ApiServerConfig,
  type XadConfig,
  DEFAULT_HISTORY_RETENTION_DAYS,
  getOrigin,
  getApiServerConfig,
  setApiServerConfig,
  isApiServerConfigComplete,
  getXadConfig,
  setXadConfig,
} from './config';
import { getApiUrl } from './testActual';
import { SITES, patternFor, hostnameFor } from './sites';

const formFieldset = document.getElementById('formFieldset') as HTMLFieldSetElement;
const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
const apiKey = document.getElementById('apiKey') as HTMLInputElement;
const encryptionPassword = document.getElementById('encryptionKey') as HTMLInputElement;
const syncId = document.getElementById('syncId') as HTMLInputElement;
const chaseAccountId = document.getElementById('chaseAccountId') as HTMLInputElement;
const historyRetentionDays = document.getElementById('historyRetentionDays') as HTMLInputElement;
const siteListElement = document.getElementById('enabledSiteList') as HTMLDivElement;
const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const headerList = document.getElementById('headerList') as HTMLDivElement;
const addHeaderButton = document.getElementById('addHeaderButton') as HTMLButtonElement;
const headerEntryTemplate = document.getElementById('headerEntryTemplate') as HTMLTemplateElement;

function showStatus(message: string, type: string) {
  statusDiv.textContent = message;
  statusDiv.className = type;
}

function setFormEnabled(enabled: boolean) {
  formFieldset.disabled = !enabled;
}

// Used to give elements in dynamically added rows unique ids.
let headerRowCount = 0;

function addHeaderRow(key = '', value = '') {
  const fragment = headerEntryTemplate.content.cloneNode(true) as DocumentFragment;
  const row = fragment.querySelector('.header-entry') as HTMLDivElement;
  const keyLabel = row.querySelector('.header-key-label') as HTMLLabelElement;
  const valueLabel = row.querySelector('.header-value-label') as HTMLLabelElement;
  const keyInput = row.querySelector('.header-key-input') as HTMLInputElement;
  const valueInput = row.querySelector('.header-value-input') as HTMLInputElement;
  const deleteButton = row.querySelector('.delete-btn') as HTMLButtonElement;

  headerRowCount += 1;
  const keyId = `header${headerRowCount}`;
  const valueId = `value${headerRowCount}`;
  keyLabel.htmlFor = keyId;
  keyInput.id = keyId;
  valueLabel.htmlFor = valueId;
  valueInput.id = valueId;
  keyInput.value = key;
  valueInput.value = value;
  deleteButton.addEventListener('click', () => row.remove());

  headerList.appendChild(row);
}

function getHeaderRows(): { key: string; value: string }[] {
  return Array.from(headerList.querySelectorAll('.header-entry')).map((row) => ({
    key: (row.querySelector('.header-key-input') as HTMLInputElement).value.trim(),
    value: (row.querySelector('.header-value-input') as HTMLInputElement).value.trim(),
  }));
}

function resolveHeaders(): { headers: Record<string, string>; issues: string[] } {
  const headers: Record<string, string> = {};
  const issues: string[] = [];
  const emptyValueKeys: string[] = [];
  const droppedNamelessValues: string[] = [];
  const droppedDuplicateKeys: string[] = [];

  for (const { key, value } of getHeaderRows()) {
    if (!key && !value) continue; // blank row, discard silently
    if (!key) {
      droppedNamelessValues.push(value);
      continue;
    }
    if (key in headers) {
      droppedDuplicateKeys.push(key);
      continue;
    }
    headers[key] = value;
    if (!value) emptyValueKeys.push(key);
  }

  if (droppedNamelessValues.length > 0) {
    issues.push(
      `discarded header(s) with no name: ${droppedNamelessValues.map((v) => `"${v}"`).join(', ')}`,
    );
  }
  if (droppedDuplicateKeys.length > 0) {
    issues.push(
      `dropped duplicate header(s), kept first value: ${droppedDuplicateKeys.join(', ')}`,
    );
  }
  if (emptyValueKeys.length > 0) {
    issues.push(`header(s) with an empty value: ${emptyValueKeys.join(', ')}`);
  }

  return { headers, issues };
}

addHeaderButton.addEventListener('click', () => addHeaderRow());

async function getGrantedOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return SITES.map((site) => site.origin).filter((origin) => origins.includes(patternFor(origin)));
}

const checkboxByOrigin = new Map<string, HTMLInputElement>();

async function renderSiteList() {
  const grantedOrigins = await getGrantedOrigins();
  siteListElement.innerHTML = '';
  checkboxByOrigin.clear();
  for (const site of SITES) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = grantedOrigins.includes(site.origin);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(`${hostnameFor(site.origin)}`));
    siteListElement.appendChild(label);
    checkboxByOrigin.set(site.origin, checkbox);
  }
}

function apiServerPattern(url: string): string | null {
  try {
    return url ? `${getApiUrl(getOrigin(url))}/*` : null;
  } catch {
    return null;
  }
}

let lastServerPattern: string | null = null;

async function loadInitialState() {
  await Promise.all([
    (async () => {
      const config = await getApiServerConfig();
      if (!config) return;
      serverUrl.value = config.url ?? '';
      apiKey.value = config.apiKey ?? '';
      encryptionPassword.value = config.budgetEncryptionPassword ?? '';
      syncId.value = config.syncId ?? '';
      for (const [key, value] of Object.entries(config.headers)) {
        addHeaderRow(key, value);
      }
      lastServerPattern = config.url ? apiServerPattern(config.url) : null;
    })().catch((e) => {
      console.error('getApiServerConfig failed', e);
    }),
    (async () => {
      const xadConfig = await getXadConfig();
      if (!xadConfig) return;
      chaseAccountId.value = xadConfig.actual.chaseAccountId;
      // TODO: this doesn't seem to fill in default value ???
      historyRetentionDays.value = String(
        xadConfig.general.historyRetentionDays || DEFAULT_HISTORY_RETENTION_DAYS,
      );
    })().catch((e) => {
      console.error('getXadConfig failed', e);
    }),
    renderSiteList().catch((e) => {
      console.error('renderSiteList failed', e);
    }),
  ]);
  setFormEnabled(true);
}

void loadInitialState();

async function syncPermissions(): Promise<{ hasApiServerPermission: boolean }> {
  const toGrant: string[] = [];
  const toRevoke: string[] = [];
  for (const site of SITES) {
    const checkbox = checkboxByOrigin.get(site.origin);
    if (!checkbox) continue;
    (checkbox.checked ? toGrant : toRevoke).push(patternFor(site.origin));
  }
  const newServerPattern = apiServerPattern(serverUrl.value);
  if (newServerPattern) toGrant.push(newServerPattern);
  if (toGrant.length > 0) {
    try {
      await chrome.permissions.request({ origins: toGrant });
    } catch (e) {
      console.error('permissions.request failed', e);
    }
  }

  // Continue to revoke even though the user changed their mind about what to grant.
  const hasNewApiServerPermission = newServerPattern
    ? await chrome.permissions.contains({ origins: [newServerPattern] })
    : true;
  if (lastServerPattern && lastServerPattern !== newServerPattern) {
    toRevoke.push(lastServerPattern);
  }
  if (toRevoke.length > 0) {
    try {
      await chrome.permissions.remove({ origins: toRevoke });
    } catch (e) {
      console.error('permissions.remove failed', e);
    }
  }
  lastServerPattern = newServerPattern;

  return { hasApiServerPermission: hasNewApiServerPermission };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!saveButton.disabled) saveButton.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    window.close();
  }
});

saveButton.addEventListener('click', async () => {
  if (!historyRetentionDays.reportValidity()) return;
  setFormEnabled(false);
  try {
    const { headers, issues } = resolveHeaders();
    const config: ApiServerConfig = {
      url: getOrigin(serverUrl.value),
      ...(apiKey.value.trim() && { apiKey: apiKey.value }),
      ...(encryptionPassword.value.trim() && {
        budgetEncryptionPassword: encryptionPassword.value,
      }),
      ...(syncId.value.trim() && { syncId: syncId.value }),
      headers,
    };
    const xadConfig: XadConfig = {
      actual: { chaseAccountId: chaseAccountId.value },
      general: { historyRetentionDays: Number(historyRetentionDays.value) },
    };
    await Promise.all([setApiServerConfig(config), setXadConfig(xadConfig)]);
    const { hasApiServerPermission } = await syncPermissions();
    if (!hasApiServerPermission) {
      issues.unshift('permission was denied, extension will not connect to API server');
    } else if (!isApiServerConfigComplete(config)) {
      issues.unshift('incomplete configuration, extension will be inactive');
    }
    if (issues.length > 0) {
      showStatus(`Settings saved, but: ${issues.join('; ')}.`, 'error');
    } else {
      showStatus('Settings saved', 'success');
    }
  } catch (e) {
    const msg = `Save failed: ${e instanceof Error ? e.message : e}`;
    showStatus(msg, 'error');
    console.error('Save failed', e);
  } finally {
    try {
      await renderSiteList();
    } catch (e) {
      console.error('renderSiteList failed', e);
    }
    setFormEnabled(true);
  }
});

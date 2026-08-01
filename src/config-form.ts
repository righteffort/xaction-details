import {
  type ApiServerConfig,
  type XadConfig,
  getOrigin,
  getApiServerConfig,
  setApiServerConfig,
  isApiServerConfigComplete,
  getXadConfig,
  setXadConfig,
} from './config';
import { getApiUrl } from './testActual';
import { SITES, patternFor, hostnameFor } from './sites';

interface ConfigFormOptions {
  description: string;
}

export function initConfigForm({ description }: ConfigFormOptions) {
  document.body.innerHTML = `
    <style>
      #status.error { color: #b00020; }
    </style>
    <p>${description}</p>
    <fieldset id="formFieldset" disabled>
      <div>
        <label for="serverUrl">API Server URL:</label>
        <input type="url" id="serverUrl" required />
      </div>
      <div>
        <label for="apiKey">API Server API key:</label>
        <input type="password" id="apiKey" required />
      </div>
      <div>
        <label for="encryptionKey">Actual Budget encryption key:</label>
        <input type="password" id="encryptionKey"/>
      </div>
      <div>
        <label for="syncId">Actual Budget Sync ID:</label>
        <input id="syncId" required />
      </div>
      <div>
        <label for="chaseAccountId">Actual Budget Chase Account ID:</label>
        <input id="chaseAccountId" required />
      </div>
      <div>
        <label for="historyRetentionDays">History Retention (days):</label>
        <input type="number" id="historyRetentionDays" min="1"/>
      </div>
      <div>Enable the extension on the following sites:</div>
      <div id="enabledSiteList"></div>
      <button type="button" id="saveButton">Save</button>
    </fieldset>
    <div id="status"></div>
  `;

  const formFieldset = document.getElementById('formFieldset') as HTMLFieldSetElement;
  const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
  const apiKey = document.getElementById('apiKey') as HTMLInputElement;
  const encryptionPassword = document.getElementById('encryptionKey') as HTMLInputElement;
  const syncId = document.getElementById('syncId') as HTMLInputElement;
  const chaseAccountId = document.getElementById('chaseAccountId') as HTMLInputElement;
  const historyRetentionDays = document.getElementById('historyRetentionDays') as HTMLInputElement;
  const siteListElement = document.getElementById('enabledSiteList');
  const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  function showStatus(message: string, type: string) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  function setFormEnabled(enabled: boolean) {
    formFieldset.disabled = !enabled;
  }

  async function getGrantedOrigins(): Promise<string[]> {
    const { origins = [] } = await chrome.permissions.getAll();
    return SITES.map((site) => site.origin).filter((origin) =>
      origins.includes(patternFor(origin)),
    );
  }

  const checkboxByOrigin = new Map<string, HTMLInputElement>();

  async function renderSiteList() {
    if (!siteListElement) return;
    const grantedOrigins = await getGrantedOrigins();
    siteListElement.innerHTML = '';
    checkboxByOrigin.clear();
    for (const site of SITES) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = grantedOrigins.includes(site.origin);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${hostnameFor(site.origin)}`));
      siteListElement.appendChild(label);
      siteListElement.appendChild(document.createElement('br'));
      checkboxByOrigin.set(site.origin, checkbox);
    }
  }

  function apiServerPattern(url: string): string | null {
    return url ? `${getApiUrl(getOrigin(url))}/*` : null;
  }

  let lastServerPattern: string | null = null;

  async function loadInitialState() {
    await Promise.all([
      (async () => {
        const config = await getApiServerConfig();
        if (!config) return;
        serverUrl.value = config.url;
        apiKey.value = config.apiKey;
        encryptionPassword.value = config.budgetEncryptionPassword ?? '';
        syncId.value = config.syncId;
        lastServerPattern = apiServerPattern(config.url);
      })().catch((e) => {
        console.error('getApiServerConfig failed', e);
      }),
      (async () => {
        const xadConfig = await getXadConfig();
        if (!xadConfig) return;
        chaseAccountId.value = xadConfig.actual.chaseAccountId;
        historyRetentionDays.value = String(xadConfig.general.historyRetentionDays);
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
    if (lastServerPattern && lastServerPattern !== newServerPattern && hasNewApiServerPermission) {
      toRevoke.push(lastServerPattern);
    }
    if (toRevoke.length > 0) {
      try {
        await chrome.permissions.remove({ origins: toRevoke });
      } catch (e) {
        console.error('permissions.remove failed', e);
      }
    }
    if (hasNewApiServerPermission) lastServerPattern = newServerPattern;

    return { hasApiServerPermission: hasNewApiServerPermission };
  }

  saveButton.addEventListener('click', async () => {
    setFormEnabled(false);
    try {
      const config: ApiServerConfig = {
        url: getOrigin(serverUrl.value),
        apiKey: apiKey.value,
        ...(encryptionPassword.value && {
          budgetEncryptionPassword: encryptionPassword.value,
        }),
        syncId: syncId.value,
      };
      const xadConfig: XadConfig = {
        actual: { chaseAccountId: chaseAccountId.value },
        general: { historyRetentionDays: Number(historyRetentionDays.value) },
      };
      await Promise.all([setApiServerConfig(config), setXadConfig(xadConfig)]);
      const { hasApiServerPermission } = await syncPermissions();
      if (!hasApiServerPermission) {
        showStatus('Permission was denied. Extension will not connect to API server.', 'error');
      } else if (!isApiServerConfigComplete(config)) {
        showStatus('Incomplete configuration, extension will be inactive', 'error');
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
}

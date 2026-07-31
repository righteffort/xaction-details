import {
  getOrigin,
  getApiServerConfig,
  setApiServerConfig,
  isApiServerConfigComplete,
  getXadConfig,
  setXadConfig,
} from './config';
import { SITES, patternFor, hostnameFor } from './sites';

interface ConfigFormOptions {
  description: string;
}

const INCOMPLETE_WARNING = 'Incomplete configuration, extension will be inactive';

export function initConfigForm({ description }: ConfigFormOptions) {
  document.body.innerHTML = `
    <p>${description}</p>
    <div>
      <label for="serverUrl">API Server URL:</label>
      <input type="url" id="serverUrl" required />
    </div>
    <div>
      <label for="apiKey">API Server API key:</label>
      <input id="apiKey" required />
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
      <input type="number" id="historyRetentionDays" required />
    </div>
    <div>Enable the extension on the following sites:</div>
    <div id="enabledSiteList"></div>
    <button type="submit" id="saveButton">Save</button>
    <div id="status"></div>
  `;

  const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
  const apiKey = document.getElementById('apiKey') as HTMLInputElement;
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

  const checkboxByOrigin = new Map<string, HTMLInputElement>();

  async function getGrantedOrigins(): Promise<string[]> {
    const { origins = [] } = await chrome.permissions.getAll();
    return SITES.map((site) => site.origin).filter((origin) =>
      origins.includes(patternFor(origin)),
    );
  }

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

  void (async () => {
    const config = await getApiServerConfig();
    if (!config) return;
    serverUrl.value = config.url;
    apiKey.value = config.apiKey;
    syncId.value = config.syncId;
    if (!isApiServerConfigComplete(config)) {
      showStatus('Incomplete configuration', 'warning');
    }
  })().catch((e) => {
    console.error('getApiServerConfig failed', e);
  });

  void renderSiteList().catch((e) => {
    console.error('renderSiteList failed', e);
  });

  void (async () => {
    const xadConfig = await getXadConfig();
    if (!xadConfig) return;
    chaseAccountId.value = xadConfig.actual.chaseAccountId;
    historyRetentionDays.value = String(xadConfig.general.historyRetentionDays);
  })().catch((e) => {
    console.error('getXadConfig failed', e);
  });

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      const grantedOrigins = await getGrantedOrigins();
      const toGrant: string[] = [];
      const toRevoke: string[] = [];
      for (const site of SITES) {
        const checkbox = checkboxByOrigin.get(site.origin);
        if (!checkbox) continue;
        const currentlyGranted = grantedOrigins.includes(site.origin);
        if (checkbox.checked && !currentlyGranted) toGrant.push(patternFor(site.origin));
        if (!checkbox.checked && currentlyGranted) toRevoke.push(patternFor(site.origin));
      }
      if (toRevoke.length > 0) {
        try {
          await chrome.permissions.remove({ origins: toRevoke });
        } catch (e) {
          console.error('permissions.remove failed', e);
        }
      }
      if (toGrant.length > 0) {
        try {
          await chrome.permissions.request({ origins: toGrant });
        } catch (e) {
          console.error('permissions.request failed', e);
        }
      }
      const config = {
        url: getOrigin(serverUrl.value),
        apiKey: apiKey.value,
        syncId: syncId.value,
      };
      await setApiServerConfig(config);
      await setXadConfig({
        actual: { chaseAccountId: chaseAccountId.value },
        general: { historyRetentionDays: Number(historyRetentionDays.value) },
      });
      showStatus(
        !isApiServerConfigComplete(config) ? INCOMPLETE_WARNING : 'Settings saved',
        'success',
      );
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
      saveButton.disabled = false;
    }
  });
}

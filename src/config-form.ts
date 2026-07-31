import {
  getOrigin,
  getApiServerConfig,
  setApiServerConfig,
  isApiServerConfigComplete,
} from './config';

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
    <button type="submit" id="saveButton">Save</button>
    <div id="status"></div>
  `;

  const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
  const apiKey = document.getElementById('apiKey') as HTMLInputElement;
  const syncId = document.getElementById('syncId') as HTMLInputElement;
  // const chaseAccountId = document.getElementById('chaseAccountId') as HTMLInputElement;
  const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  function showStatus(message: string, type: string) {
    statusDiv.textContent = message;
    statusDiv.className = type;
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

  saveButton.addEventListener('click', async () => {
    try {
      const config = {
        url: getOrigin(serverUrl.value),
        apiKey: apiKey.value,
        syncId: syncId.value,
      };

      await setApiServerConfig(config);
      showStatus(
        !isApiServerConfigComplete(config) ? INCOMPLETE_WARNING : 'Settings saved',
        'success',
      );
    } catch (e) {
      const msg = `Failed: ${e instanceof Error ? e.message : e}`;
      showStatus(msg, 'error');
      console.log(msg);
    }
  });
}

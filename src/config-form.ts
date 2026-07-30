import {
  getOrigin,
  getApiServerConfig,
  setApiServerConfig,
  isApiServerConfigComplete,
} from './config';

interface ConfigFormOptions {
  // Prefill with the currently-saved config (options page only).
  prefill: boolean;
  // Message shown after a successful save.
  savedMessage: string;
}

const INCOMPLETE_WARNING = 'Incomplete configuration, extension will be inactive';

export function initConfigForm({ prefill, savedMessage }: ConfigFormOptions) {
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

  // TODO this is all silly we can have a single form for onboarding and options probably.
  if (prefill) {
    void (async () => {
      const config = await getApiServerConfig();
      if (!config) return;
      serverUrl.value = config.url;
      apiKey.value = config.apiKey;
      syncId.value = config.syncId;
      if (!isApiServerConfigComplete(config)) {
        showStatus('Incomplete configuration', 'warning');
      }
    })();
  }

  saveButton.addEventListener('click', async () => {
    try {
      const config = {
        url: getOrigin(serverUrl.value),
        apiKey: apiKey.value,
        syncId: syncId.value,
      };

      await setApiServerConfig(config);
      showStatus(!isApiServerConfigComplete(config) ? INCOMPLETE_WARNING : savedMessage, 'success');
    } catch (e) {
      const msg = `Failed: ${e instanceof Error ? e.message : e}`;
      showStatus(msg, 'error');
      console.log(msg);
    }
  });
}

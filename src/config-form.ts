import { getOrigin, getXadConfig, isXadConfigIncomplete, setXadConfig } from './config';

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
  const chaseAccountId = document.getElementById('chaseAccountId') as HTMLInputElement;
  const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  function showStatus(message: string, type: string) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  if (prefill) {
    void (async () => {
      const xadConfig = await getXadConfig();
      const config = xadConfig?.actual;
      if (!config) return;
      serverUrl.value = config.apiServerUrl;
      apiKey.value = config.apiServerApiKey;
      syncId.value = config.syncId;
      chaseAccountId.value = config.chaseAccountId;
      if (isXadConfigIncomplete(xadConfig)) {
        showStatus('Incomplete configuration', 'warning');
      }
    })();
  }

  saveButton.addEventListener('click', async () => {
    try {
      const config = {
        actual: {
          apiServerUrl: getOrigin(serverUrl.value),
          apiServerApiKey: apiKey.value,
          syncId: syncId.value,
          chaseAccountId: chaseAccountId.value,
        },
      };

      await setXadConfig(config);
      showStatus(isXadConfigIncomplete(config) ? INCOMPLETE_WARNING : savedMessage, 'success');
    } catch (e) {
      const msg = `Failed: ${e instanceof Error ? e.message : e}`;
      showStatus(msg, 'error');
      console.log(msg);
    }
  });
}

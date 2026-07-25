console.debug('THROMER hello from background');

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_UI' });
  } catch {
    // Tab not listening, ok to swallow exception.
  }
});

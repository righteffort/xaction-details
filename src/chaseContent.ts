import { createScrapeUi, toggleScrapeUi } from './scrapeUi';

console.debug('THROMER hello from chase content');

const HOST_ID = 'xaction-details-host';

function createUi() {
  const { host, closeBtn, fromInput, toInput, scrapeBtn } =
    createScrapeUi(HOST_ID);
  closeBtn.addEventListener('click', () => {
    host.style.display = 'none';
  });
  const updateScrapeEnabled = () => {
    scrapeBtn.disabled = !(fromInput.value && toInput.value);
  };
  fromInput.addEventListener('input', updateScrapeEnabled);
  toInput.addEventListener('input', updateScrapeEnabled);
  scrapeBtn.addEventListener('click', () => {
    console.debug('Time to scrape');
  });
}

// Create it hidden on page load — not shown until the icon is clicked.
createUi();

chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_UI') {
      toggleScrapeUi(HOST_ID);
      sendResponse({ ok: true });
    }
  },
);

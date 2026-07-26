import { ScrapeUi } from './scrapeUi';

const HOST_ID = 'xaction-details-host';

class AmazonContent {
  private readonly ui: ScrapeUi;
  constructor() {
    this.ui = new ScrapeUi({
      hostId: HOST_ID,
      onScrape: (from, to) => {
        this.scrape(from, to);
      },
    });
    chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
      if (message.type === 'TOGGLE_UI') {
        this.ui.toggle();
        sendResponse({ ok: true });
      }
    });
  }
  private scrape(from: string, to: string) {
    this.ui.setStatus(`time to scrape ${from} through ${to}...`);
  }
}

new AmazonContent();

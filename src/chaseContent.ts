import { ScrapeUi } from './scrapeUi';
import { Chase } from './chase';
import type { ChaseTransaction, ChaseTransactionHandler } from './chase';

const HOST_ID = 'xaction-details-host';

interface ChaseStorage {
  transactions: Record<string, ChaseTransaction>;
}

class ChaseContent {
  private readonly ui: ScrapeUi;
  constructor() {
    this.ui = new ScrapeUi({
      hostId: HOST_ID,
      onScrape: (from, to) => {
        this.ui.setScrapeEnabled(false);
        try {
          this.scrape(from, to);
        } finally {
          this.ui.setScrapeEnabled(true);
        }
      },
    });
    const maxDate = Temporal.Now.zonedDateTimeISO('America/New_York').toPlainDate();
    const toDate = maxDate;
    this.ui.toInput.value = toDate.toString();
    const fromDate = toDate.subtract({ days: 7 });
    this.ui.fromInput.value = fromDate.toString();
    this.ui.setScrapeEnabled(true);
    chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
      if (message.type === 'TOGGLE_UI') {
        this.ui.toggle();
        sendResponse({ ok: true });
      }
    });
  }
  private async scrape(from: string, to: string) {
    const CHASE_STORAGE_KEY = 'chase';
    const chaseStorage = ((await chrome.storage.local.get(CHASE_STORAGE_KEY))[CHASE_STORAGE_KEY] as
      | ChaseStorage
      | undefined) ?? {
      transactions: {},
    };
    this.ui.setStatus(`Scraping ${from} through ${to}`);
    let added = 0;
    let skipped = 0;
    let size = 0;
    const handler: ChaseTransactionHandler = {
      setSize(n) {
        size = n;
      },
      has: (key) => {
        // TODO: Implement me!
        console.log(`time to check whether we have ${key}`);
        const result = Object.hasOwn(chaseStorage.transactions, key);
        if (result) {
          skipped += 1;
        } else {
          added += 1;
        }
        return result;
      },
      handle: (key, entry) => {
        chaseStorage.transactions[key] = entry;
        console.debug(`Will store ${key}:${JSON.stringify(entry)}`);
        this.ui.setStatus(
          `Working: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
        );
      },
    };
    try {
      await new Chase({ fetch: (input, init?) => fetch(input, init) }).scrape(from, to, handler);
      await chrome.storage.local.set({ [CHASE_STORAGE_KEY]: chaseStorage });
      this.ui.setStatus(
        `Complete: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
      );
    } catch (e) {
      this.ui.setStatus(`Failed: ${(e as Error).message}`);
    }
  }
}

new ChaseContent();

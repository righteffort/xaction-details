import { ScrapeUi } from './scrapeUi';
import { Chase } from './chase';
import type { ChaseTransactionHandler } from './chase';
import { callSw } from './rpc';
import { realFetcher } from './types';
const HOST_ID = 'xaction-details-host';

class ChaseContent {
  private readonly ui: ScrapeUi;
  constructor() {
    this.ui = new ScrapeUi({
      hostId: HOST_ID,
      onScrape: async (from, to) => {
        this.ui.setScrapeEnabled(false);
        try {
          await this.scrape(from, to);
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
    this.ui.setStatus(`Scraping ${from} through ${to}`);
    let added = 0;
    let skipped = 0;
    let size = 0;
    const handler: ChaseTransactionHandler = {
      setSize(n) {
        size = n;
      },
      has: async (key) => {
        console.debug(`check whether we have ${key}`);
        const result = await callSw('hasChaseTransaction', key);
        if (result) {
          skipped++;
        } else {
          added++;
        }
        return result;
      },
      handle: async (key, entry) => {
        await callSw('putChaseTransaction', { id: key, transaction: entry });
        console.debug(`Stored ${key}:${JSON.stringify(entry)}`);
        this.ui.setStatus(
          `Working: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
        );
      },
    };
    try {
      await new Chase(realFetcher).scrape(from, to, handler);
      this.ui.setStatus(
        `Complete: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
      );
    } catch (e) {
      this.ui.setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

const INJECTION_MARKER = '__xad_ChaseContentInjected';
if (!document.documentElement.dataset[INJECTION_MARKER]) {
  document.documentElement.dataset[INJECTION_MARKER] = '1';
  new ChaseContent();
}

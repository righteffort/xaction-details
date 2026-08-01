import { Amazon, type AmazonInvoice } from './amazon';
import { callSw } from './rpc';
import { realFetcher } from './types';

const HOST_ID = 'xaction-details-host';

class AmazonScrapeUi {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private scrapeButton: HTMLButtonElement;
  private statusLine: HTMLElement;

  constructor(onScrape: () => void) {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.host.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    display: none;
  `;
    document.documentElement.appendChild(this.host);

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
    <style>
      .box {
        position: relative;
        width: max-content;
        max-width: 260px;
        box-sizing: border-box;
        padding: 12px 28px 12px 12px;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-family: sans-serif;
        font-size: 13px;
      }
      .close-button {
        position: absolute;
        top: 4px;
        right: 8px;
        cursor: pointer;
        color: #666;
        font-size: 16px;
        line-height: 1;
        user-select: none;
      }
      #actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 4px;
      }
      #status {
        margin-top: 8px;
        color: #666;
        overflow-wrap: break-word;
        word-break: break-word;
      }
      label {
        margin-right: 4px;
      }
    </style>
    <div class="box">
      <span class="close-button">&times;</span>
      <div id="actions">
        <button type="button" id="scrape">Grab invoices</button>
      </div>
      <div id="status">Idle</div>
    </div>
  `;
    this.scrapeButton = this.shadow.querySelector('#scrape') as HTMLButtonElement;
    this.statusLine = this.shadow.querySelector('#status') as HTMLElement;
    const closeButton = this.shadow.querySelector('.close-button') as HTMLElement;
    closeButton.addEventListener('click', () => this.hide());
    this.scrapeButton.addEventListener('click', () => {
      onScrape();
    });
  }

  setStatus(message: string): void {
    console.log(message);
    this.statusLine.textContent = message;
  }

  setScrapeEnabled(enabled: boolean): void {
    this.scrapeButton.disabled = !enabled;
  }

  show(): void {
    this.host.style.display = '';
  }
  hide(): void {
    this.host.style.display = 'none';
  }
  toggle(): void {
    this.host.style.display = this.host.style.display === 'none' ? '' : 'none';
  }
  // get isVisible(): boolean { return this.host.style.display !== 'none'; }
}

class AmazonContent {
  private readonly amazon: Amazon;
  private readonly ui: AmazonScrapeUi;
  constructor() {
    this.amazon = new Amazon(realFetcher);
    this.ui = new AmazonScrapeUi(async () => {
      this.ui.setScrapeEnabled(false);
      try {
        await this.scrape();
      } finally {
        this.ui.setScrapeEnabled(true);
      }
    });
    chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
      if (message.type === 'TOGGLE_UI') {
        this.ui.toggle();
        sendResponse({ ok: true });
      }
    });
  }
  private async scrape() {
    // We'll blithely ignore the fact that Amazon invoices are mutable
    const orderNumbers = await callSw('getNeededAmazonOrders');
    const size = orderNumbers.length;
    this.ui.setStatus(`time to scrape ... ${size} orders`); // TODO: Say something more sensible when length is zero
    let added = 0;
    let skipped = 0;
    for (const [i, orderNumber] of orderNumbers.entries()) {
      let invoice: AmazonInvoice | undefined;
      try {
        invoice = await this.amazon.getInvoice(orderNumber);
      } catch (e) {
        console.warn(`Error getting invoice for ${orderNumber}; ${e}`);
      }
      if (i < size - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (invoice != null) {
        added++;
        await callSw('putAmazonInvoice', { orderNumber, invoice });
      } else {
        skipped++;
      }
      this.ui.setStatus(
        `Working: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
      );
    }
    this.ui.setStatus(
      `Complete: processed ${added + skipped}/${size} ` + `(added ${added}, skipped ${skipped})`,
    );
  }
}

const INJECTION_MARKER = '__xad_AmazonContentInjected';
if (!document.documentElement.dataset[INJECTION_MARKER]) {
  document.documentElement.dataset[INJECTION_MARKER] = '1';
  new AmazonContent();
}

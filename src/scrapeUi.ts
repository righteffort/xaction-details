export interface ScrapeUiOptions {
  hostId: string;
  onScrape: (from: string, to: string) => void;
}

export class ScrapeUi {
  readonly fromInput: HTMLInputElement;
  readonly toInput: HTMLInputElement;

  private host: HTMLElement;
  private shadow: ShadowRoot;
  private scrapeButton: HTMLButtonElement;
  private statusLine: HTMLElement;

  constructor(options: ScrapeUiOptions) {
    this.host = document.createElement('div');
    this.host.id = options.hostId;
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
        <label for="from">Start:</label>
        <input type="date" id="from" required />
        <label for="to">End:</label>
        <input type="date" id="to" required />
        <button id="scrape" disabled>Grab transactions</button>
      </div>
      <div id="status">Idle</div>
    </div>
  `;

    this.fromInput = this.shadow.querySelector('#from') as HTMLInputElement;
    this.toInput = this.shadow.querySelector('#to') as HTMLInputElement;
    this.scrapeButton = this.shadow.querySelector('#scrape') as HTMLButtonElement;
    this.statusLine = this.shadow.querySelector('#status') as HTMLElement;
    const updateScrapeEnabled = () => {
      this.scrapeButton.disabled = !(this.fromInput.value && this.toInput.value);
    };
    this.fromInput.addEventListener('input', updateScrapeEnabled);
    this.toInput.addEventListener('input', updateScrapeEnabled);

    const closeButton = this.shadow.querySelector('.close-button') as HTMLElement;
    closeButton.addEventListener('click', () => this.hide());

    this.scrapeButton.addEventListener('click', () => {
      options.onScrape(this.fromInput.value, this.toInput.value);
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

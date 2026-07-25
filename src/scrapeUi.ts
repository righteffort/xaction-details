export interface ScrapeUi {
  host: HTMLElement;
  shadow: ShadowRoot;
  closeBtn: HTMLElement;
  fromInput: HTMLInputElement;
  toInput: HTMLInputElement;
  scrapeBtn: HTMLButtonElement;
  statusEl: HTMLElement;
}

export function createScrapeUi(hostId: string): ScrapeUi {
  const host = document.createElement('div');
  host.id = hostId;
  host.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    display: none;
  `;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
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
      .close-btn {
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
      <span class="close-btn">&times;</span>
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

  return {
    host,
    shadow,
    closeBtn: shadow.querySelector('.close-btn') as HTMLElement,
    fromInput: shadow.querySelector('#from') as HTMLInputElement,
    toInput: shadow.querySelector('#to') as HTMLInputElement,
    scrapeBtn: shadow.querySelector('#scrape') as HTMLButtonElement,
    statusEl: shadow.querySelector('#status') as HTMLElement,
  };
}

export function toggleScrapeUi(hostId: string): void {
  const host = document.getElementById(hostId);
  if (host != null) {
    host.style.display = host.style.display === 'none' ? '' : 'none';
  }
}

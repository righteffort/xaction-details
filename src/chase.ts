import type { Fetcher } from './types';

interface JpmcAppDataList {
  profileId?: string;
  cache?: [
    {
      response: {
        defaultAccountId: string;
      };
    },
  ];
}

interface JpmcActivity {
  transactionStatusCode?: string;
  derivedUniqueTransactionIdentifier?: string;
  merchantDetails: {
    rawMerchantDetails: {
      merchantDbaName: string;
    };
  };
  transactionAmount: number;
  transactionPostDate: string;
}

interface JpmcTransactionHistory {
  httpStatusCode?: number;
  activities?: [JpmcActivity];
  paginationContextualText?: string;
}

interface JpmcDetails {
  transactionDetails: {
    merchantOrderIdentifier: string;
  };
}

export interface ChaseTransaction {
  merchantDbaName: string;
  transactionAmount: number;
  transactionPostDate: Date;
  merchantOrderIdentifier?: string;
}

export interface ChaseTransactionHandler {
  setSize: (n: number) => void;
  has: (key: string) => boolean;
  handle: (key: string, entry: ChaseTransaction) => void;
}

export class Chase {
  private initialized: boolean;
  private fetcher: Fetcher;
  private onlineProfileId: string;
  private digitalAccountId: string;
  constructor(fetcher: Fetcher) {
    this.initialized = false;
    this.fetcher = fetcher;
    this.onlineProfileId = '';
    this.digitalAccountId = '';
  }

  async scrape(startDate: string, endDate: string, handler: ChaseTransactionHandler) {
    console.debug('Initializing');
    await this.initialize();
    console.debug('Initialized');
    // TODO: Chase *might* respond as follows, in which case decrement endDate.
    // {errorCategoryName: 'Bad Request', httpStatusCode: '400', errorDescription: 'account-activity-end-date cannot be in the future', serviceErrorCode: 'CTU_NUCLEUS_INVALID_REQUEST_FIELD', requestURI: '/credit-card/transactions/inquiry-maintenance/etu/transaction-history/v3/accounts/transactions'}
    const activities = await this.getRecentActivities(startDate, endDate);
    handler.setSize(activities.size);
    console.debug('Got recent');
    if (activities.size === 0) {
      console.debug('No transactions found in range.');
    }
    let n = 0;
    for (const [k, a] of activities) {
      n++;
      if (!handler.has(k)) {
        const entry: ChaseTransaction = {
          merchantDbaName: a.merchantDetails.rawMerchantDetails.merchantDbaName,
          transactionAmount: a.transactionAmount,
          transactionPostDate: new Date(Date.parse(a.transactionPostDate)),
        };
        const details = await this.getDetails(k);
        const order = details.transactionDetails.merchantOrderIdentifier;
        if (order) {
          entry.merchantOrderIdentifier = order;
        }
        handler.handle(k, entry);
        if (n < activities.size) {
          console.debug('Pausing 2s');
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  private async initialize() {
    if (this.initialized) {
      return;
    }
    const url = '/svc/rl/accounts/l4/v1/app/data/list';
    const resp = (await this.fetchUrl('POST', url)) as JpmcAppDataList;
    const failures: string[] = [];
    if (!resp.profileId) {
      failures.push('profileId missing');
    } else {
      this.onlineProfileId = resp.profileId;
    }
    if (!resp.cache) {
      failures.push('cache missing');
    } else {
      for (const c of resp.cache) {
        const r = c.response;
        if (r.defaultAccountId) {
          this.digitalAccountId = r.defaultAccountId;
          break;
        }
      }
      if (!this.digitalAccountId) {
        failures.push('digitalAccountId missing');
      }
    }
    if (failures.length) {
      console.error(JSON.stringify(resp));
      console.error(failures.join('; '));
      throw Error(failures.join('; '));
    }
    this.initialized = true;
  }

  private async getRecentActivities(
    firstDay: string,
    lastDay: string,
  ): Promise<Map<string, JpmcActivity>> {
    const activities = new Map<string, JpmcActivity>();
    let paginationMarker = '';
    while (true) {
      const url = this.getListUrl(100, firstDay, lastDay, paginationMarker);
      const resp = (await this.fetchUrl('GET', url)) as JpmcTransactionHistory;
      if (!resp.activities) {
        console.error(JSON.stringify(resp));
        console.error(`No activities?! ${firstDay} ${lastDay} ${paginationMarker}`);
        break;
      }
      resp.activities.forEach((a) => {
        if (a.transactionStatusCode !== 'PENDING') {
          const key = a.derivedUniqueTransactionIdentifier;
          if (key) {
            delete a.derivedUniqueTransactionIdentifier;
            activities.set(key, a);
          } else {
            console.error(`derivedUniqueTransactionIdentifier missing from ${JSON.stringify(a)}`);
          }
        }
      });

      if (resp.paginationContextualText) {
        paginationMarker = resp.paginationContextualText;
      }
      if (!paginationMarker) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000)); // 2000 ms
    }
    return activities;
  }

  private async getDetails(key: string): Promise<JpmcDetails> {
    const post_date_s = key.slice(0, 8);
    const post_time_s = key.slice(8, 15);
    const path = `/svc/wr/accounts/secure/gateway/credit-card/transactions/inquiry-maintenance/digital-card-transaction/v1/profiles/${this.onlineProfileId}/card-transaction-details`;
    const params = new URLSearchParams();
    const args = new Map<string, string>(
      Object.entries({
        'digital-account-identifier': this.digitalAccountId,
        'transaction-post-date': post_date_s,
        'transaction-post-time': post_time_s,
        'transaction-identifier': key,
      }),
    );
    args.forEach((value, key) => {
      params.append(key, value);
    });
    const url = `${path}?${params.toString()}`;
    return this.fetchUrl('GET', url) as Promise<JpmcDetails>;
  }

  private getListUrl(
    batch: number,
    firstDay: string,
    lastDay: string,
    paginationMarker: string,
  ): string {
    const path =
      '/svc/rr/accounts/secure/gateway/credit-card/transactions/inquiry-maintenance/etu-transactions/v4/accounts/transactions';
    const params = new URLSearchParams();
    const o = {
      'digital-account-identifier': this.digitalAccountId,
      'provide-available-statement-indicator': 'true',
      'record-count': batch.toString(),
      'sort-order-code': 'A',
      'sort-key-code': 'T',
      'account-activity-start-date': firstDay,
      'account-activity-end-date': lastDay,
      'request-type-code': 'T',
    };
    const args = new Map<string, string>(Object.entries(o));
    if (paginationMarker) {
      args.set('pagination-contextual-text', paginationMarker);
    }
    args.forEach((val, key) => {
      params.append(key, val);
    });
    return `${path}?${params.toString()}`;
  }

  private async fetchUrl(method: string, url: string): Promise<object> {
    const headers = new Headers({
      'x-jpmc-channel': 'id=C30',
      'x-jpmc-client-request-id': crypto.randomUUID(),
      'x-jpmc-csrf-token': 'NONE',
    });
    if (method === 'POST') {
      headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    }
    console.debug(`fetch ${url}`);
    const response = await this.fetcher.fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: new Headers(headers),
    });
    if (!response.ok) {
      throw new Error(`${url} response status: ${response.status}`);
    }
    return response.json();
  }
}

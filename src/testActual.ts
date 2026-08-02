import type { ApiServerConfig } from './config';
import type { components } from './gen/actual-http-api';
import createClient from 'openapi-fetch';
import type { Client } from 'openapi-fetch';
import type { paths } from './gen/actual-http-api';

type Account = components['schemas']['Account'];
// type Transaction = components["schemas"]["Transaction"];
// type Budget = components["schemas"]["Budget"];
// type Category = components["schemas"]["Category"];

export function getApiUrl(url: string): string {
  return `${url}/v1`;
}

const RESERVED_HEADERS = new Set(['x-api-key', 'budget-encryption-password']);

export class ActualHttpClient {
  private readonly api: Client<paths>;
  private readonly budgetSyncId: string;
  constructor(config: ApiServerConfig) {
    if (config.url == null) {
      throw new Error('Misconfiguration: API Server URL not set');
    }
    if (config.syncId == null) {
      throw new Error('Misconfiguration: budget sync ID not set');
    }
    this.budgetSyncId = config.syncId;
    const entries = Object.entries(config.headers);
    entries.forEach(([name, value], i) => {
      if (!name) {
        throw new Error(
          `Configuration error, blank API server header name for header at index ${i + 1} of ${entries.length}`,
        );
      }
      if (!value) {
        throw new Error(`Configuration error, API server header '${name}' has blank value`);
      }
      if (RESERVED_HEADERS.has(name.toLowerCase())) {
        throw new Error(`Configuration error, API server header '${name}' is reserved`);
      }
    });
    this.api = createClient<paths>({
      baseUrl: getApiUrl(config.url),
      headers: {
        ...config.headers,
        'x-api-key': config.apiKey,
        ...(config.budgetEncryptionPassword !== undefined && {
          'budget-encryption-password': config.budgetEncryptionPassword,
        }),
      },
    });
    this.api.use({
      onRequest({ request }) {
        // AbortSignal.timeout must be created fresh per request to start counting
        // from when the request actually goes out, not from client construction.
        // Request.signal is read-only, so we must construct a new Request to change it.
        return new Request(request, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
        });
      },
    });
  }
  async listAccounts(): Promise<Account[]> {
    const budgetSyncId = this.budgetSyncId;
    if (budgetSyncId == null) {
      throw new Error('Misconfiguration: budget sync ID not set');
    }
    const { data, error } = await this.api.GET('/budgets/{budgetSyncId}/accounts', {
      params: { path: { budgetSyncId } },
    });
    if (error) {
      // TODO: http status code?
      throw new Error(`Failed to list accounts: ${JSON.stringify(error)}`);
    }
    return data.data;
  }
}

function renderAccountLabel(account: Account): string {
  return `${account.name} (${account.offbudget ? 'off-budget' : 'on-budget'})`;
}

export async function testActual(client: ActualHttpClient) {
  console.log('in testActual');
  const accounts = await client.listAccounts();
  const message = accounts.map((a) => renderAccountLabel(a)).join(',');
  console.log(message);
}

import type { ApiServerConfig } from './config';
import type { components } from './gen/actual-http-api';
import createClient from 'openapi-fetch';
import type { Client } from 'openapi-fetch';
import type { paths } from './gen/actual-http-api';

type Account = components['schemas']['Account'];
// type Transaction = components["schemas"]["Transaction"];
// type Budget = components["schemas"]["Budget"];
// type Category = components["schemas"]["Category"];

export class ActualHttpClient {
  private readonly api: Client<paths>;
  private readonly defaultSyncId: string;
  constructor(config: ApiServerConfig) {
    this.api = createClient<paths>({
      baseUrl: `${config.url}/v1`,
      headers: {
        'x-api-key': config.apiKey,
        ...(config.budgetEncryptionKey !== undefined && {
          'budget-encryption-password': config.budgetEncryptionKey,
        }),
      },
      signal: AbortSignal.timeout(30_000),
    });
    this.defaultSyncId = config.syncId;
  }
  async listAccounts(budgetSyncId: string | null): Promise<Account[]> {
    if (!budgetSyncId) {
      budgetSyncId = this.defaultSyncId;
    }
    const { data, error } = await this.api.GET('/budgets/{budgetSyncId}/accounts', {
      params: { path: { budgetSyncId } },
    });
    if (error) {
      throw new Error(`Failed to list accounts: ${error}`);
    }
    return data.data;
  }
}

function renderAccountLabel(account: Account): string {
  return `${account.name} (${account.offbudget ? 'off-budget' : 'on-budget'})`;
}

export async function testActual(client: ActualHttpClient, budgetSyncId: string | null = null) {
  console.log('in testActual');
  const accounts = await client.listAccounts(budgetSyncId);
  const message = accounts.map((a) => renderAccountLabel(a)).join(',');
  console.log(message);
}

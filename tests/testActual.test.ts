import { describe, expect, it } from 'vitest';
import type { ApiServerConfig } from '../src/config';
import { ActualHttpClient } from '../src/testActual';

const BASE_CONFIG: ApiServerConfig = {
  syncId: 'xyz',
  url: 'http://localhost:5006',
  apiKey: 'key',
  headers: {},
};

describe('ActualHttpClient', () => {
  it('throws on reserved headers', () => {
    expect(
      () => new ActualHttpClient({ ...BASE_CONFIG, headers: { 'x-api-key': 'nope' } }),
    ).toThrow(/is reserved/);
    expect(
      () =>
        new ActualHttpClient({ ...BASE_CONFIG, headers: { 'budget-encryption-password': 'nope' } }),
    ).toThrow();
  });

  it('accepts a non-reserved header', () => {
    expect(
      () => new ActualHttpClient({ ...BASE_CONFIG, headers: { 'x-custom': 'ok' } }),
    ).not.toThrow();
  });
});

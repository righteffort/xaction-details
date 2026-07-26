export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<ResponseLike>;
}
export interface ResponseLike extends Pick<Response, 'json' | 'ok' | 'status' | 'text'> {}
export const realFetcher: Fetcher = { fetch: (input, init?) => fetch(input, init) };

export type Cents = number & { readonly __brand: 'Cents' };
export function addCents(...values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0) as Cents;
}

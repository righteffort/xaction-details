export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<ResponseLike>;
}

export interface ResponseLike extends Pick<Response, 'json' | 'ok' | 'status'> {}

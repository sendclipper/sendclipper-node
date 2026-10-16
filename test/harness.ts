import { SendClipper, type ClientOptions } from '../src/index.js';

export interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
  rawBody: unknown;
}

type Reply = Response | ((call: Call) => Response | Promise<Response>) | Error;

/** A fake `fetch` that records each call and answers from a queue. */
export function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchImpl = (async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: Call = { method: init.method ?? 'GET', url, headers, body, rawBody: init.body };
    calls.push(call);
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected request ${call.method} ${url.pathname}`);
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(call) : next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function client(replies: Reply[], opts: ClientOptions = {}) {
  const { fetchImpl, calls } = fakeFetch(replies);
  const sc = new SendClipper({
    apiKey: 'sc_live_test',
    baseUrl: 'https://api.test',
    fetch: fetchImpl,
    ...opts,
  });
  return { sc, calls };
}

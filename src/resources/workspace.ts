import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg } from '../core.js';
import type { ApiKey, Workspace } from '../types.js';

export class WorkspaceResource {
  constructor(private readonly http: HttpClient) {}

  /** The workspace this key belongs to. */
  get(options: RequestOptions = {}): Promise<Result<Workspace>> {
    return this.http.call({ method: 'GET', path: '/workspace', ...options });
  }
}

export class ApiKeys {
  constructor(private readonly http: HttpClient) {}

  /** The workspace's keys, masked. Keys are created and revoked in the dashboard only. */
  list(options: RequestOptions = {}): Promise<Result<ApiKey[]>> {
    return this.http.call({ method: 'GET', path: '/api-keys', ...options });
  }
}

export class Automations {
  constructor(private readonly http: HttpClient) {}

  /** Start a Live automation with a `manual` trigger for one contact. */
  enroll(automationId: string, email: string, options: RequestOptions = {}): Promise<Result<Record<string, unknown>>> {
    return this.http.call({ method: 'POST', path: `/automations/${seg(automationId)}/enrollments`, body: { email }, ...options });
  }
}

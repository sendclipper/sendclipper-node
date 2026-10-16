import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg } from '../core.js';
import type { CreateDomainParams, Domain, DomainRecords, DomainRegion } from '../types.js';

export class Domains {
  constructor(private readonly http: HttpClient) {}

  list(options: RequestOptions = {}): Promise<Result<Domain[]>> {
    return this.http.call({ method: 'GET', path: '/domains', ...options });
  }

  /** Register a sending domain. Next: `records()`, publish them, then `verify()`. */
  create(params: CreateDomainParams, options: RequestOptions = {}): Promise<Result<Domain>> {
    return this.http.call({ method: 'POST', path: '/domains', body: params, ...options });
  }

  /** The DNS records to publish, each with its current status. */
  records(id: string, options: RequestOptions = {}): Promise<Result<DomainRecords>> {
    return this.http.call({ method: 'GET', path: `/domains/${seg(id)}/records`, ...options });
  }

  /** Check DNS now instead of waiting for the background check. */
  verify(id: string, options: RequestOptions = {}): Promise<Result<Domain>> {
    return this.http.call({ method: 'POST', path: `/domains/${seg(id)}/verify`, ...options });
  }

  /** Start receiving mail on this domain. Adds receiving records; never blocks sending. */
  enableReceiving(id: string, options: RequestOptions = {}): Promise<Result<Domain>> {
    return this.http.call({ method: 'POST', path: `/domains/${seg(id)}/receiving`, ...options });
  }

  disableReceiving(id: string, options: RequestOptions = {}): Promise<Result<Domain>> {
    return this.http.call({ method: 'DELETE', path: `/domains/${seg(id)}/receiving`, ...options });
  }

  /** Move a domain to another region. Refused (`region_immutable`) once it holds messages. */
  setRegion(id: string, region: DomainRegion, options: RequestOptions = {}): Promise<Result<Domain>> {
    return this.http.call({ method: 'PATCH', path: `/domains/${seg(id)}/region`, body: { region }, ...options });
  }

  /** What deleting the domain would take with it. */
  deletionPreview(id: string, options: RequestOptions = {}): Promise<Result<Record<string, unknown>>> {
    return this.http.call({ method: 'GET', path: `/domains/${seg(id)}/deletion`, ...options });
  }

  remove(id: string, options: RequestOptions = {}): Promise<Result<void>> {
    return this.http.call({ method: 'DELETE', path: `/domains/${seg(id)}`, ...options });
  }
}

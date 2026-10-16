import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg, unwrap } from '../core.js';
import type {
  Audience,
  Contact,
  ContactList,
  CreateContactParams,
  ImportContactsParams,
  ListContactsParams,
  ListSuppressionsParams,
  Suppression,
  SuppressionList,
} from '../types.js';

export class Contacts {
  constructor(private readonly http: HttpClient) {}

  list(params: ListContactsParams = {}, options: RequestOptions = {}): Promise<Result<ContactList>> {
    return this.http.call({ method: 'GET', path: '/contacts', query: { ...params }, ...options });
  }

  async *iterate(params: Omit<ListContactsParams, 'page'> = {}, options: RequestOptions = {}): AsyncGenerator<Contact> {
    const pageSize = params.pageSize ?? 200;
    for (let page = 1; ; page++) {
      const res = unwrap(await this.list({ ...params, page, pageSize }, options));
      yield* res.items;
      if (page >= res.totalPages || res.items.length === 0) return;
    }
  }

  create(params: CreateContactParams, options: RequestOptions = {}): Promise<Result<Contact>> {
    return this.http.call({ method: 'POST', path: '/contacts', body: params, ...options });
  }

  /** Import a CSV or vCard file. Importing never suppresses anyone. */
  import(params: ImportContactsParams, options: RequestOptions = {}): Promise<Result<Record<string, unknown>>> {
    return this.http.call({ method: 'POST', path: '/contacts/import', form: importForm(params), ...options });
  }

  /** What an import would do, without importing. */
  importPreview(
    params: Pick<ImportContactsParams, 'file' | 'filename'>,
    options: RequestOptions = {},
  ): Promise<Result<Record<string, unknown>>> {
    return this.http.call({ method: 'POST', path: '/contacts/import/preview', form: importForm(params), ...options });
  }

  /** Every contact as CSV (re-importable) or vCard 4.0. */
  export(
    params: { format?: 'csv' | 'vcf'; audience?: string } = {},
    options: RequestOptions = {},
  ): Promise<Result<string>> {
    return this.http.call({ method: 'GET', path: '/contacts/export', query: { ...params }, as: 'text', ...options });
  }
}

export class Audiences {
  constructor(private readonly http: HttpClient) {}

  list(options: RequestOptions = {}): Promise<Result<{ audiences: Audience[]; totalContacts: number }>> {
    return this.http.call({ method: 'GET', path: '/audiences', ...options });
  }
}

export class Suppressions {
  constructor(private readonly http: HttpClient) {}

  list(params: ListSuppressionsParams = {}, options: RequestOptions = {}): Promise<Result<SuppressionList>> {
    return this.http.call({ method: 'GET', path: '/suppressions', query: { ...params }, ...options });
  }

  async *iterate(params: Omit<ListSuppressionsParams, 'cursor'> = {}, options: RequestOptions = {}): AsyncGenerator<Suppression> {
    let cursor: string | undefined;
    for (;;) {
      const res = unwrap(await this.list({ ...params, cursor }, options));
      yield* res.data;
      if (!res.page.hasMore || !res.page.cursor) return;
      cursor = res.page.cursor;
    }
  }

  /**
   * Stop all mail to an address (reason `manual`). `created` is `false` when
   * the address was already suppressed; `row` is the entry either way.
   */
  create(
    params: { email: string; note?: string },
    options: RequestOptions = {},
  ): Promise<Result<{ created: boolean; row: Suppression | null }>> {
    return this.http.call({ method: 'POST', path: '/suppressions', body: params, ...options });
  }

  /**
   * Lift a suppression. `reason` (10+ characters) is recorded. Complaint and
   * provider suppressions cannot be removed (`suppression_not_removable`).
   */
  remove(id: string, reason: string, options: RequestOptions = {}): Promise<Result<Record<string, unknown>>> {
    return this.http.call({ method: 'DELETE', path: `/suppressions/${seg(id)}`, body: { reason }, ...options });
  }

  /** The list as CSV. */
  export(params: Omit<ListSuppressionsParams, 'cursor' | 'limit'> = {}, options: RequestOptions = {}): Promise<Result<string>> {
    return this.http.call({ method: 'GET', path: '/suppressions/export', query: { ...params }, as: 'text', ...options });
  }
}

function importForm(params: Pick<ImportContactsParams, 'file' | 'filename'> & Partial<ImportContactsParams>): FormData {
  const form = new FormData();
  const name = params.filename ?? 'contacts.csv';
  const type = /\.vcf$/i.test(name) ? 'text/vcard' : 'text/csv';
  const bytes = typeof params.file === 'string' ? params.file : new Uint8Array(params.file);
  form.append('file', new Blob([bytes], { type }), name);
  if (params.audienceId) form.append('audienceId', params.audienceId);
  if (params.newAudience) form.append('newAudience', params.newAudience);
  if (params.createAudiences !== undefined) form.append('createAudiences', String(params.createAudiences));
  if (params.onDuplicate) form.append('onDuplicate', params.onDuplicate);
  if (params.mapping) form.append('mapping', JSON.stringify(params.mapping));
  return form;
}

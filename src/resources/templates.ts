import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg } from '../core.js';
import type {
  CreateTemplateParams,
  ListTemplatesParams,
  TagColor,
  Template,
  TemplateAsset,
  TemplatePreview,
  TemplateSummary,
  TemplateTag,
  TemplateVariables,
  UpdateTemplateParams,
  UploadTemplateAssetParams,
} from '../types.js';

export class TemplateTags {
  constructor(private readonly http: HttpClient) {}

  list(options: RequestOptions = {}): Promise<Result<Array<TemplateTag & { templateCount?: number }>>> {
    return this.http.call({ method: 'GET', path: '/templates/tags', ...options });
  }

  create(params: { name: string; color: TagColor }, options: RequestOptions = {}): Promise<Result<TemplateTag>> {
    return this.http.call({ method: 'POST', path: '/templates/tags', body: params, ...options });
  }

  update(id: string, params: { name?: string; color?: TagColor }, options: RequestOptions = {}): Promise<Result<TemplateTag>> {
    return this.http.call({ method: 'PATCH', path: `/templates/tags/${seg(id)}`, body: params, ...options });
  }

  remove(id: string, options: RequestOptions = {}): Promise<Result<{ deleted: boolean; templateCount: number }>> {
    return this.http.call({ method: 'DELETE', path: `/templates/tags/${seg(id)}`, ...options });
  }
}

export class TemplateAssets {
  constructor(private readonly http: HttpClient) {}

  list(options: RequestOptions = {}): Promise<Result<TemplateAsset[]>> {
    return this.http.call({ method: 'GET', path: '/templates/assets', ...options });
  }

  /** Upload an image a template can show. Returns its public URL. */
  upload(params: UploadTemplateAssetParams, options: RequestOptions = {}): Promise<Result<TemplateAsset>> {
    const base64 =
      typeof params.data === 'string' ? params.data : Buffer.from(params.data).toString('base64');
    return this.http.call({
      method: 'POST',
      path: '/templates/assets',
      body: { mimeType: params.mimeType, base64, ...(params.name ? { name: params.name } : {}) },
      ...options,
    });
  }
}

export class Templates {
  readonly tags: TemplateTags;
  readonly assets: TemplateAssets;

  constructor(private readonly http: HttpClient) {
    this.tags = new TemplateTags(http);
    this.assets = new TemplateAssets(http);
  }

  list(params: ListTemplatesParams = {}, options: RequestOptions = {}): Promise<Result<TemplateSummary[]>> {
    return this.http.call({ method: 'GET', path: '/templates', query: { ...params }, ...options });
  }

  /** By uuid or public id (`tpl_…`). */
  get(id: string, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'GET', path: `/templates/${seg(id)}`, ...options });
  }

  /** The rendered HTML, tags left in place. */
  html(id: string, options: RequestOptions = {}): Promise<Result<string>> {
    return this.http.call({ method: 'GET', path: `/templates/${seg(id)}/html`, as: 'text', ...options });
  }

  /** A new draft. Publish it before sending with it. */
  create(params: CreateTemplateParams = {}, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'POST', path: '/templates', body: params, ...options });
  }

  update(id: string, params: UpdateTemplateParams, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'PATCH', path: `/templates/${seg(id)}`, body: params, ...options });
  }

  remove(id: string, options: RequestOptions = {}): Promise<Result<void>> {
    return this.http.call({ method: 'DELETE', path: `/templates/${seg(id)}`, ...options });
  }

  duplicate(id: string, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'POST', path: `/templates/${seg(id)}/duplicate`, ...options });
  }

  publish(id: string, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'POST', path: `/templates/${seg(id)}/publish`, ...options });
  }

  unpublish(id: string, options: RequestOptions = {}): Promise<Result<Template>> {
    return this.http.call({ method: 'POST', path: `/templates/${seg(id)}/unpublish`, ...options });
  }

  /** Render with `variables` without sending anything. */
  preview(id: string, variables: TemplateVariables = {}, options: RequestOptions = {}): Promise<Result<TemplatePreview>> {
    return this.http.call({ method: 'POST', path: `/templates/${seg(id)}/preview`, body: { variables }, ...options });
  }

  /** Replace the template's tags with these tag ids. */
  setTags(id: string, tagIds: string[], options: RequestOptions = {}): Promise<Result<{ tags: TemplateTag[] }>> {
    return this.http.call({ method: 'PUT', path: `/templates/${seg(id)}/tags`, body: { tagIds }, ...options });
  }

  /** The projects (domains) templates can belong to. */
  projects(options: RequestOptions = {}): Promise<Result<Array<{ id: string; name: string }>>> {
    return this.http.call({ method: 'GET', path: '/templates/projects', ...options });
  }
}

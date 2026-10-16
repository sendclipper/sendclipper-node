/**
 * `react` support, the way Resend does it: render a React Email component to
 * HTML (and a plain-text alternative) with `@react-email/render`, an OPTIONAL
 * peer dependency loaded only when a message actually carries `react`.
 */

/** A React element. Typed loosely so the SDK needs no React types. */
export type ReactNodeLike = unknown;

interface RenderModule {
  render(node: ReactNodeLike, options?: { plainText?: boolean }): Promise<string> | string;
}

let cached: Promise<RenderModule> | undefined;

function loadRenderer(): Promise<RenderModule> {
  // A variable specifier keeps bundlers and tsc from resolving the module
  // when nobody uses `react`.
  const specifier = '@react-email/render';
  cached ??= (import(specifier) as Promise<RenderModule>).catch((err: unknown) => {
    cached = undefined;
    throw new Error(
      'Sending with `react` needs @react-email/render. Install it: npm i @react-email/render ' +
        `(${(err as Error).message})`,
    );
  });
  return cached;
}

/** Replace `react` with the `html` (and, if absent, `text`) it renders to. */
export async function withRenderedReact<T extends { react?: ReactNodeLike; html?: string; text?: string }>(
  params: T,
): Promise<Omit<T, 'react'>> {
  if (params.react === undefined || params.react === null) return params;
  const { react, ...rest } = params;
  const { render } = await loadRenderer();
  const html = await render(react);
  const text = rest.text ?? (await render(react, { plainText: true }));
  return { ...rest, html, text } as Omit<T, 'react'>;
}

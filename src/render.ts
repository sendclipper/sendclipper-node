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
  // Keep bundlers and tsc from resolving the module when nobody uses
  // `react`. A constant variable is not enough: Next.js's Turbopack follows
  // it and fails the whole build when the package is absent (0.2.0, found
  // building a Next 16 app). The specifier is built at run time AND the
  // import carries both bundlers' ignore hints.
  const specifier = ['@react-email', 'render'].join('/');
  cached ??= (
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier) as Promise<RenderModule>
  ).catch((err: unknown) => {
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

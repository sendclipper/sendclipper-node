import type { EmailAttachment } from './types.js';

function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The wire form of `attachments`: every `content` as base64. A string is
 * taken to be base64 already and passed through untouched.
 */
export function withEncodedAttachments<T extends { attachments?: EmailAttachment[] }>(params: T): T {
  if (!params.attachments?.length) return params;
  return {
    ...params,
    attachments: params.attachments.map((a) => ({
      ...a,
      content: typeof a.content === 'string' ? a.content : toBase64(a.content),
    })),
  };
}

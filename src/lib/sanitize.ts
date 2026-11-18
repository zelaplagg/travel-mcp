/**
 * Text that comes from OpenStreetMap is edited by anyone, so it is untrusted input that ends up in
 * an LLM's context. This removes the ways of hiding text (control, zero-width, bidi override and
 * Unicode "tag" characters) and caps the length so a name cannot carry a long payload.
 *
 * It does not and cannot recognise instructions written in plain, visible words. Clients and models
 * must still treat tool output as data, not as instructions.
 */

const CONTROL = /\p{Cc}/gu; // includes newlines and tabs: replaced by a space
const INVISIBLE = /[\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu; // format (zero-width, bidi, U+E0000 tags), private use, unassigned, surrogates

export function cleanText(value: string, maxLength = 200): string {
  const collapsed = value.replace(CONTROL, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  const characters = [...collapsed]; // by code point, so a surrogate pair is never cut in half
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join('')}…` : collapsed;
}

/** Returns the link unchanged if it is a plain http(s) URL; anything else (javascript:, data:, text) is dropped. */
export function safeHttpUrl(value: string | undefined, maxLength = 300): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength || /[\s\p{Cc}\p{Cf}]/u.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

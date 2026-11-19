/**
 * Parse a service-account JSON key stored inline in an env var
 * (e.g. GOOGLE_APPLICATION_CREDENTIALS on Vercel or in .env.local).
 *
 * Quoted .env values have their `\n` escapes expanded into real newlines,
 * which makes the private_key string invalid JSON. Re-escape and retry.
 *
 * Returns null when the value is not inline JSON (e.g. a key file path),
 * so callers can fall back to ADC. Never include the raw value in errors:
 * it is a secret.
 */
export function parseInlineServiceAccount(raw: string | undefined): object | null {
  const value = raw?.trim();
  if (!value || !value.startsWith('{')) return null;

  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(value.replace(/\r?\n/g, '\\n'));
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS looks like inline JSON but could not be parsed');
    }
  }
}

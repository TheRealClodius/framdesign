/**
 * Read integer env at runtime (avoids Next.js inlining `process.env.FOO` at build time).
 */
export function readEnvInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * URL deep-link helpers for shareable entry points (?q=, ?query=, ?project=).
 * Pure parsing lives here; UI applies only when there is no saved conversation.
 */

import { PROJECTS, PROJECT_ENTITY_MAP } from "@/lib/project-config";

export const DEEP_LINK_PARAM_Q = "q";
export const DEEP_LINK_PARAM_QUERY = "query";
export const DEEP_LINK_PARAM_PROJECT = "project";

/** Keys removed from the address bar after applying (keeps shared links clean on refresh). */
export const DEEP_LINK_URL_KEYS = [
  DEEP_LINK_PARAM_Q,
  DEEP_LINK_PARAM_QUERY,
  DEEP_LINK_PARAM_PROJECT,
] as const;

const MAX_DEEP_LINK_CHARS = 4000;

/** Which deep-link param drove the visit (for analytics). */
export function getDeepLinkKind(
  searchParams: URLSearchParams
): "q" | "project" | null {
  const q = (
    searchParams.get(DEEP_LINK_PARAM_Q) ??
    searchParams.get(DEEP_LINK_PARAM_QUERY)
  )?.trim();
  if (q) return "q";
  if (searchParams.get(DEEP_LINK_PARAM_PROJECT)?.trim()) return "project";
  return null;
}

/**
 * Build a shareable URL to reopen this page with the same prompt prefilled (`?q=`).
 * Strips any existing deep-link params first to avoid duplicates.
 */
export function buildChatSharePageUrl(
  currentHref: string,
  prompt: string
): string {
  const u = new URL(currentHref);
  for (const key of DEEP_LINK_URL_KEYS) {
    u.searchParams.delete(key);
  }
  const slice = prompt.trim().slice(0, MAX_DEEP_LINK_CHARS);
  if (slice) {
    u.searchParams.set(DEEP_LINK_PARAM_Q, slice);
  }
  return u.toString();
}

/**
 * `q` / `query` wins over `project` when both are present.
 */
export function parseDeepLinkFromSearchParams(
  searchParams: URLSearchParams
): string | null {
  const qRaw = searchParams.get(DEEP_LINK_PARAM_Q);
  const queryRaw = searchParams.get(DEEP_LINK_PARAM_QUERY);
  const q = (qRaw ?? queryRaw)?.trim();
  if (q) {
    return clampText(safeDecode(q));
  }
  const projectRaw = searchParams.get(DEEP_LINK_PARAM_PROJECT)?.trim();
  if (projectRaw) {
    const prompt = resolveProjectDeepLink(projectRaw);
    return prompt ? clampText(prompt) : null;
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function clampText(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (t.length > MAX_DEEP_LINK_CHARS) {
    return t.slice(0, MAX_DEEP_LINK_CHARS);
  }
  return t;
}

/**
 * Resolve `project` param to a starter message: display name (any case),
 * full entity id (`project:urbanair`), or slug (`urbanair`).
 */
export function resolveProjectDeepLink(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;

  for (const p of PROJECTS) {
    if (p.toLowerCase() === v) {
      return `Tell me about ${p}`;
    }
  }

  const withPrefix = v.startsWith("project:") ? v : `project:${v}`;
  for (const [display, id] of Object.entries(PROJECT_ENTITY_MAP)) {
    if (id.toLowerCase() === withPrefix) {
      return `Tell me about ${display}`;
    }
  }

  for (const [display, id] of Object.entries(PROJECT_ENTITY_MAP)) {
    const slug = id.replace(/^project:/i, "").toLowerCase();
    if (slug === v) {
      return `Tell me about ${display}`;
    }
  }

  return null;
}

export function stripDeepLinkParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of DEEP_LINK_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  }
}

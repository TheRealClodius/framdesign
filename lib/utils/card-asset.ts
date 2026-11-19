/**
 * Parsing and rendering for the `[viewing: ...]` marker the client appends to a
 * user message when a project card is clicked. The marker is user-controlled
 * input, so every field is validated before it reaches the prompt or the
 * streamed markdown/HTML.
 */

export interface CardViewingContext {
  assetId: string;
  blobId: string;
  ext: string;
  desc: string;
}

const VIEWING_MARKER =
  /\s*\[viewing:\s*asset_id=([^,]+),\s*blob_id=([^,]+),\s*ext=([^,]+),\s*desc="([^"]+)"\]/;

const ASSET_ID = /^asset:[a-z0-9_-]{1,128}$/i;
// Path segments of letters, digits, `_` and `-`, separated by single slashes (no `..`, no leading slash)
const BLOB_ID = /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i;
const VIDEO_EXTS = new Set(["mov", "mp4", "webm"]);
const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", ...VIDEO_EXTS]);
const MAX_DESC = 300;

/** True for a KB blob id such as `vector/vector-watch-luna` (no traversal, no leading slash). */
export function isValidBlobId(blobId: unknown): blobId is string {
  return typeof blobId === "string" && blobId.length <= 256 && BLOB_ID.test(blobId);
}

/** True for an image/video extension the KB actually serves. */
export function isAllowedAssetExtension(ext: unknown): ext is string {
  return typeof ext === "string" && ALLOWED_EXTS.has(ext.toLowerCase());
}

/** Strip characters that could break out of markdown alt text, emphasis, or HTML. */
function sanitizeDesc(raw: string): string {
  return raw
    .replace(/[<>"'`[\]()*_\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DESC);
}

/**
 * Extract and validate a viewing marker. Returns the content with the marker
 * removed, and the context only when every field passes validation.
 */
export function extractCardViewingContext(content: string): {
  content: string;
  context: CardViewingContext | null;
} {
  const match = content.match(VIEWING_MARKER);
  if (!match) return { content, context: null };

  const stripped = content.replace(match[0], "");
  const [, assetId, blobId, rawExt, rawDesc] = match.map((s) => s?.trim() ?? "");
  const ext = rawExt.toLowerCase();
  const desc = sanitizeDesc(rawDesc);

  if (!ASSET_ID.test(assetId) || !isValidBlobId(blobId) || !isAllowedAssetExtension(ext) || !desc) {
    return { content: stripped, context: null };
  }
  return { content: stripped, context: { assetId, blobId, ext, desc } };
}

/** Markdown (or a `<video>` block) that shows the clicked card's asset above the reply. */
export function buildCardAssetMarkdown(ctx: CardViewingContext): string {
  const assetRef = `/kb-assets/${ctx.blobId}.${ctx.ext}`;
  if (VIDEO_EXTS.has(ctx.ext)) {
    const mime = ctx.ext === "mov" ? "quicktime" : ctx.ext;
    return `<video controls><source src="${assetRef}" type="video/${mime}">Your browser does not support the video tag.</video>\n\n*${ctx.desc}*\n\n`;
  }
  return `![${ctx.desc}](${assetRef})\n\n`;
}

/**
 * Shared helpers for building stable asset references.
 *
 * Tool handlers emit short /kb-assets/ paths instead of signed GCS URLs.
 * The client resolves these to signed URLs at render time.
 */

/**
 * Build a stable asset reference path: /kb-assets/{blobId}.{extension}
 */
export function buildStableAssetRef(blobId, extension) {
  return `/kb-assets/${blobId}.${extension}`;
}

/**
 * Build markdown for an asset (image or video) using a stable reference.
 */
export function buildAssetMarkdown(entityType, blobId, extension, caption) {
  const ref = buildStableAssetRef(blobId, extension);

  if (entityType === 'video' || ['mov', 'mp4', 'webm'].includes(extension)) {
    const type = extension === 'mov' ? 'quicktime' : extension;
    return `<video controls><source src="${ref}" type="video/${type}">Your browser does not support the video tag.</video>\n\n${caption ? `*${caption}*` : ''}`;
  }

  return `![${caption}](${ref})`;
}

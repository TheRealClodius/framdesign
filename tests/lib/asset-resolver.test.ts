/**
 * Tests for client-side asset resolver
 *
 * Verifies stable /kb-assets/ ref resolution, caching, and fallback behavior.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the asset-url module
const mockRefreshAssetUrl = jest.fn<(blobId: string, ext: string) => Promise<string | null>>();
const mockParseAssetUrl = jest.fn<(input: string) => { blobId: string; extension: string } | null>();

jest.mock('@/lib/utils/asset-url', () => ({
  parseAssetUrl: (...args: Parameters<typeof mockParseAssetUrl>) => mockParseAssetUrl(...args),
  refreshAssetUrl: (...args: Parameters<typeof mockRefreshAssetUrl>) => mockRefreshAssetUrl(...args),
}));

describe('asset-resolver', () => {
  let resolveAssetSrc: (src: string) => Promise<string>;
  let isStableAssetRef: (src: string) => boolean;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset module cache to clear the in-memory URL cache
    jest.resetModules();
    const mod = await import('@/lib/utils/asset-resolver');
    resolveAssetSrc = mod.resolveAssetSrc;
    isStableAssetRef = mod.isStableAssetRef;
  });

  describe('isStableAssetRef', () => {
    test('returns true for /kb-assets/ paths', () => {
      expect(isStableAssetRef('/kb-assets/photo.png')).toBe(true);
      expect(isStableAssetRef('/kb-assets/sub/dir/photo.png')).toBe(true);
    });

    test('returns false for HTTP URLs', () => {
      expect(isStableAssetRef('https://storage.googleapis.com/bucket/photo.png')).toBe(false);
      expect(isStableAssetRef('http://example.com/kb-assets/photo.png')).toBe(false);
    });

    test('returns false for empty/falsy values', () => {
      expect(isStableAssetRef('')).toBe(false);
    });
  });

  describe('resolveAssetSrc', () => {
    test('passes through HTTP URLs unchanged', async () => {
      const url = 'https://storage.googleapis.com/bucket/assets/photo.png?signed=abc';
      const result = await resolveAssetSrc(url);
      expect(result).toBe(url);
      expect(mockRefreshAssetUrl).not.toHaveBeenCalled();
    });

    test('resolves /kb-assets/ ref to signed URL', async () => {
      const signedUrl = 'https://storage.googleapis.com/bucket/assets/photo.png?X-Goog-Signature=abc';
      mockParseAssetUrl.mockReturnValue({ blobId: 'photo', extension: 'png' });
      mockRefreshAssetUrl.mockResolvedValue(signedUrl);

      const result = await resolveAssetSrc('/kb-assets/photo.png');
      expect(result).toBe(signedUrl);
      expect(mockParseAssetUrl).toHaveBeenCalledWith('/kb-assets/photo.png');
      expect(mockRefreshAssetUrl).toHaveBeenCalledWith('photo', 'png');
    });

    test('returns original src when resolution fails', async () => {
      mockParseAssetUrl.mockReturnValue({ blobId: 'photo', extension: 'png' });
      mockRefreshAssetUrl.mockResolvedValue(null);

      const result = await resolveAssetSrc('/kb-assets/photo.png');
      expect(result).toBe('/kb-assets/photo.png');
    });

    test('returns original src when parseAssetUrl returns null', async () => {
      mockParseAssetUrl.mockReturnValue(null);

      const result = await resolveAssetSrc('/kb-assets/invalid');
      expect(result).toBe('/kb-assets/invalid');
      expect(mockRefreshAssetUrl).not.toHaveBeenCalled();
    });

    test('caches resolved URL and returns from cache', async () => {
      const signedUrl = 'https://storage.googleapis.com/signed';
      mockParseAssetUrl.mockReturnValue({ blobId: 'photo', extension: 'png' });
      mockRefreshAssetUrl.mockResolvedValue(signedUrl);

      // First call — resolves via API
      const result1 = await resolveAssetSrc('/kb-assets/photo.png');
      expect(result1).toBe(signedUrl);
      expect(mockRefreshAssetUrl).toHaveBeenCalledTimes(1);

      // Second call — should hit cache
      const result2 = await resolveAssetSrc('/kb-assets/photo.png');
      expect(result2).toBe(signedUrl);
      expect(mockRefreshAssetUrl).toHaveBeenCalledTimes(1); // Still 1
    });

    test('passes through empty strings', async () => {
      const result = await resolveAssetSrc('');
      expect(result).toBe('');
    });

    test('passes through non-asset paths', async () => {
      const result = await resolveAssetSrc('/some/other/path.png');
      expect(result).toBe('/some/other/path.png');
    });
  });
});

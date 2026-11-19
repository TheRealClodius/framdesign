import { describe, test, expect } from '@jest/globals';
import {
  extractCardViewingContext,
  buildCardAssetMarkdown,
  isValidBlobId,
  isAllowedAssetExtension,
} from '@/lib/utils/card-asset';

const marker = (blob: string, ext: string, desc: string, asset = 'asset:vector_watch_luna_001') =>
  `Tell me about this [viewing: asset_id=${asset}, blob_id=${blob}, ext=${ext}, desc="${desc}"]`;

describe('card-asset', () => {
  describe('extractCardViewingContext', () => {
    test('parses a genuine card click and strips the marker', () => {
      const { content, context } = extractCardViewingContext(
        marker('vector/vector-watch-luna', 'jpeg', 'Vector Watch Luna')
      );
      expect(content).toBe('Tell me about this');
      expect(context).toEqual({
        assetId: 'asset:vector_watch_luna_001',
        blobId: 'vector/vector-watch-luna',
        ext: 'jpeg',
        desc: 'Vector Watch Luna',
      });
    });

    test.each([
      ['path traversal', marker('../secrets/key', 'png', 'x')],
      ['leading slash', marker('/internal/usage', 'png', 'x')],
      ['attribute injection in blob_id', marker('a" onerror="alert(1)', 'png', 'x')],
      ['non-media extension', marker('vector/a', 'json', 'x')],
      ['html in extension', marker('vector/a', 'mp4"><script>', 'x')],
      ['bad asset id', marker('vector/a', 'png', 'x', 'asset:<b>')],
    ])('rejects %s but still strips the marker', (_label, input) => {
      const { content, context } = extractCardViewingContext(input);
      expect(context).toBeNull();
      expect(content).not.toContain('[viewing:');
    });

    test('neutralises markup in the description', () => {
      const { context } = extractCardViewingContext(
        marker('vector/a', 'mov', '<img src=x onerror=alert(1)>](javascript:alert(1))')
      );
      expect(context?.desc).not.toMatch(/[<>()[\]]/);
      const out = buildCardAssetMarkdown(context!);
      expect(out).not.toContain('<img');
      expect(out).not.toContain('](javascript');
    });
  });

  describe('buildCardAssetMarkdown', () => {
    test('renders images as markdown and videos as a video block', () => {
      expect(buildCardAssetMarkdown({ assetId: 'asset:a', blobId: 'p/a', ext: 'png', desc: 'A' })).toBe(
        '![A](/kb-assets/p/a.png)\n\n'
      );
      expect(buildCardAssetMarkdown({ assetId: 'asset:a', blobId: 'p/a', ext: 'mov', desc: 'A' })).toContain(
        'type="video/quicktime"'
      );
    });
  });

  test('validators', () => {
    expect(isValidBlobId('andrei-clodius/photo_of_andrei')).toBe(true);
    expect(isValidBlobId('a//b')).toBe(false);
    expect(isValidBlobId(42)).toBe(false);
    expect(isAllowedAssetExtension('JPEG')).toBe(true);
    expect(isAllowedAssetExtension('svg')).toBe(false);
  });
});

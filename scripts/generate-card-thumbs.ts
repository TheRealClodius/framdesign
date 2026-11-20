/**
 * Generate small "card" versions of every KB asset and upload them to GCS.
 *
 * The chat's empty-state collage shows assets at ~180×135 px, but used to load
 * the originals (avg 2 MB, up to 36 MB; .mov videos Chrome often can't play).
 * This writes, next to the originals:
 *   assets/thumbs/<blob_id>.webp  480 px wide still (images, GIF first frame, video poster)
 *   assets/thumbs/<blob_id>.mp4   480 px H.264, muted, ≤6 s (videos and GIFs only)
 *
 * Usage:
 *   npx tsx scripts/generate-card-thumbs.ts            # only assets missing a thumb
 *   npx tsx scripts/generate-card-thumbs.ts --force    # regenerate all
 *   npx tsx scripts/generate-card-thumbs.ts --dry-run  # list what would be done
 *
 * Needs ffmpeg on PATH and GCS credentials in .env (same as upload-asset.ts).
 */

import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseInlineServiceAccount } from '../lib/utils/gcp-credentials';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const THUMB_WIDTH = 480;
const VIDEO_SECONDS = 6;
const VIDEO_EXTS = new Set(['mov', 'mp4', 'webm']);
const MOTION_EXTS = new Set([...VIDEO_EXTS, 'gif']);
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

interface ManifestAsset {
  blob_id?: string;
  file_extension?: string;
}

function storageClient(): Storage {
  const projectId = process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT;
  if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
    const credentials = JSON.parse(Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, 'base64').toString());
    return new Storage({ projectId, credentials });
  }
  const inline = parseInlineServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  return new Storage(inline ? { projectId, credentials: inline } : { projectId });
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

async function main() {
  const manifestPath = path.resolve(__dirname, '..', 'kb', 'assets', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { assets: ManifestAsset[] };
  const assets = manifest.assets.filter(
    (a): a is Required<ManifestAsset> => Boolean(a.blob_id && a.file_extension)
  );

  const bucket = storageClient().bucket(process.env.GCS_BUCKET_NAME || 'framdesign-assets');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'card-thumbs-'));
  let made = 0, skipped = 0, failed = 0, bytesIn = 0, bytesOut = 0;

  for (const asset of assets) {
    const ext = asset.file_extension.toLowerCase();
    const id = asset.blob_id;
    const stillName = `assets/thumbs/${id}.webp`;
    const clipName = `assets/thumbs/${id}.mp4`;
    const wantsClip = MOTION_EXTS.has(ext);

    if (!force) {
      const [stillExists] = await bucket.file(stillName).exists();
      const [clipExists] = wantsClip ? await bucket.file(clipName).exists() : [true];
      if (stillExists && clipExists) { skipped++; continue; }
    }
    if (dryRun) { console.log(`would make ${stillName}${wantsClip ? ' + .mp4' : ''}`); made++; continue; }

    try {
      const src = path.join(work, `src.${ext}`);
      await bucket.file(`assets/${id}.${ext}`).download({ destination: src });
      bytesIn += fs.statSync(src).size;

      const still = path.join(work, 'still.webp');
      if (VIDEO_EXTS.has(ext)) {
        const frame = path.join(work, 'frame.png');
        ffmpeg(['-ss', '1', '-i', src, '-frames:v', '1', frame]);
        await sharp(frame).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(still);
      } else {
        await sharp(src, { animated: false }).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(still);
      }
      await bucket.upload(still, { destination: stillName, metadata: { contentType: 'image/webp', cacheControl: CACHE_CONTROL } });
      bytesOut += fs.statSync(still).size;

      if (wantsClip) {
        const clip = path.join(work, 'clip.mp4');
        ffmpeg([
          '-i', src, '-t', String(VIDEO_SECONDS), '-an',
          '-vf', `scale=${THUMB_WIDTH}:-2:flags=lanczos,fps=24,format=yuv420p`,
          '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', clip,
        ]);
        await bucket.upload(clip, { destination: clipName, metadata: { contentType: 'video/mp4', cacheControl: CACHE_CONTROL } });
        bytesOut += fs.statSync(clip).size;
      }

      made++;
      console.log(`✓ ${id}.${ext}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${id}.${ext}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  fs.rmSync(work, { recursive: true, force: true });
  const mb = (b: number) => (b / 1e6).toFixed(1);
  console.log(`\n${made} made, ${skipped} already had thumbs, ${failed} failed`);
  if (!dryRun && made) console.log(`originals ${mb(bytesIn)} MB → thumbs ${mb(bytesOut)} MB`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

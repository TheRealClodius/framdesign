import { jest, describe, test, expect, beforeEach } from '@jest/globals';

type SaveOpts = { preconditionOpts?: { ifGenerationMatch?: number } };

const getMetadata = jest.fn<() => Promise<[{ generation: string }]>>();
const download = jest.fn<() => Promise<[Buffer]>>();
const save = jest.fn<(data: string, opts: SaveOpts) => Promise<void>>();

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: () => ({
      file: () => ({ getMetadata, download, save }),
    }),
  })),
}));

function gcsError(code: number): Error {
  return Object.assign(new Error(`gcs ${code}`), { code });
}

async function loadService() {
  const { UsageService } = await import('@/lib/services/usage-service');
  return UsageService;
}

describe('UsageService (GCS ledger)', () => {
  beforeEach(() => {
    jest.resetModules();
    getMetadata.mockReset();
    download.mockReset();
    save.mockReset();
    process.env.USAGE_STORAGE = 'gcs';
    process.env.GCS_BUCKET_NAME = 'test-bucket';
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('a transient read failure never overwrites the ledger', async () => {
    getMetadata.mockRejectedValue(gcsError(503));
    const UsageService = await loadService();

    await UsageService.recordUsage('user-a', 100);

    expect(save).not.toHaveBeenCalled();
  });

  test('corrupt ledger JSON is not overwritten', async () => {
    getMetadata.mockResolvedValue([{ generation: '7' }]);
    download.mockResolvedValue([Buffer.from('{not json')]);
    const UsageService = await loadService();

    await UsageService.recordUsage('user-a', 100);

    expect(save).not.toHaveBeenCalled();
  });

  test('creates the ledger only if it still does not exist', async () => {
    getMetadata.mockRejectedValue(gcsError(404));
    save.mockResolvedValue(undefined);
    const UsageService = await loadService();

    const updated = await UsageService.recordUsage('user-a', 100);

    expect(updated.totalTokens).toBe(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].preconditionOpts).toEqual({ ifGenerationMatch: 0 });
  });

  test('preserves other users and retries on a concurrent write', async () => {
    const ledger = { 'user-b': { totalTokens: 50, lastUpdate: 'x' } };
    getMetadata
      .mockResolvedValueOnce([{ generation: '7' }])
      .mockResolvedValueOnce([{ generation: '8' }]);
    download.mockResolvedValue([Buffer.from(JSON.stringify(ledger))]);
    save.mockRejectedValueOnce(gcsError(412)).mockResolvedValueOnce(undefined);
    const UsageService = await loadService();

    await UsageService.recordUsage('user-a', 100);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].preconditionOpts).toEqual({ ifGenerationMatch: 8 });
    const written = JSON.parse(save.mock.calls[1][0]);
    expect(written['user-b'].totalTokens).toBe(50);
    expect(written['user-a'].totalTokens).toBe(100);
  });

  test('reads fail open so a storage blip does not block visitors', async () => {
    getMetadata.mockRejectedValue(gcsError(503));
    const UsageService = await loadService();

    expect(await UsageService.isOverBudget('user-a')).toBe(false);
  });
});

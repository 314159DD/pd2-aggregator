import type { Pool } from 'pg';
import type { Config } from '../config';
import { enrichRaw, InvalidCharacterPayload, toCompact } from '../core/compact';
import { upsertCharacter } from '../db/characters-repo';
import { UpstreamError, type Pd2Client } from '../upstream/pd2-client';
import type { CharQueue, QueueItem } from './queue';

export interface IngestDeps {
  pool: Pool;
  client: Pick<Pd2Client, 'character'>;
  queue: CharQueue;
  cfg: Pick<Config, 'currentSeason' | 'minLevel'>;
  now?: () => Date;
  onError?: (e: unknown, item: QueueItem) => void;
}

export type IngestResult = 'ingested' | 'skipped' | 'failed';

const MAX_ATTEMPTS = 2;

function skip(item: QueueItem, reason: string): IngestResult {
  console.debug(`ingest skip ${item.name}: ${reason}`);
  return 'skipped';
}

export async function ingestOne(deps: IngestDeps, item: QueueItem): Promise<IngestResult> {
  const { pool, client, queue, cfg } = deps;
  try {
    const raw = await client.character(item.name);
    if (!raw) return skip(item, 'no character (404)');
    let compact;
    try {
      compact = toCompact(raw, item.account);
    } catch (e) {
      if (e instanceof InvalidCharacterPayload) return skip(item, 'invalid payload');
      throw e;
    }
    if (!compact.isLadder) return skip(item, 'not ladder');
    if (compact.level < cfg.minLevel) return skip(item, `level ${compact.level} below ${cfg.minLevel}`);
    await upsertCharacter(
      pool,
      cfg.currentSeason,
      compact,
      enrichRaw(raw, item.account ?? compact.account ?? ''),
      deps.now?.(),
    );
    return 'ingested';
  } catch (e) {
    deps.onError?.(e, item);
    const attempts = (item.attempts ?? 0) + 1;
    if (e instanceof UpstreamError && e.retryable && attempts < MAX_ATTEMPTS) {
      queue.push({ ...item, attempts });
      return 'skipped';
    }
    return 'failed';
  }
}

import type { Pool } from 'pg';

export type CollectorStats = {
  requestsTotal: number;
  requestsLastHour: number;
  queueSize: number;
  ingestedLastHour: number;
  lastIngestAt: string | null;
  lastOnlineSweepAt: string | null;
  lastLadderPassAt: string | null;
  lastMarketPollAt: string | null;
  lastFullMarketSweepAt: string | null;
  errorsLastHour: number;
  seasonName: string | null;
};

export async function heartbeat(pool: Pool, stats: CollectorStats): Promise<void> {
  await pool.query('update collector_status set heartbeat_at = now(), stats = $1::jsonb where id = 1', [
    JSON.stringify(stats),
  ]);
}

export async function isPaused(pool: Pool): Promise<boolean> {
  const r = await pool.query('select paused from collector_control where id = 1');
  return r.rows[0]?.paused === true;
}

/** Accounts never checked, or last checked longer than cooldownMs ago. */
export async function accountsDue(
  pool: Pool,
  accounts: string[],
  now: Date,
  cooldownMs = 86_400_000,
): Promise<string[]> {
  if (!accounts.length) return [];
  const cutoff = new Date(now.getTime() - cooldownMs);
  const r = await pool.query(
    'select account from accounts_seen where account = any($1::text[]) and last_checked_at >= $2',
    [accounts, cutoff],
  );
  const fresh = new Set(r.rows.map((row) => String(row.account)));
  return accounts.filter((a) => !fresh.has(a));
}

export async function markAccountChecked(pool: Pool, account: string, now: Date): Promise<void> {
  await pool.query(
    `insert into accounts_seen (account, last_checked_at) values ($1, $2)
     on conflict (account) do update set last_checked_at = excluded.last_checked_at`,
    [account, now],
  );
}

export async function listPriorityAccounts(pool: Pool): Promise<string[]> {
  const r = await pool.query('select account from priority_accounts order by requested_at');
  return r.rows.map((row) => String(row.account));
}

export async function removePriorityAccount(pool: Pool, account: string): Promise<void> {
  await pool.query('delete from priority_accounts where account = $1', [account]);
}

export async function addPriorityAccount(pool: Pool, account: string, ip: string | null): Promise<void> {
  await pool.query(
    `insert into priority_accounts (account, requested_ip) values ($1, $2)
     on conflict (account) do nothing`,
    [account, ip],
  );
}

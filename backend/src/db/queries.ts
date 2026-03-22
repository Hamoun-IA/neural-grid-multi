import db from './database.js';

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmtInsertMetric = db.prepare(`
  INSERT INTO metrics_raw (server_id, ts, cpu_pct, ram_pct, disk_pct, load1, agent_count, agent_up)
  VALUES (@serverId, @ts, @cpu, @ram, @disk, @load1, @agentCount, @agentUp)
`);

const stmtGetRaw = db.prepare(`
  SELECT ts, cpu_pct AS cpu, ram_pct AS ram, disk_pct AS disk, load1, agent_count AS agentCount, agent_up AS agentUp
  FROM metrics_raw
  WHERE server_id = @serverId AND ts >= @sinceTs
  ORDER BY ts ASC
`);

const stmtGetHourly = db.prepare(`
  SELECT hour_ts AS ts, cpu_avg AS cpu, cpu_max, ram_avg AS ram, ram_max, disk_avg AS disk, load1_avg AS load1, agents_min AS agentCount
  FROM metrics_hourly
  WHERE server_id = @serverId AND hour_ts >= @sinceTs
  ORDER BY hour_ts ASC
`);

const stmtRunAggregation = db.prepare(`
  INSERT OR REPLACE INTO metrics_hourly
    (server_id, hour_ts, cpu_avg, cpu_max, ram_avg, ram_max, disk_avg, load1_avg, agents_min)
  SELECT
    server_id,
    (ts / 3600) * 3600 AS hour_ts,
    AVG(cpu_pct)       AS cpu_avg,
    MAX(cpu_pct)       AS cpu_max,
    AVG(ram_pct)       AS ram_avg,
    MAX(ram_pct)       AS ram_max,
    AVG(disk_pct)      AS disk_avg,
    AVG(load1)         AS load1_avg,
    MIN(agent_count)   AS agents_min
  FROM metrics_raw
  GROUP BY server_id, (ts / 3600) * 3600
`);

const stmtCleanupRaw = db.prepare(`
  DELETE FROM metrics_raw WHERE ts < @cutoff
`);

const stmtCleanupHourly = db.prepare(`
  DELETE FROM metrics_hourly WHERE hour_ts < @cutoff
`);

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function insertMetric(
  serverId: string,
  ts: number,
  cpu: number,
  ram: number,
  disk: number,
  load1: number,
  agentCount: number,
  agentUp: number,
): void {
  stmtInsertMetric.run({ serverId, ts, cpu, ram, disk, load1, agentCount, agentUp });
}

export interface RawMetricPoint {
  ts: number;
  cpu: number;
  ram: number;
  disk: number;
  load1: number;
  agentCount: number;
  agentUp: number;
}

export interface HourlyMetricPoint {
  ts: number;
  cpu: number;
  cpu_max: number;
  ram: number;
  ram_max: number;
  disk: number;
  load1: number;
  agentCount: number;
}

export function getMetricsRaw(serverId: string, sinceTs: number): RawMetricPoint[] {
  return stmtGetRaw.all({ serverId, sinceTs }) as RawMetricPoint[];
}

export function getMetricsHourly(serverId: string, sinceTs: number): HourlyMetricPoint[] {
  return stmtGetHourly.all({ serverId, sinceTs }) as HourlyMetricPoint[];
}

export function runAggregation(): void {
  stmtRunAggregation.run();
}

export function cleanupRaw(retentionSeconds = 86400): void {
  const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
  stmtCleanupRaw.run({ cutoff });
}

export function cleanupHourly(retentionSeconds = 7776000): void {
  const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
  stmtCleanupHourly.run({ cutoff });
}

export function runMaintenance(): void {
  try {
    runAggregation();
    cleanupRaw();
    cleanupHourly();
    console.log('[db] Maintenance done (aggregation + cleanup)');
  } catch (err) {
    console.error('[db] Maintenance error:', err);
  }
}

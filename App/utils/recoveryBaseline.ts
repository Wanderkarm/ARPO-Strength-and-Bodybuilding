/**
 * Recovery Intelligence — 7-day rolling baseline + personalised classification.
 *
 * Absolute thresholds (RHR ≤55 = good) are meaningless without personal context.
 * A 50-bpm athlete's 58-bpm reading is a fatigue signal; a chronic 65-bpm athlete's
 * 60-bpm is a *great* day. This module builds a personal rolling window and grades
 * every reading against that individual's own normal.
 *
 * Architecture:
 *   • addRecoverySnapshot(metrics)   — called after every health sync
 *   • getRecoveryHistory()           — full stored array
 *   • computeBaseline(history)       — 7-point rolling average
 *   • classifyRecovery(metrics, baseline, mesoWeek)  → RecoveryIntelligence
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RecoveryMetrics } from "@/lib/healthSync";

const HISTORY_KEY = "recovery_history";
const MAX_HISTORY  = 14;  // store 14 points, use last 7 for baseline

// ─── History persistence ──────────────────────────────────────────────────────

/** Append a new snapshot; trims to MAX_HISTORY. Silently no-ops on error. */
export async function addRecoverySnapshot(metrics: RecoveryMetrics): Promise<void> {
  // Only persist if we actually have at least one data point
  if (metrics.rhr === undefined && metrics.hrv === undefined && metrics.sleepHours === undefined) return;
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const history: RecoveryMetrics[] = raw ? JSON.parse(raw) : [];
    history.push(metrics);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch { /* silent */ }
}

export async function getRecoveryHistory(): Promise<RecoveryMetrics[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Baseline computation ─────────────────────────────────────────────────────

export interface Baseline {
  rhr?: number;
  hrv?: number;
  sleepHours?: number;
  /** How many of the last 7 snapshots contributed to this baseline */
  snapshotCount: number;
}

/** Rolling 7-point average. Requires ≥2 data points per metric to be meaningful. */
export function computeBaseline(history: RecoveryMetrics[]): Baseline {
  const last7 = history.slice(-7);

  function avg(vals: (number | undefined)[]): number | undefined {
    const valid = vals.filter((v): v is number => v !== undefined);
    return valid.length >= 2 ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined;
  }

  return {
    rhr:        avg(last7.map(h => h.rhr)),
    hrv:        avg(last7.map(h => h.hrv)),
    sleepHours: avg(last7.map(h => h.sleepHours)),
    snapshotCount: last7.length,
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

export type RecoveryStatus =
  | "primed"             // ≥ +10 % composite
  | "recovered"          // -10 to +10 %
  | "fatigued"           // -10 to -20 %
  | "accumulating"       // > -20 %  (deep fatigue)
  | "insufficient_data"; // < 3 snapshots

export interface RecoveryIntelligence {
  status: RecoveryStatus;
  hasBaseline: boolean;
  snapshotCount: number;
  /** Composite % deviation from personal baseline. + = above (good), - = below (bad) */
  overallDeviationPct?: number;
  /** Individual HRV deviation %, + = above baseline */
  hrvDeviationPct?: number;
  /** Individual RHR deviation %, + = below baseline (good — lower RHR) */
  rhrDeviationPct?: number;
  statusLabel: string;
  statusColor: string;
  /** One-line signal, e.g. "HRV 18% below your 7-day average" */
  trendCopy: string;
  /** Mesocycle-aware framing */
  contextCopy: string;
  /** Single actionable recommendation */
  actionCopy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deviationPct(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

const STATUS_META: Record<RecoveryStatus, { label: string; color: string }> = {
  primed:            { label: "Primed",       color: "#43A047" },
  recovered:         { label: "Recovered",    color: "#29B6F6" },
  fatigued:          { label: "Fatigued",     color: "#F59E0B" },
  accumulating:      { label: "Accumulating", color: "#E53935" },
  insufficient_data: { label: "Calibrating",  color: "#9E9E9E" },
};

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify a single recovery snapshot against a personal baseline,
 * with copy contextualised by the current mesocycle week.
 *
 * @param metrics    The latest synced recovery reading
 * @param baseline   Rolling 7-day average for this user
 * @param mesoWeek   1–4 (1=Accumulation, 2=Intensification, 3=Overreach, 4=Deload)
 */
export function classifyRecovery(
  metrics: RecoveryMetrics,
  baseline: Baseline,
  mesoWeek = 1,
): RecoveryIntelligence {
  // ── Insufficient baseline ────────────────────────────────────────────────────
  if (baseline.snapshotCount < 3 || (baseline.hrv === undefined && baseline.rhr === undefined)) {
    return {
      status: "insufficient_data",
      hasBaseline: false,
      snapshotCount: baseline.snapshotCount,
      statusLabel: "Calibrating",
      statusColor: STATUS_META.insufficient_data.color,
      trendCopy: `${baseline.snapshotCount}/3 readings logged so far.`,
      contextCopy: "Sync recovery data over the next few days and your personalised baseline will be ready.",
      actionCopy: "Daily syncs build your baseline faster — aim for one each morning.",
    };
  }

  // ── Compute deviations ───────────────────────────────────────────────────────
  let hrvDev: number | undefined;
  let rhrDev: number | undefined;

  if (metrics.hrv !== undefined && baseline.hrv !== undefined) {
    // HRV: higher = better → positive deviation = good
    hrvDev = deviationPct(metrics.hrv, baseline.hrv);
  }
  if (metrics.rhr !== undefined && baseline.rhr !== undefined) {
    // RHR: lower = better → invert so positive deviation = RHR below baseline (good)
    rhrDev = -deviationPct(metrics.rhr, baseline.rhr);
  }

  // Composite: HRV 60 %, RHR 40 % (HRV is the superior autonomic signal)
  let overallDev: number | undefined;
  if (hrvDev !== undefined && rhrDev !== undefined) {
    overallDev = hrvDev * 0.6 + rhrDev * 0.4;
  } else if (hrvDev !== undefined) {
    overallDev = hrvDev;
  } else if (rhrDev !== undefined) {
    overallDev = rhrDev;
  } else if (metrics.sleepHours !== undefined && baseline.sleepHours !== undefined) {
    // Fall back to sleep only when HRV/RHR are missing
    overallDev = deviationPct(metrics.sleepHours, baseline.sleepHours);
  }

  // ── Status classification ────────────────────────────────────────────────────
  let status: RecoveryStatus;
  if (overallDev === undefined) {
    status = "recovered";
  } else if (overallDev >= 10) {
    status = "primed";
  } else if (overallDev >= -10) {
    status = "recovered";
  } else if (overallDev >= -20) {
    status = "fatigued";
  } else {
    status = "accumulating";
  }

  const { label: statusLabel, color: statusColor } = STATUS_META[status];

  // ── Trend copy ───────────────────────────────────────────────────────────────
  let trendCopy: string;
  if (hrvDev !== undefined && baseline.hrv !== undefined) {
    const dir = hrvDev >= 0 ? "above" : "below";
    trendCopy = `HRV ${Math.abs(Math.round(hrvDev))}% ${dir} your 7-day average (${metrics.hrv} ms vs ${Math.round(baseline.hrv)} ms baseline).`;
  } else if (rhrDev !== undefined && baseline.rhr !== undefined) {
    const rhrDiff = metrics.rhr! - baseline.rhr;
    const dir = rhrDiff <= 0 ? "below" : "above";
    trendCopy = `RHR ${Math.abs(Math.round(rhrDiff))} bpm ${dir} your baseline (${metrics.rhr} vs ${Math.round(baseline.rhr)} bpm).`;
  } else if (metrics.sleepHours !== undefined && baseline.sleepHours !== undefined) {
    const diff = metrics.sleepHours - baseline.sleepHours;
    const dir = diff >= 0 ? "above" : "below";
    trendCopy = `Sleep ${Math.abs(Math.round(diff * 10) / 10)}h ${dir} your average (${metrics.sleepHours}h vs ${Math.round(baseline.sleepHours * 10) / 10}h).`;
  } else {
    trendCopy = "Recovery data recorded.";
  }

  // ── Context copy — mesocycle framing ─────────────────────────────────────────
  const daysToDeload = mesoWeek < 4 ? (4 - mesoWeek) * 7 : 0;
  let contextCopy: string;

  if (mesoWeek === 4) {
    contextCopy = "You're in deload week. Fatigue is dissipating — light loads are doing their job. Enjoy the recovery.";
  } else if (status === "primed") {
    contextCopy = `Week ${mesoWeek} and your autonomic system is firing. Optimal window to push intensity on today's session.`;
  } else if (status === "recovered") {
    contextCopy = `Week ${mesoWeek} — within normal training variation. Stay on plan.`;
  } else if (status === "fatigued") {
    if (mesoWeek === 3) {
      contextCopy = `Expected in Week 3 (Overreach phase). Deload in ~${daysToDeload} days will drive supercompensation — push through with planned loads.`;
    } else if (mesoWeek === 1) {
      contextCopy = "Fatigue this early in the mesocycle is an early-warning signal. Your last training block may not have fully cleared.";
    } else {
      contextCopy = `Week ${mesoWeek} accumulation — normal as volume builds. Monitor for two more sessions before adjusting.`;
    }
  } else {
    // accumulating
    if (mesoWeek === 3) {
      contextCopy = `Deep fatigue in Week 3 is expected and intentional — this is the overreach stimulus. Deload in ~${daysToDeload} days will produce your biggest strength jump.`;
    } else {
      contextCopy = `High fatigue in Week ${mesoWeek} is a clear signal. Reduce working sets by 1–2 today and protect sleep.`;
    }
  }

  // ── Action copy — single prioritised recommendation ───────────────────────
  let actionCopy: string;
  if (status === "primed") {
    actionCopy = "Chase your rep ceilings today — this is a peak-readiness day.";
  } else if (status === "recovered") {
    actionCopy = "Stick to the plan. Sleep 7–9 hrs and keep protein at ≥ 1.6 g/kg bodyweight.";
  } else if (status === "fatigued") {
    actionCopy = "Prioritise 8+ hrs sleep tonight. If soreness is high, drop one working set per exercise.";
  } else {
    actionCopy = "Consider swapping today for an active recovery session — light walk, mobility, and 9 hrs sleep over the next two nights.";
  }

  return {
    status,
    hasBaseline: true,
    snapshotCount: baseline.snapshotCount,
    overallDeviationPct: overallDev !== undefined ? Math.round(overallDev) : undefined,
    hrvDeviationPct:     hrvDev     !== undefined ? Math.round(hrvDev)     : undefined,
    rhrDeviationPct:     rhrDev     !== undefined ? Math.round(rhrDev)     : undefined,
    statusLabel,
    statusColor,
    trendCopy,
    contextCopy,
    actionCopy,
  };
}

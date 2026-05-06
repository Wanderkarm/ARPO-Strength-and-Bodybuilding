/**
 * Health platform sync — Apple Health (iOS) and Android Health Connect.
 *
 * Both platforms write smart-scale body fat % to Apple Health / Health Connect,
 * so syncing from there gives us data from Withings, Renpho, Garmin, etc. for free.
 *
 * Packages used:
 *   iOS    — @kingstinct/react-native-healthkit  v14
 *   Android — react-native-health-connect         v3
 *
 * These are native modules compiled via EAS Build / expo prebuild.
 * They are NOT available in Expo Go — use a development build.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logBodyWeight, logBodyMeasurements, updateDailySteps, hasTodayWeightLog } from "@/lib/local-db";

export interface SyncResult {
  weightSynced: boolean;
  bodyFatSynced: boolean;
  stepsSynced: boolean;
  weightKg?: number;
  bodyFatPct?: number;
  stepsCount?: number;
  syncedAt: string;
  error?: string;
}

export interface RecoveryMetrics {
  /** Resting heart rate in bpm */
  rhr?: number;
  /** Heart rate variability (SDNN) in ms */
  hrv?: number;
  /** Sleep duration last night in hours */
  sleepHours?: number;
  syncedAt: string;
}

const LAST_SYNC_KEY = "healthSyncLastAt";
const RECOVERY_CACHE_KEY = "recoveryMetricsCache";

export async function getCachedRecoveryMetrics(): Promise<RecoveryMetrics | null> {
  try {
    const raw = await AsyncStorage.getItem(RECOVERY_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function syncRecoveryMetrics(): Promise<RecoveryMetrics> {
  if (Platform.OS === "ios") return _syncRecoveryAppleHealth();
  if (Platform.OS === "android") return _syncRecoveryHealthConnect();
  return { syncedAt: new Date().toISOString() };
}

async function _syncRecoveryAppleHealth(): Promise<RecoveryMetrics> {
  const syncedAt = new Date().toISOString();
  try {
    const _hkModule = require("@kingstinct/react-native-healthkit");
    const HealthKit = _hkModule.default ?? _hkModule;

    await HealthKit.requestAuthorization({
      toRead: [
        "HKQuantityTypeIdentifierRestingHeartRate",
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "HKCategoryTypeIdentifierSleepAnalysis",
      ],
      toShare: [],
    });

    let rhr: number | undefined;
    let hrv: number | undefined;
    let sleepHours: number | undefined;

    // Resting heart rate
    const rhrSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierRestingHeartRate",
      "count/min"
    );
    if (rhrSample?.quantity > 0) {
      rhr = Math.round(rhrSample.quantity);
    }

    // HRV (SDNN)
    const hrvSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      "ms"
    );
    if (hrvSample?.quantity > 0) {
      hrv = Math.round(hrvSample.quantity);
    }

    // Sleep: window from 8 pm yesterday to noon today
    const now = new Date();
    const sleepWindowStart = new Date(now);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(20, 0, 0, 0);
    const sleepWindowEnd = new Date(now);
    if (now.getHours() < 12) {
      // Still morning — end at now
    } else {
      sleepWindowEnd.setHours(12, 0, 0, 0);
    }

    try {
      const sleepSamples = await HealthKit.querySamples(
        "HKCategoryTypeIdentifierSleepAnalysis",
        { startDate: sleepWindowStart, endDate: sleepWindowEnd }
      );
      // Values: 0=InBed, 1=Asleep, 2=Awake, 3=Core, 4=Deep, 5=REM
      const asleepValues = new Set([1, 3, 4, 5]);
      let totalMs = 0;
      for (const s of sleepSamples ?? []) {
        if (asleepValues.has(s.value)) {
          const start = new Date(s.startDate).getTime();
          const end = new Date(s.endDate).getTime();
          totalMs += Math.max(0, end - start);
        }
      }
      if (totalMs > 0) {
        sleepHours = Math.round((totalMs / 3_600_000) * 10) / 10;
      }
    } catch {
      // querySamples may not be available on all builds — silently skip sleep
    }

    const metrics: RecoveryMetrics = { rhr, hrv, sleepHours, syncedAt };
    await AsyncStorage.setItem(RECOVERY_CACHE_KEY, JSON.stringify(metrics));
    return metrics;
  } catch {
    return { syncedAt };
  }
}

async function _syncRecoveryHealthConnect(): Promise<RecoveryMetrics> {
  const syncedAt = new Date().toISOString();
  try {
    const _hcModule = require("react-native-health-connect");
    const { initialize, requestPermission, readRecords } = _hcModule.default ?? _hcModule;

    const available = await initialize();
    if (!available) return { syncedAt };

    await requestPermission([
      { accessType: "read", recordType: "RestingHeartRate" },
      { accessType: "read", recordType: "HeartRateVariabilitySdnn" },
      { accessType: "read", recordType: "SleepSession" },
    ]);

    const endTime = new Date().toISOString();
    let rhr: number | undefined;
    let hrv: number | undefined;
    let sleepHours: number | undefined;

    const rhrResult = await readRecords("RestingHeartRate", {
      timeRangeFilter: { operator: "before", endTime },
      ascendingOrder: false, pageSize: 1,
    });
    const latestRhr = rhrResult?.records?.[0];
    if (latestRhr?.beatsPerMinute > 0) {
      rhr = Math.round(latestRhr.beatsPerMinute);
    }

    const hrvResult = await readRecords("HeartRateVariabilitySdnn", {
      timeRangeFilter: { operator: "before", endTime },
      ascendingOrder: false, pageSize: 1,
    });
    const latestHrv = hrvResult?.records?.[0];
    if (latestHrv?.heartRateVariabilityMillis > 0) {
      hrv = Math.round(latestHrv.heartRateVariabilityMillis);
    }

    // Sleep: last session starting after 8 pm yesterday
    const sleepWindowStart = new Date();
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(20, 0, 0, 0);
    const sleepResult = await readRecords("SleepSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: sleepWindowStart.toISOString(),
        endTime,
      },
      ascendingOrder: false, pageSize: 1,
    });
    const latestSleep = sleepResult?.records?.[0];
    if (latestSleep?.startTime && latestSleep?.endTime) {
      const durationMs = new Date(latestSleep.endTime).getTime() - new Date(latestSleep.startTime).getTime();
      if (durationMs > 0) {
        sleepHours = Math.round((durationMs / 3_600_000) * 10) / 10;
      }
    }

    const metrics: RecoveryMetrics = { rhr, hrv, sleepHours, syncedAt };
    await AsyncStorage.setItem(RECOVERY_CACHE_KEY, JSON.stringify(metrics));
    return metrics;
  } catch {
    return { syncedAt };
  }
}

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

// ── iOS — Apple Health (HealthKit) ────────────────────────────────────────────

export async function syncFromAppleHealth(userId: string): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  if (Platform.OS !== "ios") {
    return { weightSynced: false, bodyFatSynced: false, stepsSynced: false, syncedAt, error: "iOS only" };
  }

  try {
    // Dynamic import so the module is never evaluated on Android.
    // Handles both ESM-interop (module.default) and CJS (module directly).
    const _hkModule = require("@kingstinct/react-native-healthkit");
    const HealthKit = _hkModule.default ?? _hkModule;

    // Request read permissions for body mass, body fat % and step count
    await HealthKit.requestAuthorization({
      toRead: [
        "HKQuantityTypeIdentifierBodyMass",
        "HKQuantityTypeIdentifierBodyFatPercentage",
        "HKQuantityTypeIdentifierStepCount",
      ],
      toShare: [],
    });

    let weightSynced = false;
    let bodyFatSynced = false;
    let stepsSynced = false;
    let weightKg: number | undefined;
    let bodyFatPct: number | undefined;
    let stepsCount: number | undefined;

    // Read latest body mass (kg) — only log if the sample is from today
    const weightSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierBodyMass",
      "kg"
    );
    const weightSampleDate = weightSample?.endDate ?? weightSample?.startDate;
    const weightIsToday = weightSampleDate
      ? new Date(weightSampleDate).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
      : false;
    if (weightIsToday && weightSample?.quantity != null && weightSample.quantity > 0) {
      weightKg = weightSample.quantity;
      await logBodyWeight(userId, weightSample.quantity);
      weightSynced = true;
      await AsyncStorage.setItem(
        "weight_sync_pending",
        JSON.stringify({ kg: weightSample.quantity, ts: new Date().toISOString() })
      );
    }

    // Read latest body fat % — HealthKit stores as fraction (0.185), unit '%' converts to 18.5
    const bodyFatSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierBodyFatPercentage",
      "%"
    );
    if (bodyFatSample?.quantity != null && bodyFatSample.quantity > 0) {
      // HealthKit returns body fat as a fraction (0.135 = 13.5%) regardless of
      // the '%' unit request — multiply by 100 to convert to a real percentage.
      bodyFatPct = Math.round(bodyFatSample.quantity * 100 * 10) / 10;
      await logBodyMeasurements(userId, {
        chestCm: null, waistCm: null, hipsCm: null,
        leftArmCm: null, rightArmCm: null, leftThighCm: null, neckCm: null,
        notes: null,
        bodyFatPct,
        source: "apple_health",
      });
      bodyFatSynced = true;
    }

    // Read today's step count using a cumulative statistics query (correctly
    // deduplicates overlapping samples from iPhone + Apple Watch).
    // The date range must go in options.filter.{ startDate, endDate } — NOT
    // top-level `from`/`to` keys (which the library ignores, causing all-time totals).
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const stepsStats = await HealthKit.queryStatisticsForQuantity(
      "HKQuantityTypeIdentifierStepCount",
      ["cumulativeSum"],
      { filter: { date: { startDate: startOfToday, endDate: now } }, unit: "count" },
    );
    const totalSteps = Math.round(stepsStats?.sumQuantity?.quantity ?? 0);
    if (totalSteps > 0) {
      await updateDailySteps(userId, totalSteps, "apple_health");
      stepsCount = totalSteps;
      stepsSynced = true;
    }

    await AsyncStorage.setItem(LAST_SYNC_KEY, syncedAt);
    return { weightSynced, bodyFatSynced, stepsSynced, weightKg, bodyFatPct, stepsCount, syncedAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { weightSynced: false, bodyFatSynced: false, stepsSynced: false, syncedAt, error: msg };
  }
}

// ── Android — Health Connect ───────────────────────────────────────────────────

export async function syncFromHealthConnect(userId: string): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  if (Platform.OS !== "android") {
    return { weightSynced: false, bodyFatSynced: false, stepsSynced: false, syncedAt, error: "Android only" };
  }

  try {
    // Handles both ESM-interop (module.default) and CJS (module directly).
    const _hcModule = require("react-native-health-connect");
    const _hc = _hcModule.default ?? _hcModule;
    const { initialize, requestPermission, readRecords } = _hc;

    const available = await initialize();
    if (!available) {
      return {
        weightSynced: false, bodyFatSynced: false, stepsSynced: false, syncedAt,
        error: "Health Connect is not available on this device",
      };
    }

    await requestPermission([
      { accessType: "read", recordType: "Weight" },
      { accessType: "read", recordType: "BodyFat" },
      { accessType: "read", recordType: "Steps" },
    ]);

    const now = new Date();
    const endTime = now.toISOString();
    let weightSynced = false;
    let bodyFatSynced = false;
    let stepsSynced = false;
    let weightKg: number | undefined;
    let bodyFatPct: number | undefined;
    let stepsCount: number | undefined;

    // Read most recent weight record
    const weightResult = await readRecords("Weight", {
      timeRangeFilter: { operator: "before", endTime },
      ascendingOrder: false,
      pageSize: 1,
    });
    const latestWeight = weightResult?.records?.[0];
    if (latestWeight?.weight?.inKilograms > 0) {
      weightKg = latestWeight.weight.inKilograms;
      await logBodyWeight(userId, latestWeight.weight.inKilograms);
      weightSynced = true;
    }

    // Read most recent body fat record
    const bodyFatResult = await readRecords("BodyFat", {
      timeRangeFilter: { operator: "before", endTime },
      ascendingOrder: false,
      pageSize: 1,
    });
    const latestBodyFat = bodyFatResult?.records?.[0];
    if (latestBodyFat?.percentage > 0) {
      bodyFatPct = Math.round(latestBodyFat.percentage * 10) / 10;
      await logBodyMeasurements(userId, {
        chestCm: null, waistCm: null, hipsCm: null,
        leftArmCm: null, rightArmCm: null, leftThighCm: null, neckCm: null,
        notes: null,
        bodyFatPct,
        source: "google_fit",
      });
      bodyFatSynced = true;
    }

    // Read today's steps — sum all records between midnight and now
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const stepsResult = await readRecords("Steps", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfToday.toISOString(),
        endTime,
      },
    });
    const totalSteps = Math.round(
      stepsResult?.records?.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0) ?? 0,
    );
    if (totalSteps > 0) {
      await updateDailySteps(userId, totalSteps, "google_fit");
      stepsCount = totalSteps;
      stepsSynced = true;
    }

    await AsyncStorage.setItem(LAST_SYNC_KEY, syncedAt);
    return { weightSynced, bodyFatSynced, stepsSynced, weightKg, bodyFatPct, stepsCount, syncedAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { weightSynced: false, bodyFatSynced: false, stepsSynced: false, syncedAt, error: msg };
  }
}

// ── Platform-agnostic entry point ─────────────────────────────────────────────

export async function syncFromHealth(userId: string): Promise<SyncResult> {
  if (Platform.OS === "ios") return syncFromAppleHealth(userId);
  if (Platform.OS === "android") return syncFromHealthConnect(userId);
  return {
    weightSynced: false, bodyFatSynced: false, stepsSynced: false,
    syncedAt: new Date().toISOString(),
    error: "Not supported on this platform",
  };
}

/**
 * Silent background sync called on every app open / foreground.
 * Steps are always upserted (safe). Weight is only logged if no entry exists
 * for today yet — prevents duplicate rows from repeated app opens.
 * Never throws; all errors are swallowed so UI is unaffected.
 */
export async function silentDailySync(userId: string): Promise<{ stepsSynced: boolean; weightSynced: boolean }> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { stepsSynced: false, weightSynced: false };
  }

  try {
    const alreadyHasWeight = await hasTodayWeightLog(userId);

    if (Platform.OS === "ios") {
      const _hkModule = require("@kingstinct/react-native-healthkit");
      const HealthKit = _hkModule.default ?? _hkModule;

      await HealthKit.requestAuthorization({
        toRead: [
          "HKQuantityTypeIdentifierStepCount",
          "HKQuantityTypeIdentifierBodyMass",
        ],
        toShare: [],
      });

      let stepsSynced = false;
      let weightSynced = false;

      // Steps — cumulative sum for today only.
      // Date range goes in filter.{ startDate, endDate } — top-level `from`/`to`
      // are not part of the options type and would be silently ignored.
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const stepsStats = await HealthKit.queryStatisticsForQuantity(
        "HKQuantityTypeIdentifierStepCount",
        ["cumulativeSum"],
        { filter: { date: { startDate: startOfToday, endDate: now } }, unit: "count" },
      );
      const steps = stepsStats?.sumQuantity?.quantity;
      if (steps != null && steps > 0) {
        await updateDailySteps(userId, Math.round(steps), "apple_health");
        stepsSynced = true;
      }

      // Weight — only if nothing logged today AND the sample itself is from today
      if (!alreadyHasWeight) {
        const weightSample = await HealthKit.getMostRecentQuantitySample(
          "HKQuantityTypeIdentifierBodyMass",
          "kg"
        );
        const sampleDate = weightSample?.endDate ?? weightSample?.startDate;
        const sampleIsToday = sampleDate
          ? new Date(sampleDate).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
          : false;
        if (sampleIsToday && weightSample?.quantity != null && weightSample.quantity > 0) {
          await logBodyWeight(userId, weightSample.quantity);
          weightSynced = true;
          // Store a pending acknowledgment so the weight log screen can show a banner
          await AsyncStorage.setItem(
            "weight_sync_pending",
            JSON.stringify({ kg: weightSample.quantity, ts: new Date().toISOString() })
          );
        }
      }

      return { stepsSynced, weightSynced };
    }

    if (Platform.OS === "android") {
      const { initialize, readRecords } = require("react-native-health-connect");
      const available = await initialize();
      if (!available) return { stepsSynced: false, weightSynced: false };

      await require("react-native-health-connect").requestPermission([
        { accessType: "read", recordType: "Steps" },
        { accessType: "read", recordType: "Weight" },
      ]);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      let stepsSynced = false;
      let weightSynced = false;

      const stepsResult = await readRecords("Steps", {
        timeRangeFilter: { operator: "between", startTime: startOfToday.toISOString(), endTime: now.toISOString() },
      });
      const totalSteps = (stepsResult?.records ?? []).reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
      if (totalSteps > 0) {
        await updateDailySteps(userId, totalSteps, "google_fit");
        stepsSynced = true;
      }

      if (!alreadyHasWeight) {
        const weightResult = await readRecords("Weight", {
          timeRangeFilter: { operator: "before", endTime: now.toISOString() },
          ascendingOrder: false,
          pageSize: 1,
        });
        const latestWeight = weightResult?.records?.[0];
        if (latestWeight?.weight?.inKilograms > 0) {
          await logBodyWeight(userId, latestWeight.weight.inKilograms);
          weightSynced = true;
          await AsyncStorage.setItem(
            "weight_sync_pending",
            JSON.stringify({ kg: latestWeight.weight.inKilograms, ts: new Date().toISOString() })
          );
        }
      }

      return { stepsSynced, weightSynced };
    }
  } catch {
    // Silent — never surface errors to the user
  }

  return { stepsSynced: false, weightSynced: false };
}

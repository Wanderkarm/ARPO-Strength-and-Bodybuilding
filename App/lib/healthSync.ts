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
import { logBodyWeight, logBodyMeasurements } from "@/lib/local-db";

export interface SyncResult {
  weightSynced: boolean;
  bodyFatSynced: boolean;
  weightKg?: number;
  bodyFatPct?: number;
  syncedAt: string;
  error?: string;
}

const LAST_SYNC_KEY = "healthSyncLastAt";

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

// ── iOS — Apple Health (HealthKit) ────────────────────────────────────────────

export async function syncFromAppleHealth(userId: string): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  if (Platform.OS !== "ios") {
    return { weightSynced: false, bodyFatSynced: false, syncedAt, error: "iOS only" };
  }

  try {
    // Dynamic import so the module is never evaluated on Android
    const HealthKit = require("@kingstinct/react-native-healthkit");

    // Request read permissions for body mass and body fat %
    await HealthKit.requestAuthorization({
      toRead: [
        "HKQuantityTypeIdentifierBodyMass",
        "HKQuantityTypeIdentifierBodyFatPercentage",
      ],
      toShare: [],
    });

    let weightSynced = false;
    let bodyFatSynced = false;
    let weightKg: number | undefined;
    let bodyFatPct: number | undefined;

    // Read latest body mass (kg)
    const weightSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierBodyMass",
      "kg"
    );
    if (weightSample?.quantity != null && weightSample.quantity > 0) {
      weightKg = weightSample.quantity;
      await logBodyWeight(userId, weightSample.quantity);
      weightSynced = true;
    }

    // Read latest body fat % — HealthKit stores as fraction (0.185), unit '%' converts to 18.5
    const bodyFatSample = await HealthKit.getMostRecentQuantitySample(
      "HKQuantityTypeIdentifierBodyFatPercentage",
      "%"
    );
    if (bodyFatSample?.quantity != null && bodyFatSample.quantity > 0) {
      // Value arrives as 0–100 when queried with '%' unit
      bodyFatPct = Math.round(bodyFatSample.quantity * 10) / 10;
      await logBodyMeasurements(userId, {
        chestCm: null, waistCm: null, hipsCm: null,
        leftArmCm: null, rightArmCm: null, leftThighCm: null, neckCm: null,
        notes: null,
        bodyFatPct,
        source: "apple_health",
      });
      bodyFatSynced = true;
    }

    await AsyncStorage.setItem(LAST_SYNC_KEY, syncedAt);
    return { weightSynced, bodyFatSynced, weightKg, bodyFatPct, syncedAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { weightSynced: false, bodyFatSynced: false, syncedAt, error: msg };
  }
}

// ── Android — Health Connect ───────────────────────────────────────────────────

export async function syncFromHealthConnect(userId: string): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  if (Platform.OS !== "android") {
    return { weightSynced: false, bodyFatSynced: false, syncedAt, error: "Android only" };
  }

  try {
    const {
      initialize,
      requestPermission,
      readRecords,
    } = require("react-native-health-connect");

    const available = await initialize();
    if (!available) {
      return {
        weightSynced: false, bodyFatSynced: false, syncedAt,
        error: "Health Connect is not available on this device",
      };
    }

    await requestPermission([
      { accessType: "read", recordType: "Weight" },
      { accessType: "read", recordType: "BodyFat" },
    ]);

    const endTime = new Date().toISOString();
    let weightSynced = false;
    let bodyFatSynced = false;
    let weightKg: number | undefined;
    let bodyFatPct: number | undefined;

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

    await AsyncStorage.setItem(LAST_SYNC_KEY, syncedAt);
    return { weightSynced, bodyFatSynced, weightKg, bodyFatPct, syncedAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { weightSynced: false, bodyFatSynced: false, syncedAt, error: msg };
  }
}

// ── Platform-agnostic entry point ─────────────────────────────────────────────

export async function syncFromHealth(userId: string): Promise<SyncResult> {
  if (Platform.OS === "ios") return syncFromAppleHealth(userId);
  if (Platform.OS === "android") return syncFromHealthConnect(userId);
  return {
    weightSynced: false, bodyFatSynced: false,
    syncedAt: new Date().toISOString(),
    error: "Not supported on this platform",
  };
}

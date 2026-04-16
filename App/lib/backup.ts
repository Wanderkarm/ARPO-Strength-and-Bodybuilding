/**
 * ARPO Backup & Restore
 *
 * Export: queries every user-owned table → JSON → device file → native share sheet
 * Restore: document picker → parse + validate → wipe user data → re-insert
 *
 * Built-in templates and exercises are NOT exported (they're re-seeded from code
 * on every install). Only custom templates/exercises and all user records are saved.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getDb } from "./database";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cast unknown backup values to the SQLite-safe primitive types. */
type SQLVal = string | number | boolean | null;
function v(val: unknown): SQLVal {
  if (val === undefined) return null;
  if (val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return val as SQLVal;
  }
  return String(val);
}

// ─── Version ──────────────────────────────────────────────────────────────────
// Bump this when the schema changes so restore can handle migrations.
const BACKUP_VERSION = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ARPOBackup {
  version: number;
  exportedAt: string;         // ISO 8601
  userId: string;
  asyncStorageKeys: Record<string, string | null>;

  // User profile + nutrition (stored together in users table)
  user: Record<string, unknown> | null;

  // Exercise weight starting points
  weightBaselines: Record<string, unknown>[];

  // Body tracking
  bodyWeightLogs: Record<string, unknown>[];
  bodyMeasurements: Record<string, unknown>[];

  // Custom routines (built-ins are re-seeded, not needed)
  customExercises: Record<string, unknown>[];
  customTemplates: Record<string, unknown>[];
  customTemplateDays: Record<string, unknown>[];
  customTemplateExercises: Record<string, unknown>[];

  // Training history
  workoutPlans: Record<string, unknown>[];
  workoutLogs: Record<string, unknown>[];
  setLogs: Record<string, unknown>[];
}

// ─── AsyncStorage keys to include in backup ───────────────────────────────────

const ASYNC_KEYS_TO_BACKUP = [
  "userId",
  "activePlanId",
  "unit",
  "hugejump_warned_exercises",
  "notif_workout_enabled",
  "notif_workout_hour",
  "notif_workout_minute",
  "notif_weighin_enabled",
  "notif_weighin_hour",
  "notif_weighin_minute",
];

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();

    const userId = await AsyncStorage.getItem("userId");
    if (!userId) return { success: false, error: "No user found. Complete onboarding first." };

    // AsyncStorage keys
    const asyncStorageKeys: Record<string, string | null> = {};
    for (const key of ASYNC_KEYS_TO_BACKUP) {
      asyncStorageKeys[key] = await AsyncStorage.getItem(key);
    }

    // User profile
    const user = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM users WHERE id = ?", [userId]
    ) ?? null;

    // Weight baselines
    const weightBaselines = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM user_weight_baselines WHERE user_id = ?", [userId]
    );

    // Body tracking
    const bodyWeightLogs = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM body_weight_logs WHERE user_id = ? ORDER BY logged_at ASC", [userId]
    );
    const bodyMeasurements = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM body_measurements WHERE user_id = ? ORDER BY logged_at ASC", [userId]
    );

    // Custom exercises (is_custom flag doesn't exist on exercises; custom ones added by user have user_id)
    const customExercises = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM exercises WHERE id NOT IN (SELECT id FROM exercises WHERE id IN (SELECT exercise_id FROM template_exercises WHERE template_day_id IN (SELECT id FROM template_days WHERE template_id IN (SELECT id FROM templates WHERE is_custom = 0)))) AND name NOT IN (SELECT name FROM exercises WHERE id IN (SELECT exercise_id FROM template_exercises WHERE template_day_id IN (SELECT id FROM template_days WHERE template_id IN (SELECT id FROM templates WHERE is_custom = 0))))"
    ).catch(() => [] as Record<string, unknown>[]);
    // Simpler: just export all exercises that appear only in custom templates or nowhere
    const allCustomExerciseIds = await db.getAllAsync<{ id: string }>(
      `SELECT DISTINCT e.id FROM exercises e
       LEFT JOIN template_exercises te ON te.exercise_id = e.id
       LEFT JOIN template_days td ON te.template_day_id = td.id
       LEFT JOIN templates t ON td.template_id = t.id
       WHERE t.is_custom = 1 OR t.id IS NULL`
    );
    // Just grab exercises referenced by custom templates for safety
    const customExercisesClean = await db.getAllAsync<Record<string, unknown>>(
      `SELECT DISTINCT e.* FROM exercises e
       JOIN template_exercises te ON te.exercise_id = e.id
       JOIN template_days td ON te.template_day_id = td.id
       JOIN templates t ON td.template_id = t.id
       WHERE t.is_custom = 1 AND t.user_id = ?`, [userId]
    );

    // Custom templates
    const customTemplates = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM templates WHERE is_custom = 1 AND user_id = ?", [userId]
    );
    const customTemplateIds = customTemplates.map(t => t.id as string);

    let customTemplateDays: Record<string, unknown>[] = [];
    let customTemplateExercises: Record<string, unknown>[] = [];
    if (customTemplateIds.length > 0) {
      const placeholders = customTemplateIds.map(() => "?").join(",");
      customTemplateDays = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM template_days WHERE template_id IN (${placeholders})`,
        customTemplateIds
      );
      const dayIds = customTemplateDays.map(d => d.id as string);
      if (dayIds.length > 0) {
        const dayPlaceholders = dayIds.map(() => "?").join(",");
        customTemplateExercises = await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM template_exercises WHERE template_day_id IN (${dayPlaceholders})`,
          dayIds
        );
      }
    }

    // Workout plans
    const workoutPlans = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM workout_plans WHERE user_id = ?", [userId]
    );
    const planIds = workoutPlans.map(p => p.id as string);

    let workoutLogs: Record<string, unknown>[] = [];
    let setLogs: Record<string, unknown>[] = [];
    if (planIds.length > 0) {
      const placeholders = planIds.map(() => "?").join(",");
      workoutLogs = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM workout_logs WHERE workout_plan_id IN (${placeholders}) ORDER BY week_number ASC, day_number ASC`,
        planIds
      );
      const logIds = workoutLogs.map(l => l.id as string);
      if (logIds.length > 0) {
        const logPlaceholders = logIds.map(() => "?").join(",");
        setLogs = await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM set_logs WHERE workout_log_id IN (${logPlaceholders}) ORDER BY set_number ASC`,
          logIds
        );
      }
    }

    const backup: ARPOBackup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      userId,
      asyncStorageKeys,
      user,
      weightBaselines,
      bodyWeightLogs,
      bodyMeasurements,
      customExercises: customExercisesClean,
      customTemplates,
      customTemplateDays,
      customTemplateExercises,
      workoutPlans,
      workoutLogs,
      setLogs,
    };

    // Write to cache directory
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `ARPO_backup_${dateStr}.json`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backup, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Share sheet — lets the user save to Files, Google Drive, iCloud, email, etc.
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { success: false, error: "Sharing is not available on this device." };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: "application/json",
      dialogTitle: "Save your ARPO backup",
      UTI: "public.json",
    });

    return { success: true };
  } catch (err: any) {
    console.error("Backup export error:", err);
    return { success: false, error: err?.message ?? "Export failed." };
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export interface RestorePreview {
  exportedAt: string;
  workoutSessions: number;
  weighIns: number;
  bodyMeasurements: number;
  customTemplates: number;
  workoutPlans: number;
}

export async function pickAndPreviewBackup(): Promise<
  { success: true; backup: ARPOBackup; preview: RestorePreview } |
  { success: false; error: string }
> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, error: "No file selected." };
    }

    const fileUri = result.assets[0].uri;
    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const backup: ARPOBackup = JSON.parse(raw);

    if (!backup.version || !backup.userId || !backup.exportedAt) {
      return { success: false, error: "This doesn't look like a valid ARPO backup file." };
    }
    if (backup.version > BACKUP_VERSION) {
      return { success: false, error: `This backup was made with a newer version of ARPO. Please update the app first.` };
    }

    const preview: RestorePreview = {
      exportedAt: backup.exportedAt,
      workoutSessions: backup.workoutLogs.filter(l => l.completed_at).length,
      weighIns: backup.bodyWeightLogs.length,
      bodyMeasurements: backup.bodyMeasurements.length,
      customTemplates: backup.customTemplates.length,
      workoutPlans: backup.workoutPlans.length,
    };

    return { success: true, backup, preview };
  } catch (err: any) {
    console.error("Backup preview error:", err);
    if (err?.message?.includes("JSON")) {
      return { success: false, error: "The file could not be read. Make sure it's an ARPO backup (.json) file." };
    }
    return { success: false, error: err?.message ?? "Failed to read backup file." };
  }
}

export async function restoreBackup(backup: ARPOBackup): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  try {
    // ── Delete existing user data (cascade order) ──────────────────────────
    const existingUserId = await AsyncStorage.getItem("userId");
    if (existingUserId) {
      // set_logs cascade-deletes with workout_logs due to ON DELETE CASCADE
      await db.runAsync(
        `DELETE FROM workout_logs WHERE workout_plan_id IN
         (SELECT id FROM workout_plans WHERE user_id = ?)`, [existingUserId]
      );
      await db.runAsync("DELETE FROM workout_plans WHERE user_id = ?", [existingUserId]);
      await db.runAsync("DELETE FROM body_weight_logs WHERE user_id = ?", [existingUserId]);
      await db.runAsync("DELETE FROM body_measurements WHERE user_id = ?", [existingUserId]);
      await db.runAsync("DELETE FROM user_weight_baselines WHERE user_id = ?", [existingUserId]);

      // Delete custom templates
      const customTmplIds = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM templates WHERE is_custom = 1 AND user_id = ?", [existingUserId]
      );
      for (const t of customTmplIds) {
        const days = await db.getAllAsync<{ id: string }>(
          "SELECT id FROM template_days WHERE template_id = ?", [t.id]
        );
        for (const d of days) {
          await db.runAsync("DELETE FROM template_exercises WHERE template_day_id = ?", [d.id]);
        }
        await db.runAsync("DELETE FROM template_days WHERE template_id = ?", [t.id]);
        await db.runAsync("DELETE FROM templates WHERE id = ?", [t.id]);
      }

      await db.runAsync("DELETE FROM users WHERE id = ?", [existingUserId]);
    }

    // ── Re-insert from backup ─────────────────────────────────────────────

    // User profile
    if (backup.user) {
      const u = backup.user;
      await db.runAsync(
        `INSERT OR REPLACE INTO users
         (id, gender, bodyweight, experience, weight_unit, height_cm, age, activity_level, body_goal, target_weight_kg, weeks_to_goal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v(u.id), v(u.gender), v(u.bodyweight), v(u.experience), v(u.weight_unit),
         v(u.height_cm), v(u.age), v(u.activity_level) ?? "moderate",
         v(u.body_goal) ?? "recomp", v(u.target_weight_kg), v(u.weeks_to_goal)]
      );
    }

    // Weight baselines
    for (const wb of backup.weightBaselines) {
      await db.runAsync(
        `INSERT OR REPLACE INTO user_weight_baselines (id, user_id, category, weight) VALUES (?, ?, ?, ?)`,
        [v(wb.id), v(wb.user_id), v(wb.category), v(wb.weight)]
      );
    }

    // Body weight logs
    for (const bwl of backup.bodyWeightLogs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO body_weight_logs (id, user_id, weight_kg, logged_at) VALUES (?, ?, ?, ?)`,
        [v(bwl.id), v(bwl.user_id), v(bwl.weight_kg), v(bwl.logged_at)]
      );
    }

    // Body measurements
    for (const bm of backup.bodyMeasurements) {
      await db.runAsync(
        `INSERT OR REPLACE INTO body_measurements
         (id, user_id, chest_cm, waist_cm, hips_cm, left_arm_cm, right_arm_cm, left_thigh_cm, neck_cm, notes, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v(bm.id), v(bm.user_id), v(bm.chest_cm), v(bm.waist_cm), v(bm.hips_cm),
         v(bm.left_arm_cm), v(bm.right_arm_cm), v(bm.left_thigh_cm), v(bm.neck_cm), v(bm.notes), v(bm.logged_at)]
      );
    }

    // Custom exercises
    for (const ex of backup.customExercises) {
      await db.runAsync(
        `INSERT OR IGNORE INTO exercises (id, name, category, equipment, default_video_url) VALUES (?, ?, ?, ?, ?)`,
        [v(ex.id), v(ex.name), v(ex.category), v(ex.equipment), v(ex.default_video_url)]
      );
    }

    // Custom templates
    for (const t of backup.customTemplates) {
      await db.runAsync(
        `INSERT OR REPLACE INTO templates (id, name, meso_type, is_custom, user_id) VALUES (?, ?, ?, ?, ?)`,
        [v(t.id), v(t.name), v(t.meso_type), v(t.is_custom), v(t.user_id)]
      );
    }
    for (const d of backup.customTemplateDays) {
      await db.runAsync(
        `INSERT OR REPLACE INTO template_days (id, template_id, day_number) VALUES (?, ?, ?)`,
        [v(d.id), v(d.template_id), v(d.day_number)]
      );
    }
    for (const te of backup.customTemplateExercises) {
      await db.runAsync(
        `INSERT OR REPLACE INTO template_exercises (id, template_day_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)`,
        [v(te.id), v(te.template_day_id), v(te.exercise_id), v(te.sort_order)]
      );
    }

    // Workout plans
    for (const wp of backup.workoutPlans) {
      await db.runAsync(
        `INSERT OR REPLACE INTO workout_plans
         (id, user_id, template_id, current_week, current_day, is_active, goal_type, gym_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [v(wp.id), v(wp.user_id), v(wp.template_id), v(wp.current_week),
         v(wp.current_day), v(wp.is_active), v(wp.goal_type), v(wp.gym_type)]
      );
    }

    // Workout logs
    for (const wl of backup.workoutLogs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO workout_logs
         (id, workout_plan_id, exercise_id, original_exercise_id, is_permanent_swap,
          week_number, day_number, target_sets, target_weight, target_rir,
          soreness_rating, pump_rating, completed_at, is_skipped)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v(wl.id), v(wl.workout_plan_id), v(wl.exercise_id), v(wl.original_exercise_id),
         v(wl.is_permanent_swap) ?? 0, v(wl.week_number), v(wl.day_number),
         v(wl.target_sets), v(wl.target_weight), v(wl.target_rir),
         v(wl.soreness_rating), v(wl.pump_rating), v(wl.completed_at), v(wl.is_skipped) ?? 0]
      );
    }

    // Set logs
    for (const sl of backup.setLogs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO set_logs
         (id, workout_log_id, set_number, target_weight, target_reps, reps_completed, weight_used, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [v(sl.id), v(sl.workout_log_id), v(sl.set_number), v(sl.target_weight),
         v(sl.target_reps) ?? 10, v(sl.reps_completed), v(sl.weight_used), v(sl.completed_at)]
      );
    }

    // ── Restore AsyncStorage ──────────────────────────────────────────────
    for (const [key, value] of Object.entries(backup.asyncStorageKeys)) {
      if (value !== null && value !== undefined) {
        await AsyncStorage.setItem(key, value);
      } else {
        await AsyncStorage.removeItem(key);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Backup restore error:", err);
    return { success: false, error: err?.message ?? "Restore failed." };
  }
}

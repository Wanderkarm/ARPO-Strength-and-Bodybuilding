import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call openDbAsync() first.");
  }
  return db;
}

export async function openDbAsync(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("hypertrophy.db");
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
  return db;
}

export async function initializeSchema() {
  const database = await openDbAsync();

  await database.execAsync(`ALTER TABLE workout_plans ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await database.execAsync(`ALTER TABLE workout_logs ADD COLUMN is_skipped INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await database.execAsync(`ALTER TABLE workout_plans ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'hypertrophy'`).catch(() => {});
  await database.execAsync(`ALTER TABLE users ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'lbs'`).catch(() => {});
  await database.execAsync(`ALTER TABLE workout_logs ADD COLUMN original_exercise_id TEXT`).catch(() => {});

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      gender TEXT NOT NULL DEFAULT 'MALE',
      bodyweight REAL,
      experience TEXT NOT NULL DEFAULT 'BEGINNER',
      weight_unit TEXT NOT NULL DEFAULT 'lbs'
    );

    CREATE TABLE IF NOT EXISTS user_weight_baselines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      weight REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, category)
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      equipment TEXT NOT NULL DEFAULT 'BARBELL',
      default_video_url TEXT
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      meso_type INTEGER NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS template_days (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id)
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_day_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (template_day_id) REFERENCES template_days(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      current_week INTEGER NOT NULL DEFAULT 1,
      current_day INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      goal_type TEXT NOT NULL DEFAULT 'hypertrophy',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES templates(id)
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY,
      workout_plan_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      original_exercise_id TEXT,
      week_number INTEGER NOT NULL,
      day_number INTEGER NOT NULL DEFAULT 1,
      target_sets INTEGER NOT NULL,
      target_weight REAL NOT NULL,
      target_rir TEXT NOT NULL,
      soreness_rating INTEGER,
      completed_at TEXT,
      is_skipped INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workout_plan_id) REFERENCES workout_plans(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS set_logs (
      id TEXT PRIMARY KEY,
      workout_log_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      target_weight REAL NOT NULL,
      target_reps INTEGER NOT NULL DEFAULT 10,
      reps_completed INTEGER,
      weight_used REAL,
      completed_at TEXT,
      FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
      UNIQUE(workout_log_id, set_number)
    );
  `);
}

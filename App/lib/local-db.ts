import * as Crypto from "expo-crypto";
import { getDb, initializeSchema } from "./database";
import { exercises as exerciseSeedData, templates as templateSeedData } from "./seed-data";
import { getCategoryWeight, type BaselineWeights } from "@/utils/categoryWeightMap";
import { calculateNextWeekTargets, getRepTarget, type GoalType } from "@/utils/progressionAlgorithm";

function generateId(): string {
  return Crypto.randomUUID();
}

const RIR_SCHEDULE: Record<number, string> = {
  1: "3 RIR",
  2: "2 RIR",
  3: "1 RIR",
  4: "Deload",
};

export async function initializeDatabase(): Promise<void> {
  await initializeSchema();
  const db = getDb();
  const result = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM exercises");
  if (!result || result.count === 0) {
    await seedExercises();
    await seedTemplates();
  } else {
    await seedMissingExercises();
    await seedMissingTemplates();
  }
  await fixTemplateMesoTypes();
}

async function fixTemplateMesoTypes() {
  const db = getDb();
  const corrections: Array<{ name: string; mesoType: number }> = [
    { name: "The Thor Specialization", mesoType: 5 },
    { name: "The Valkyrie (Glute Specialization)", mesoType: 5 },
    { name: "Arnold Split 6-Day", mesoType: 6 },
    { name: "Push/Pull/Legs 6-Day", mesoType: 6 },
    { name: "Upper/Lower 6-Day", mesoType: 6 },
    { name: "Upper/Lower 4-Day", mesoType: 4 },
    { name: "Full Body 3-Day", mesoType: 3 },
    { name: "Push/Pull/Legs 3-Day", mesoType: 3 },
  ];
  for (const { name, mesoType } of corrections) {
    await db.runAsync(
      "UPDATE templates SET meso_type = ? WHERE name = ? AND is_custom = 0 AND meso_type != ?",
      [mesoType, name, mesoType]
    );
  }
}

async function seedExercises() {
  const db = getDb();
  for (const ex of exerciseSeedData) {
    const id = generateId();
    await db.runAsync(
      "INSERT OR IGNORE INTO exercises (id, name, category, equipment, default_video_url) VALUES (?, ?, ?, ?, ?)",
      [id, ex.name, ex.category, ex.equipment, ex.defaultVideoUrl]
    );
  }
}

async function seedMissingExercises() {
  const db = getDb();
  for (const ex of exerciseSeedData) {
    const existing = await db.getFirstAsync<{ id: string; default_video_url: string | null }>(
      "SELECT id, default_video_url FROM exercises WHERE name = ?",
      [ex.name]
    );
    if (!existing) {
      const id = generateId();
      await db.runAsync(
        "INSERT INTO exercises (id, name, category, equipment, default_video_url) VALUES (?, ?, ?, ?, ?)",
        [id, ex.name, ex.category, ex.equipment, ex.defaultVideoUrl]
      );
    } else if (ex.defaultVideoUrl && existing.default_video_url !== ex.defaultVideoUrl) {
      await db.runAsync(
        "UPDATE exercises SET default_video_url = ? WHERE id = ?",
        [ex.defaultVideoUrl, existing.id]
      );
    }
  }
}

async function seedMissingTemplates() {
  const db = getDb();
  for (const tmpl of templateSeedData) {
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM templates WHERE name = ? AND is_custom = 0",
      [tmpl.name]
    );
    if (!existing) {
      const templateId = generateId();
      await db.runAsync(
        "INSERT INTO templates (id, name, meso_type, is_custom, user_id) VALUES (?, ?, ?, 0, NULL)",
        [templateId, tmpl.name, tmpl.mesoType]
      );
      for (const day of tmpl.days) {
        const dayId = generateId();
        await db.runAsync(
          "INSERT INTO template_days (id, template_id, day_number) VALUES (?, ?, ?)",
          [dayId, templateId, day.dayNumber]
        );
        for (let i = 0; i < day.exerciseNames.length; i++) {
          const exercise = await db.getFirstAsync<{ id: string }>(
            "SELECT id FROM exercises WHERE name = ?",
            [day.exerciseNames[i]]
          );
          if (exercise) {
            const teId = generateId();
            await db.runAsync(
              "INSERT INTO template_exercises (id, template_day_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)",
              [teId, dayId, exercise.id, i + 1]
            );
          }
        }
      }
    }
  }
}

async function seedTemplates() {
  const db = getDb();
  for (const tmpl of templateSeedData) {
    const templateId = generateId();
    await db.runAsync(
      "INSERT INTO templates (id, name, meso_type, is_custom, user_id) VALUES (?, ?, ?, 0, NULL)",
      [templateId, tmpl.name, tmpl.mesoType]
    );

    for (const day of tmpl.days) {
      const dayId = generateId();
      await db.runAsync(
        "INSERT INTO template_days (id, template_id, day_number) VALUES (?, ?, ?)",
        [dayId, templateId, day.dayNumber]
      );

      for (let i = 0; i < day.exerciseNames.length; i++) {
        const exercise = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM exercises WHERE name = ?",
          [day.exerciseNames[i]]
        );
        if (exercise) {
          const teId = generateId();
          await db.runAsync(
            "INSERT INTO template_exercises (id, template_day_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)",
            [teId, dayId, exercise.id, i + 1]
          );
        }
      }
    }
  }
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  defaultVideoUrl: string | null;
}

export interface TemplateExercise {
  id: string;
  order: number;
  exercise: Exercise;
}

export interface TemplateDay {
  id: string;
  dayNumber: number;
  exercises: TemplateExercise[];
}

export interface Template {
  id: string;
  name: string;
  mesoType: number;
  days: TemplateDay[];
}

export interface SetLogData {
  id: string;
  setNumber: number;
  targetWeight: number;
  targetReps: number;
  repsCompleted: number | null;
  weightUsed: number | null;
  completedAt: string | null;
}

export interface WorkoutLog {
  id: string;
  exerciseId: string;
  weekNumber: number;
  dayNumber: number;
  targetSets: number;
  targetWeight: number;
  targetRIR: string;
  sorenessRating: number | null;
  /** Pump quality 1–5: 1=no pump, 3=sweet spot, 5=extreme pump */
  pumpRating: number | null;
  completedAt: string | null;
  isSkipped: boolean;
  exercise: Exercise;
  sets: SetLogData[];
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  templateId: string;
  currentWeek: number;
  currentDay: number;
  isActive: boolean;
  goalType: GoalType;
  template: Template;
  logs: WorkoutLog[];
}

export async function getAllExercises(): Promise<Exercise[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: string; name: string; category: string; equipment: string; default_video_url: string | null;
  }>("SELECT * FROM exercises ORDER BY category ASC, name ASC");
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    defaultVideoUrl: r.default_video_url,
  }));
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    id: string; name: string; category: string; equipment: string; default_video_url: string | null;
  }>("SELECT * FROM exercises WHERE id = ?", [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    equipment: row.equipment,
    defaultVideoUrl: row.default_video_url,
  };
}

export async function updateExercise(id: string, name: string, videoUrl: string | null): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE exercises SET name = ?, default_video_url = ? WHERE id = ?",
    [name, videoUrl || null, id]
  );
}

async function getTemplateWithDays(templateId: string): Promise<Template | null> {
  const db = getDb();
  const tmpl = await db.getFirstAsync<{ id: string; name: string; meso_type: number }>(
    "SELECT id, name, meso_type FROM templates WHERE id = ?",
    [templateId]
  );
  if (!tmpl) return null;

  const days = await db.getAllAsync<{ id: string; day_number: number }>(
    "SELECT id, day_number FROM template_days WHERE template_id = ? ORDER BY day_number ASC",
    [templateId]
  );

  const templateDays: TemplateDay[] = [];
  for (const d of days) {
    const texercises = await db.getAllAsync<{
      te_id: string; sort_order: number; ex_id: string; name: string; category: string; equipment: string; default_video_url: string | null;
    }>(
      `SELECT te.id as te_id, te.sort_order, e.id as ex_id, e.name, e.category, e.equipment, e.default_video_url
       FROM template_exercises te
       JOIN exercises e ON te.exercise_id = e.id
       WHERE te.template_day_id = ?
       ORDER BY te.sort_order ASC`,
      [d.id]
    );

    templateDays.push({
      id: d.id,
      dayNumber: d.day_number,
      exercises: texercises.map(te => ({
        id: te.te_id,
        order: te.sort_order,
        exercise: {
          id: te.ex_id,
          name: te.name,
          category: te.category,
          equipment: te.equipment,
          defaultVideoUrl: te.default_video_url,
        },
      })),
    });
  }

  return {
    id: tmpl.id,
    name: tmpl.name,
    mesoType: tmpl.meso_type,
    days: templateDays,
  };
}

const FEATURED_TEMPLATES = [
  "The Thor Specialization",
  "The Valkyrie (Glute Specialization)",
  "Arnold Split 6-Day",
];

export async function getPreBuiltTemplates(): Promise<Template[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: string; name: string }>(
    "SELECT id, name FROM templates WHERE is_custom = 0"
  );
  const results: Template[] = [];
  for (const r of rows) {
    const t = await getTemplateWithDays(r.id);
    if (t) results.push(t);
  }
  results.sort((a, b) => {
    const aIdx = FEATURED_TEMPLATES.indexOf(a.name);
    const bIdx = FEATURED_TEMPLATES.indexOf(b.name);
    const aOrder = aIdx >= 0 ? aIdx : FEATURED_TEMPLATES.length;
    const bOrder = bIdx >= 0 ? bIdx : FEATURED_TEMPLATES.length;
    return aOrder - bOrder;
  });
  return results;
}

export async function getCustomTemplates(userId: string): Promise<Template[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM templates WHERE is_custom = 1 AND user_id = ?",
    [userId]
  );
  const results: Template[] = [];
  for (const r of rows) {
    const t = await getTemplateWithDays(r.id);
    if (t) results.push(t);
  }
  return results;
}

export async function createCustomTemplate(
  userId: string,
  name: string,
  days: { dayNumber: number; exerciseIds: string[] }[]
): Promise<Template> {
  const db = getDb();
  const templateId = generateId();
  await db.runAsync(
    "INSERT INTO templates (id, name, meso_type, is_custom, user_id) VALUES (?, ?, ?, 1, ?)",
    [templateId, name, days.length, userId]
  );

  for (const day of days) {
    const dayId = generateId();
    await db.runAsync(
      "INSERT INTO template_days (id, template_id, day_number) VALUES (?, ?, ?)",
      [dayId, templateId, day.dayNumber]
    );

    for (let i = 0; i < day.exerciseIds.length; i++) {
      const teId = generateId();
      await db.runAsync(
        "INSERT INTO template_exercises (id, template_day_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)",
        [teId, dayId, day.exerciseIds[i], i + 1]
      );
    }
  }

  return (await getTemplateWithDays(templateId))!;
}

export async function getUserUnit(userId: string): Promise<'lbs' | 'kg'> {
  const db = getDb();
  const row = await db.getFirstAsync<{ weight_unit: string }>(
    "SELECT weight_unit FROM users WHERE id = ?",
    [userId]
  );
  return (row?.weight_unit as 'lbs' | 'kg') ?? 'lbs';
}

export async function createUser(
  gender: string,
  bodyweight: number,
  experience: string,
  baselineWeights: BaselineWeights,
  weightUnit: 'lbs' | 'kg' = 'lbs'
): Promise<{ id: string; gender: string; bodyweight: number; experience: string; baselines: { category: string; weight: number }[] }> {
  const db = getDb();
  const userId = generateId();
  await db.runAsync(
    "INSERT INTO users (id, gender, bodyweight, experience, weight_unit) VALUES (?, ?, ?, ?, ?)",
    [userId, gender, bodyweight, experience, weightUnit]
  );

  const categories = [
    "QUADS", "GLUTES", "HAMSTRINGS",
    "HORIZONTAL PUSH", "INCLINE PUSH", "VERTICAL PUSH",
    "HORIZONTAL BACK", "VERTICAL BACK",
    "BICEPS", "TRICEPS",
  ];

  const baselines: { category: string; weight: number }[] = [];
  for (const cat of categories) {
    const weight = getCategoryWeight(cat, baselineWeights);
    const id = generateId();
    await db.runAsync(
      "INSERT INTO user_weight_baselines (id, user_id, category, weight) VALUES (?, ?, ?, ?)",
      [id, userId, cat, weight]
    );
    baselines.push({ category: cat, weight });
  }

  return { id: userId, gender, bodyweight, experience, baselines };
}

export async function createWorkoutPlan(
  userId: string,
  templateId: string,
  exerciseSwaps?: Record<string, string>,
  goalType: GoalType = "hypertrophy"
): Promise<WorkoutPlan> {
  const db = getDb();
  const template = await getTemplateWithDays(templateId);
  if (!template) throw new Error("Template not found");

  const baselineRows = await db.getAllAsync<{ category: string; weight: number }>(
    "SELECT category, weight FROM user_weight_baselines WHERE user_id = ?",
    [userId]
  );
  const baselineMap: Record<string, number> = {};
  for (const b of baselineRows) {
    baselineMap[b.category] = b.weight;
  }

  const planId = generateId();
  await db.runAsync(
    "INSERT INTO workout_plans (id, user_id, template_id, current_week, current_day, goal_type) VALUES (?, ?, ?, 1, 1, ?)",
    [planId, userId, templateId, goalType]
  );

  const rir = RIR_SCHEDULE[1];
  const targetSets = 3;

  for (const day of template.days) {
    for (const te of day.exercises) {
      let exerciseId = te.exercise.id;
      let exerciseCategory = te.exercise.category;
      let exerciseEquipment = te.exercise.equipment;

      if (exerciseSwaps && exerciseSwaps[te.exercise.id]) {
        const swappedExercise = await getExerciseById(exerciseSwaps[te.exercise.id]);
        if (swappedExercise) {
          exerciseId = swappedExercise.id;
          exerciseCategory = swappedExercise.category;
          exerciseEquipment = swappedExercise.equipment;
        }
      }

      let targetWeight = baselineMap[exerciseCategory] || 50;
      if (exerciseEquipment === "BODYWEIGHT") {
        targetWeight = 0;
      } else if (exerciseEquipment === "DUMBBELL") {
        // Dumbbell weight is per hand — use 35% of barbell baseline
        targetWeight = Math.round((targetWeight * 0.35) / 5) * 5;
      }

      const logId = generateId();
      // original_exercise_id = the template's exercise (before any in-session swaps)
      const originalExerciseId = te.exercise.id;
      await db.runAsync(
        `INSERT INTO workout_logs (id, workout_plan_id, exercise_id, original_exercise_id, week_number, day_number, target_sets, target_weight, target_rir)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [logId, planId, exerciseId, originalExerciseId, day.dayNumber, targetSets, targetWeight, rir]
      );

      const repTarget = getRepTarget(exerciseCategory, goalType);
      for (let s = 1; s <= targetSets; s++) {
        const setId = generateId();
        await db.runAsync(
          "INSERT INTO set_logs (id, workout_log_id, set_number, target_weight, target_reps) VALUES (?, ?, ?, ?, ?)",
          [setId, logId, s, targetWeight, repTarget]
        );
      }
    }
  }

  return (await getWorkoutPlan(planId))!;
}

export async function getWorkoutPlan(planId: string): Promise<WorkoutPlan | null> {
  const db = getDb();
  const plan = await db.getFirstAsync<{
    id: string; user_id: string; template_id: string; current_week: number; current_day: number; is_active: number; goal_type: string;
  }>("SELECT * FROM workout_plans WHERE id = ?", [planId]);

  if (!plan) return null;

  const template = await getTemplateWithDays(plan.template_id);
  if (!template) return null;

  const logRows = await db.getAllAsync<{
    id: string; exercise_id: string; week_number: number; day_number: number;
    target_sets: number; target_weight: number; target_rir: string;
    soreness_rating: number | null; pump_rating: number | null;
    completed_at: string | null; is_skipped: number;
  }>(
    "SELECT * FROM workout_logs WHERE workout_plan_id = ? ORDER BY week_number ASC, day_number ASC",
    [planId]
  );

  const logs: WorkoutLog[] = [];
  for (const log of logRows) {
    const exercise = await getExerciseById(log.exercise_id);
    const setRows = await db.getAllAsync<{
      id: string; set_number: number; target_weight: number; target_reps: number;
      reps_completed: number | null; weight_used: number | null; completed_at: string | null;
    }>(
      "SELECT * FROM set_logs WHERE workout_log_id = ? ORDER BY set_number ASC",
      [log.id]
    );

    logs.push({
      id: log.id,
      exerciseId: log.exercise_id,
      weekNumber: log.week_number,
      dayNumber: log.day_number,
      targetSets: log.target_sets,
      targetWeight: log.target_weight,
      targetRIR: log.target_rir,
      sorenessRating: log.soreness_rating,
      pumpRating: log.pump_rating,
      completedAt: log.completed_at,
      isSkipped: log.is_skipped === 1,
      exercise: exercise!,
      sets: setRows.map(s => ({
        id: s.id,
        setNumber: s.set_number,
        targetWeight: s.target_weight,
        targetReps: s.target_reps,
        repsCompleted: s.reps_completed,
        weightUsed: s.weight_used,
        completedAt: s.completed_at,
      })),
    });
  }

  return {
    id: plan.id,
    userId: plan.user_id,
    templateId: plan.template_id,
    currentWeek: plan.current_week,
    currentDay: plan.current_day,
    isActive: plan.is_active === 1,
    goalType: (plan.goal_type as GoalType) ?? "hypertrophy",
    template,
    logs,
  };
}

export async function updateSetLog(
  setLogId: string,
  data: { repsCompleted?: number; weightUsed?: number }
): Promise<void> {
  const db = getDb();
  if (data.repsCompleted !== undefined) {
    await db.runAsync("UPDATE set_logs SET reps_completed = ? WHERE id = ?", [data.repsCompleted, setLogId]);
  }
  if (data.weightUsed !== undefined) {
    await db.runAsync("UPDATE set_logs SET weight_used = ? WHERE id = ?", [data.weightUsed, setLogId]);
  }
}

export async function updateSorenessRating(logId: string, sorenessRating: number): Promise<void> {
  const db = getDb();
  await db.runAsync("UPDATE workout_logs SET soreness_rating = ? WHERE id = ?", [sorenessRating, logId]);
}

export async function updatePumpRating(logId: string, pumpRating: number): Promise<void> {
  const db = getDb();
  await db.runAsync("UPDATE workout_logs SET pump_rating = ? WHERE id = ?", [pumpRating, logId]);
}

export async function resetWorkoutDay(planId: string, weekNumber: number, dayNumber: number): Promise<void> {
  const db = getDb();
  const logs = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM workout_logs WHERE workout_plan_id = ? AND week_number = ? AND day_number = ? AND completed_at IS NULL",
    [planId, weekNumber, dayNumber]
  );
  for (const log of logs) {
    await db.runAsync(
      "UPDATE set_logs SET reps_completed = NULL, weight_used = NULL, completed_at = NULL WHERE workout_log_id = ?",
      [log.id]
    );
    await db.runAsync(
      "UPDATE workout_logs SET soreness_rating = NULL WHERE id = ?",
      [log.id]
    );
  }
}

export async function skipSession(
  workoutPlanId: string,
  weekNumber: number,
  dayNumber: number
): Promise<{ allDaysComplete: boolean; isMesoComplete: boolean }> {
  const db = getDb();

  const plan = await db.getFirstAsync<{
    id: string; template_id: string; current_week: number; goal_type: string;
  }>("SELECT id, template_id, current_week, goal_type FROM workout_plans WHERE id = ?", [workoutPlanId]);
  if (!plan) throw new Error("Plan not found");

  const skipGoalType: GoalType = (plan.goal_type as GoalType) ?? "hypertrophy";

  const totalDaysResult = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM template_days WHERE template_id = ?",
    [plan.template_id]
  );
  const totalDays = totalDaysResult?.count || 0;

  const logsToSkip = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM workout_logs WHERE workout_plan_id = ? AND week_number = ? AND day_number = ? AND completed_at IS NULL",
    [workoutPlanId, weekNumber, dayNumber]
  );

  for (const log of logsToSkip) {
    await db.runAsync(
      "UPDATE workout_logs SET completed_at = ?, is_skipped = 1 WHERE id = ?",
      [new Date().toISOString(), log.id]
    );
  }

  const completedDaysResult = await db.getAllAsync<{ day_number: number }>(
    `SELECT DISTINCT day_number FROM workout_logs
     WHERE workout_plan_id = ? AND week_number = ? AND completed_at IS NOT NULL`,
    [workoutPlanId, weekNumber]
  );

  const allDaysComplete = completedDaysResult.length >= totalDays;
  const mesoWeek = ((plan.current_week - 1) % 4) + 1;
  const isDeloadWeek = mesoWeek === 4;
  const isMesoComplete = allDaysComplete && isDeloadWeek;

  if (isMesoComplete) {
    await db.runAsync("UPDATE workout_plans SET is_active = 0 WHERE id = ?", [workoutPlanId]);
  } else if (allDaysComplete) {
    const nextWeek = plan.current_week + 1;
    await db.runAsync(
      "UPDATE workout_plans SET current_week = ?, current_day = 1 WHERE id = ?",
      [nextWeek, workoutPlanId]
    );

    const rir = RIR_SCHEDULE[((nextWeek - 1) % 4) + 1] || "3 RIR";

    const allWeekLogs = await db.getAllAsync<{
      exercise_id: string; day_number: number; target_sets: number;
      target_weight: number; target_rir: string; is_skipped: number;
    }>(
      `SELECT exercise_id, day_number, target_sets, target_weight, target_rir, is_skipped
       FROM workout_logs
       WHERE workout_plan_id = ? AND week_number = ? AND completed_at IS NOT NULL`,
      [workoutPlanId, plan.current_week]
    );

    for (const log of allWeekLogs) {
      let nextSets = log.target_sets;
      let nextWeight = log.target_weight;

      if (log.is_skipped === 0) {
        const exercise = await db.getFirstAsync<{ category: string }>(
          "SELECT category FROM exercises WHERE id = ?",
          [log.exercise_id]
        );
        const avgRepsResult = await db.getFirstAsync<{ avg_reps: number }>(
          `SELECT COALESCE(AVG(sl.reps_completed), 10) as avg_reps
           FROM set_logs sl
           JOIN workout_logs wl ON sl.workout_log_id = wl.id
           WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?
             AND sl.reps_completed IS NOT NULL`,
          [workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
        );
        const sorenessResult = await db.getFirstAsync<{ soreness_rating: number | null }>(
          "SELECT soreness_rating FROM workout_logs WHERE workout_plan_id = ? AND week_number = ? AND exercise_id = ? AND day_number = ?",
          [workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
        );

        const maxWeightResult1 = await db.getFirstAsync<{ max_weight: number }>(
          `SELECT COALESCE(MAX(sl.weight_used), ?) as max_weight
           FROM set_logs sl
           JOIN workout_logs wl ON sl.workout_log_id = wl.id
           WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?
             AND sl.weight_used IS NOT NULL AND sl.weight_used > 0`,
          [log.target_weight, workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
        );
        const actualWeight1 = maxWeightResult1?.max_weight || log.target_weight;

        const targetRepsResult1 = await db.getFirstAsync<{ target_reps: number }>(
          `SELECT COALESCE(MAX(sl.target_reps), 10) as target_reps
           FROM set_logs sl
           JOIN workout_logs wl ON sl.workout_log_id = wl.id
           WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?`,
          [workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
        );
        const repGoal1 = targetRepsResult1?.target_reps ?? 10;

        const targets = calculateNextWeekTargets({
          exerciseId: log.exercise_id,
          category: exercise?.category || "HORIZONTAL PUSH",
          weekNumber: plan.current_week,
          targetSets: log.target_sets,
          targetWeight: log.target_weight,
          actualWeight: actualWeight1,
          targetRIR: log.target_rir,
          repsCompleted: Math.round(avgRepsResult?.avg_reps || 10),
          repGoal: repGoal1,
          sorenessRating: sorenessResult?.soreness_rating ?? 0,
          goalType: skipGoalType,
        });
        nextSets = targets.targetSets;
        nextWeight = targets.targetWeight;
      }

      const logId = generateId();
      await db.runAsync(
        `INSERT INTO workout_logs (id, workout_plan_id, exercise_id, week_number, day_number, target_sets, target_weight, target_rir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [logId, workoutPlanId, log.exercise_id, nextWeek, log.day_number, nextSets, nextWeight, rir]
      );

      const skipRepTarget = getRepTarget(exercise?.category || "HORIZONTAL PUSH", skipGoalType);
      for (let s = 1; s <= nextSets; s++) {
        const setId = generateId();
        await db.runAsync(
          "INSERT INTO set_logs (id, workout_log_id, set_number, target_weight, target_reps) VALUES (?, ?, ?, ?, ?)",
          [setId, logId, s, nextWeight, skipRepTarget]
        );
      }
    }
  } else {
    const nextDayNum = dayNumber < totalDays ? dayNumber + 1 : 1;
    await db.runAsync(
      "UPDATE workout_plans SET current_day = ? WHERE id = ?",
      [nextDayNum, workoutPlanId]
    );
  }

  return { allDaysComplete, isMesoComplete };
}

export interface HistoryEntry {
  date: string;
  routineName: string;
  weekNumber: number;
  dayNumber: number;
  totalTonnage: number;
  isSkipped: boolean;
  exercises: {
    exerciseName: string;
    sets: { setNumber: number; weight: number; reps: number }[];
  }[];
}

export async function getCompletedWorkoutHistory(): Promise<HistoryEntry[]> {
  const db = getDb();

  const sessions = await db.getAllAsync<{
    workout_plan_id: string;
    week_number: number;
    day_number: number;
    completed_at: string;
    is_skipped: number;
    template_name: string;
  }>(
    `SELECT DISTINCT wl.workout_plan_id, wl.week_number, wl.day_number,
            MAX(wl.completed_at) as completed_at,
            MAX(wl.is_skipped) as is_skipped,
            t.name as template_name
     FROM workout_logs wl
     JOIN workout_plans wp ON wl.workout_plan_id = wp.id
     JOIN templates t ON wp.template_id = t.id
     WHERE wl.completed_at IS NOT NULL
     GROUP BY wl.workout_plan_id, wl.week_number, wl.day_number
     ORDER BY MAX(wl.completed_at) DESC`
  );

  const history: HistoryEntry[] = [];

  for (const session of sessions) {
    const exerciseLogs = await db.getAllAsync<{
      log_id: string; exercise_name: string; is_skipped: number;
    }>(
      `SELECT wl.id as log_id, e.name as exercise_name, wl.is_skipped
       FROM workout_logs wl
       JOIN exercises e ON wl.exercise_id = e.id
       WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.day_number = ? AND wl.completed_at IS NOT NULL
       ORDER BY wl.id`,
      [session.workout_plan_id, session.week_number, session.day_number]
    );

    let totalTonnage = 0;
    const exercises: HistoryEntry["exercises"] = [];

    for (const ex of exerciseLogs) {
      const setRows = await db.getAllAsync<{
        set_number: number; weight_used: number | null; reps_completed: number | null;
      }>(
        `SELECT set_number, weight_used, reps_completed FROM set_logs
         WHERE workout_log_id = ? AND weight_used IS NOT NULL AND reps_completed IS NOT NULL
         ORDER BY set_number ASC`,
        [ex.log_id]
      );

      const sets = setRows.map(s => {
        const w = s.weight_used || 0;
        const r = s.reps_completed || 0;
        totalTonnage += w * r;
        return { setNumber: s.set_number, weight: w, reps: r };
      });

      exercises.push({ exerciseName: ex.exercise_name, sets });
    }

    const allSkipped = exerciseLogs.every(e => e.is_skipped === 1);

    history.push({
      date: session.completed_at,
      routineName: session.template_name,
      weekNumber: session.week_number,
      dayNumber: session.day_number,
      totalTonnage,
      isSkipped: allSkipped,
      exercises,
    });
  }

  return history;
}

async function applyExerciseSwapToLog(db: any, logId: string, newExerciseId: string): Promise<WorkoutLog | null> {
  await db.runAsync("UPDATE workout_logs SET exercise_id = ? WHERE id = ?", [newExerciseId, logId]);
  await db.runAsync(
    "UPDATE set_logs SET reps_completed = NULL, weight_used = NULL, completed_at = NULL WHERE workout_log_id = ?",
    [logId]
  );

  const exercise = await getExerciseById(newExerciseId);
  const setRows = await db.getAllAsync<{
    id: string; set_number: number; target_weight: number; target_reps: number;
    reps_completed: number | null; weight_used: number | null; completed_at: string | null;
  }>("SELECT * FROM set_logs WHERE workout_log_id = ? ORDER BY set_number ASC", [logId]);

  const updatedLog = await db.getFirstAsync<{
    id: string; exercise_id: string; week_number: number; day_number: number;
    target_sets: number; target_weight: number; target_rir: string;
    soreness_rating: number | null; pump_rating: number | null;
    completed_at: string | null; is_skipped: number;
  }>("SELECT * FROM workout_logs WHERE id = ?", [logId]);

  if (!updatedLog || !exercise) return null;

  return {
    id: updatedLog.id,
    exerciseId: updatedLog.exercise_id,
    weekNumber: updatedLog.week_number,
    dayNumber: updatedLog.day_number,
    targetSets: updatedLog.target_sets,
    targetWeight: updatedLog.target_weight,
    targetRIR: updatedLog.target_rir,
    sorenessRating: updatedLog.soreness_rating,
    pumpRating: updatedLog.pump_rating,
    completedAt: updatedLog.completed_at,
    isSkipped: updatedLog.is_skipped === 1,
    exercise,
    sets: setRows.map(s => ({
      id: s.id,
      setNumber: s.set_number,
      targetWeight: s.target_weight,
      targetReps: s.target_reps,
      repsCompleted: s.reps_completed,
      weightUsed: s.weight_used,
      completedAt: s.completed_at,
    })),
  };
}

export async function swapExercise(
  logId: string,
  newExerciseId: string,
  scope: 'once' | 'permanent' = 'once'
): Promise<WorkoutLog | null> {
  const db = getDb();
  const log = await db.getFirstAsync<{
    id: string; workout_plan_id: string; day_number: number; original_exercise_id: string | null;
  }>("SELECT id, workout_plan_id, day_number, original_exercise_id FROM workout_logs WHERE id = ?", [logId]);
  if (!log) return null;

  if (scope === 'permanent' && log.original_exercise_id) {
    // Update all future uncompleted logs for the same exercise slot and mark them permanent
    await db.runAsync(
      `UPDATE workout_logs SET exercise_id = ?, is_permanent_swap = 1
       WHERE workout_plan_id = ? AND day_number = ? AND original_exercise_id = ?
       AND completed_at IS NULL AND id != ?`,
      [newExerciseId, log.workout_plan_id, log.day_number, log.original_exercise_id, logId]
    );
  }

  // Mark this log's swap scope
  await db.runAsync(
    "UPDATE workout_logs SET is_permanent_swap = ? WHERE id = ?",
    [scope === 'permanent' ? 1 : 0, logId]
  );

  return applyExerciseSwapToLog(db, logId, newExerciseId);
}

export async function resetExerciseToOriginal(logId: string): Promise<WorkoutLog | null> {
  const db = getDb();
  const log = await db.getFirstAsync<{ original_exercise_id: string | null }>(
    "SELECT original_exercise_id FROM workout_logs WHERE id = ?", [logId]
  );
  if (!log?.original_exercise_id) return null;
  return applyExerciseSwapToLog(db, logId, log.original_exercise_id);
}

export async function resetAllExercisesToOriginal(planId: string): Promise<void> {
  const db = getDb();
  // Restore all logs that have a known original and haven't been completed yet
  await db.runAsync(
    `UPDATE workout_logs SET exercise_id = original_exercise_id
     WHERE workout_plan_id = ? AND original_exercise_id IS NOT NULL AND completed_at IS NULL`,
    [planId]
  );
}

export async function completeWorkout(
  workoutPlanId: string,
  dayNumber: number,
  exercisesData: {
    logId: string;
    exerciseId: string;
    exerciseName?: string;
    category: string;
    targetSets: number;
    targetWeight: number;
    targetRIR: string;
    sorenessRating: number;
    /** Pump quality 1–5 collected from the post-session modal */
    pumpRating?: number | null;
    sets: { setLogId: string; repsCompleted: number; weightUsed: number; targetReps?: number }[];
  }[]
): Promise<{
  nextWeekTargets: any[];
  totalVolume: number;
  weekNumber: number;
  dayNumber: number;
  allDaysComplete: boolean;
  isMesoComplete: boolean;
}> {
  const db = getDb();

  const plan = await db.getFirstAsync<{
    id: string; template_id: string; current_week: number; goal_type: string;
  }>("SELECT id, template_id, current_week, goal_type FROM workout_plans WHERE id = ?", [workoutPlanId]);

  if (!plan) throw new Error("Plan not found");

  const planGoalType: GoalType = (plan.goal_type as GoalType) ?? "hypertrophy";

  const totalDaysResult = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM template_days WHERE template_id = ?",
    [plan.template_id]
  );
  const totalDays = totalDaysResult?.count || 0;

  const nextWeekTargets: any[] = [];
  let totalVolume = 0;

  for (let i = 0; i < exercisesData.length; i++) {
    const ex = exercisesData[i];
    for (const set of ex.sets) {
      await db.runAsync(
        "UPDATE set_logs SET reps_completed = ?, weight_used = ?, completed_at = ? WHERE id = ?",
        [set.repsCompleted, set.weightUsed, new Date().toISOString(), set.setLogId]
      );
      totalVolume += set.weightUsed * set.repsCompleted;
    }

    await db.runAsync(
      "UPDATE workout_logs SET soreness_rating = ?, pump_rating = ?, completed_at = ? WHERE id = ?",
      [ex.sorenessRating, ex.pumpRating ?? null, new Date().toISOString(), ex.logId]
    );

    const avgReps = ex.sets.length > 0
      ? Math.round(ex.sets.reduce((sum, s) => sum + s.repsCompleted, 0) / ex.sets.length)
      : 0;

    const maxActualWeight = ex.sets.length > 0
      ? Math.max(...ex.sets.map((s) => s.weightUsed).filter((w) => w > 0))
      : 0;
    const actualWeight2 = maxActualWeight > 0 ? maxActualWeight : ex.targetWeight;

    // Use the actual target_reps from the set logs rather than a hardcoded value,
    // so exercises with different rep targets (e.g. 5-rep strength work) progress correctly.
    const repGoal2 = ex.sets.length > 0
      ? Math.max(...ex.sets.map((s) => s.targetReps ?? 10))
      : 10;

    const nextTargets = calculateNextWeekTargets({
      exerciseId: ex.exerciseId,
      category: ex.category,
      weekNumber: plan.current_week,
      targetSets: ex.targetSets,
      targetWeight: ex.targetWeight,
      actualWeight: actualWeight2,
      targetRIR: ex.targetRIR,
      repsCompleted: avgReps,
      repGoal: repGoal2,
      sorenessRating: ex.sorenessRating,
      pumpRating: ex.pumpRating ?? null,
      goalType: planGoalType,
    });
    nextWeekTargets.push({
      ...nextTargets,
      exerciseName: ex.exerciseName ?? `Exercise ${i + 1}`,
      thisWeekWeight: actualWeight2,
      thisWeekSets: ex.sets.filter(s => s.weightUsed > 0).length,
      thisWeekReps: avgReps,
      thisWeekRIR: ex.targetRIR,
    });
  }

  const completedDaysResult = await db.getAllAsync<{ day_number: number }>(
    `SELECT DISTINCT day_number FROM workout_logs
     WHERE workout_plan_id = ? AND week_number = ? AND completed_at IS NOT NULL`,
    [workoutPlanId, plan.current_week]
  );

  const allDaysComplete = completedDaysResult.length >= totalDays;

  const mesoWeek = ((plan.current_week - 1) % 4) + 1;
  const isDeloadWeek = mesoWeek === 4;
  const isMesoComplete = allDaysComplete && isDeloadWeek;

  if (isMesoComplete) {
    await db.runAsync(
      "UPDATE workout_plans SET is_active = 0 WHERE id = ?",
      [workoutPlanId]
    );
  } else if (allDaysComplete) {
    const nextWeek = plan.current_week + 1;
    await db.runAsync(
      "UPDATE workout_plans SET current_week = ?, current_day = 1 WHERE id = ?",
      [nextWeek, workoutPlanId]
    );

    const rir = RIR_SCHEDULE[((nextWeek - 1) % 4) + 1] || "3 RIR";

    const allWeekLogs = await db.getAllAsync<{
      exercise_id: string; original_exercise_id: string | null;
      is_permanent_swap: number; day_number: number; target_sets: number;
      target_weight: number; target_rir: string; soreness_rating: number | null;
      pump_rating: number | null; category: string;
    }>(
      `SELECT wl.exercise_id, wl.original_exercise_id, wl.is_permanent_swap,
              wl.day_number, wl.target_sets, wl.target_weight,
              wl.target_rir, wl.soreness_rating, wl.pump_rating, e.category
       FROM workout_logs wl
       JOIN exercises e ON wl.exercise_id = e.id
       WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.completed_at IS NOT NULL`,
      [workoutPlanId, plan.current_week]
    );

    for (const log of allWeekLogs) {
      const avgRepsResult = await db.getFirstAsync<{ avg_reps: number }>(
        `SELECT COALESCE(AVG(sl.reps_completed), 10) as avg_reps
         FROM set_logs sl
         JOIN workout_logs wl ON sl.workout_log_id = wl.id
         WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?
           AND sl.reps_completed IS NOT NULL`,
        [workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
      );
      const avgReps = Math.round(avgRepsResult?.avg_reps || 10);

      const maxWeightResult3 = await db.getFirstAsync<{ max_weight: number }>(
        `SELECT COALESCE(MAX(sl.weight_used), ?) as max_weight
         FROM set_logs sl
         JOIN workout_logs wl ON sl.workout_log_id = wl.id
         WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?
           AND sl.weight_used IS NOT NULL AND sl.weight_used > 0`,
        [log.target_weight, workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
      );
      const actualWeight3 = maxWeightResult3?.max_weight || log.target_weight;

      const targetRepsResult3 = await db.getFirstAsync<{ target_reps: number }>(
        `SELECT COALESCE(MAX(sl.target_reps), 10) as target_reps
         FROM set_logs sl
         JOIN workout_logs wl ON sl.workout_log_id = wl.id
         WHERE wl.workout_plan_id = ? AND wl.week_number = ? AND wl.exercise_id = ? AND wl.day_number = ?`,
        [workoutPlanId, plan.current_week, log.exercise_id, log.day_number]
      );
      const repGoal3 = targetRepsResult3?.target_reps ?? 10;

      const targets = calculateNextWeekTargets({
        exerciseId: log.exercise_id,
        category: log.category,
        weekNumber: plan.current_week,
        targetSets: log.target_sets,
        targetWeight: log.target_weight,
        actualWeight: actualWeight3,
        targetRIR: log.target_rir,
        repsCompleted: avgReps,
        repGoal: repGoal3,
        sorenessRating: log.soreness_rating ?? 0,
        pumpRating: log.pump_rating ?? null,
        goalType: planGoalType,
      });

      const logId = generateId();
      // For one-off swaps: next week reverts to the original exercise.
      // For permanent swaps (or no swap): carry the current exercise forward.
      const nextExerciseId = (log.is_permanent_swap === 0 && log.original_exercise_id)
        ? log.original_exercise_id
        : targets.exerciseId;
      // Carry original_exercise_id forward so future weeks can still reset to template
      const nextOriginalId = log.original_exercise_id ?? nextExerciseId;

      await db.runAsync(
        `INSERT INTO workout_logs (id, workout_plan_id, exercise_id, original_exercise_id, week_number, day_number, target_sets, target_weight, target_rir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [logId, workoutPlanId, nextExerciseId, nextOriginalId, nextWeek, log.day_number, targets.targetSets, targets.targetWeight, rir]
      );

      for (let s = 1; s <= targets.targetSets; s++) {
        const setId = generateId();
        await db.runAsync(
          "INSERT INTO set_logs (id, workout_log_id, set_number, target_weight, target_reps) VALUES (?, ?, ?, ?, ?)",
          [setId, logId, s, targets.targetWeight, targets.targetReps]
        );
      }
    }
  } else {
    const nextDayNum = dayNumber < totalDays ? dayNumber + 1 : 1;
    await db.runAsync(
      "UPDATE workout_plans SET current_day = ? WHERE id = ?",
      [nextDayNum, workoutPlanId]
    );
  }

  return {
    nextWeekTargets,
    totalVolume,
    weekNumber: plan.current_week,
    dayNumber,
    allDaysComplete,
    isMesoComplete,
  };
}

export interface MesoExerciseProgress {
  exerciseId: string;
  exerciseName: string;
  category: string;
  week1Weight: number;
  peakWeight: number;
  weightGain: number;
}

export interface MesoStats {
  totalVolume: number;
  totalSessions: number;
  exerciseProgress: MesoExerciseProgress[];
}

export async function getMesoStats(planId: string): Promise<MesoStats> {
  const db = getDb();

  const volumeResult = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(sl.weight_used * sl.reps_completed), 0) as total
     FROM set_logs sl
     JOIN workout_logs wl ON sl.workout_log_id = wl.id
     WHERE wl.workout_plan_id = ? AND sl.weight_used IS NOT NULL AND sl.reps_completed IS NOT NULL`,
    [planId]
  );

  const sessionsResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT week_number || '-' || day_number) as count
     FROM workout_logs WHERE workout_plan_id = ? AND completed_at IS NOT NULL`,
    [planId]
  );

  const exerciseRows = await db.getAllAsync<{
    exercise_id: string; name: string; category: string;
    week_number: number; target_weight: number;
  }>(
    `SELECT wl.exercise_id, e.name, e.category, wl.week_number, wl.target_weight
     FROM workout_logs wl
     JOIN exercises e ON wl.exercise_id = e.id
     WHERE wl.workout_plan_id = ? AND wl.completed_at IS NOT NULL
     ORDER BY wl.exercise_id, wl.week_number`,
    [planId]
  );

  const exerciseMap = new Map<string, { name: string; category: string; weeks: Map<number, number> }>();
  for (const row of exerciseRows) {
    if (!exerciseMap.has(row.exercise_id)) {
      exerciseMap.set(row.exercise_id, { name: row.name, category: row.category, weeks: new Map() });
    }
    const entry = exerciseMap.get(row.exercise_id)!;
    const existing = entry.weeks.get(row.week_number) || 0;
    if (row.target_weight > existing) {
      entry.weeks.set(row.week_number, row.target_weight);
    }
  }

  const exerciseProgress: MesoExerciseProgress[] = [];
  for (const [exerciseId, data] of exerciseMap) {
    const sortedWeeks = [...data.weeks.entries()].sort((a, b) => a[0] - b[0]);
    if (sortedWeeks.length < 2) continue;
    const week1Weight = sortedWeeks[0][1];
    const nonDeloadWeeks = sortedWeeks.filter(([w]) => ((w - 1) % 4) + 1 !== 4);
    const peakWeight = nonDeloadWeeks.length > 0
      ? Math.max(...nonDeloadWeeks.map(([, w]) => w))
      : Math.max(...sortedWeeks.map(([, w]) => w));
    const weightGain = peakWeight - week1Weight;
    if (weightGain > 0) {
      exerciseProgress.push({
        exerciseId,
        exerciseName: data.name,
        category: data.category,
        week1Weight,
        peakWeight,
        weightGain,
      });
    }
  }

  exerciseProgress.sort((a, b) => b.weightGain - a.weightGain);

  return {
    totalVolume: volumeResult?.total || 0,
    totalSessions: sessionsResult?.count || 0,
    exerciseProgress,
  };
}

export interface ExerciseWeightPoint {
  weekNumber: number;
  /** Best weight used in any set this week */
  maxWeight: number;
}

export interface ExerciseWeightHistory {
  exerciseId: string;
  exerciseName: string;
  category: string;
  dataPoints: ExerciseWeightPoint[];
}

export interface MuscleVolumeData {
  category: string;
  /** Total sets performed this current meso week */
  setsThisWeek: number;
  /** Total sets this entire current meso (all completed weeks) */
  setsMeso: number;
}

export async function getProgressData(planId: string): Promise<{
  exerciseHistory: ExerciseWeightHistory[];
  muscleVolume: MuscleVolumeData[];
  currentWeek: number;
  goalType: GoalType;
}> {
  const db = getDb();

  const plan = await db.getFirstAsync<{ current_week: number; goal_type: string }>(
    "SELECT current_week, goal_type FROM workout_plans WHERE id = ?",
    [planId]
  );
  const currentWeek = plan?.current_week ?? 1;
  const goalType = (plan?.goal_type as GoalType) ?? "hypertrophy";

  // --- Exercise weight history ---
  const weightRows = await db.getAllAsync<{
    exercise_id: string; exercise_name: string; category: string;
    week_number: number; max_weight: number;
  }>(
    `SELECT wl.exercise_id, e.name as exercise_name, e.category,
            wl.week_number,
            COALESCE(MAX(sl.weight_used), wl.target_weight) as max_weight
     FROM workout_logs wl
     JOIN exercises e ON wl.exercise_id = e.id
     LEFT JOIN set_logs sl ON sl.workout_log_id = wl.id AND sl.weight_used > 0
     WHERE wl.workout_plan_id = ? AND wl.completed_at IS NOT NULL AND wl.is_skipped = 0
     GROUP BY wl.exercise_id, wl.week_number
     ORDER BY wl.exercise_id, wl.week_number ASC`,
    [planId]
  );

  const exerciseMap = new Map<string, ExerciseWeightHistory>();
  for (const row of weightRows) {
    if (!exerciseMap.has(row.exercise_id)) {
      exerciseMap.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        category: row.category,
        dataPoints: [],
      });
    }
    const entry = exerciseMap.get(row.exercise_id)!;
    // Merge weeks (keep highest weight per week)
    const existing = entry.dataPoints.find(p => p.weekNumber === row.week_number);
    if (existing) {
      if (row.max_weight > existing.maxWeight) existing.maxWeight = row.max_weight;
    } else {
      entry.dataPoints.push({ weekNumber: row.week_number, maxWeight: row.max_weight });
    }
  }
  const exerciseHistory = [...exerciseMap.values()].filter(e => e.dataPoints.length >= 1);

  // --- Muscle volume (sets per category this week + this meso) ---
  const volumeRows = await db.getAllAsync<{
    category: string; week_number: number; set_count: number;
  }>(
    `SELECT e.category, wl.week_number, COUNT(sl.id) as set_count
     FROM workout_logs wl
     JOIN exercises e ON wl.exercise_id = e.id
     JOIN set_logs sl ON sl.workout_log_id = wl.id
     WHERE wl.workout_plan_id = ? AND wl.completed_at IS NOT NULL AND wl.is_skipped = 0
       AND sl.reps_completed IS NOT NULL AND sl.reps_completed > 0
     GROUP BY e.category, wl.week_number`,
    [planId]
  );

  const muscleMap = new Map<string, MuscleVolumeData>();
  for (const row of volumeRows) {
    if (!muscleMap.has(row.category)) {
      muscleMap.set(row.category, { category: row.category, setsThisWeek: 0, setsMeso: 0 });
    }
    const entry = muscleMap.get(row.category)!;
    entry.setsMeso += row.set_count;
    if (row.week_number === currentWeek) {
      entry.setsThisWeek += row.set_count;
    }
  }
  const muscleVolume = [...muscleMap.values()].sort((a, b) => b.setsMeso - a.setsMeso);

  return { exerciseHistory, muscleVolume, currentWeek, goalType };
}

export async function createWorkoutPlanFromPrevious(
  oldPlanId: string
): Promise<WorkoutPlan> {
  const db = getDb();

  const oldPlan = await db.getFirstAsync<{
    id: string; user_id: string; template_id: string;
  }>("SELECT id, user_id, template_id FROM workout_plans WHERE id = ?", [oldPlanId]);
  if (!oldPlan) throw new Error("Old plan not found");

  // Use actual lifted weights (not targets) from weeks 2-3 of the meso for best accuracy
  const progressionWeeks = await db.getAllAsync<{
    exercise_id: string; category: string; best_weight: number; week_number: number;
  }>(
    `SELECT wl.exercise_id, e.category, wl.week_number,
            COALESCE(MAX(sl.weight_used), wl.target_weight) as best_weight
     FROM workout_logs wl
     JOIN exercises e ON wl.exercise_id = e.id
     LEFT JOIN set_logs sl ON sl.workout_log_id = wl.id AND sl.weight_used > 0
     WHERE wl.workout_plan_id = ? AND wl.completed_at IS NOT NULL AND wl.is_skipped = 0
     AND (((wl.week_number - 1) % 4) + 1) IN (2, 3)
     GROUP BY wl.exercise_id, wl.week_number
     ORDER BY best_weight DESC`,
    [oldPlanId]
  );

  const bestWeights = new Map<string, { weight: number; category: string }>();
  for (const row of progressionWeeks) {
    const existing = bestWeights.get(row.exercise_id);
    if (!existing || row.best_weight > existing.weight) {
      bestWeights.set(row.exercise_id, { weight: row.best_weight, category: row.category });
    }
  }

  const categories = [
    "QUADS", "GLUTES", "HAMSTRINGS",
    "HORIZONTAL PUSH", "INCLINE PUSH", "VERTICAL PUSH",
    "HORIZONTAL BACK", "VERTICAL BACK",
    "BICEPS", "TRICEPS",
  ];
  const categoryBest = new Map<string, number>();
  for (const [, data] of bestWeights) {
    const existing = categoryBest.get(data.category) || 0;
    if (data.weight > existing) {
      categoryBest.set(data.category, data.weight);
    }
  }

  for (const cat of categories) {
    if (categoryBest.has(cat)) {
      await db.runAsync(
        `INSERT OR REPLACE INTO user_weight_baselines (id, user_id, category, weight)
         VALUES (
           COALESCE((SELECT id FROM user_weight_baselines WHERE user_id = ? AND category = ?), ?),
           ?, ?, ?
         )`,
        [oldPlan.user_id, cat, generateId(), oldPlan.user_id, cat, categoryBest.get(cat)!]
      );
    }
  }

  return createWorkoutPlan(oldPlan.user_id, oldPlan.template_id);
}

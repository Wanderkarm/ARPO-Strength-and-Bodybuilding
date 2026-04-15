import type { Exercise } from "@/lib/local-db";
import type { GymType } from "@/lib/local-db";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Priority = "skip" | "maintain" | "medium" | "high";

export type MusclePriorities = Record<string, Priority>;

export interface GeneratedDay {
  dayNumber: number;
  name: string;
  exerciseIds: string[];
}

// ─── Muscle group → exercise category mapping ────────────────────────────────
// User sees friendly muscle names; internally these map to exercise categories.

export const MUSCLE_GROUPS: {
  key: string;
  label: string;
  categories: string[];
  defaultPriority: Priority;
}[] = [
  { key: "chest",      label: "Chest",       categories: ["HORIZONTAL PUSH", "INCLINE PUSH"], defaultPriority: "medium" },
  { key: "back",       label: "Back",        categories: ["VERTICAL BACK", "HORIZONTAL BACK"],  defaultPriority: "medium" },
  { key: "shoulders",  label: "Shoulders",   categories: ["VERTICAL PUSH"],                     defaultPriority: "medium" },
  { key: "rearDelts",  label: "Rear Delts",  categories: ["REAR DELTS"],                        defaultPriority: "maintain" },
  { key: "traps",      label: "Traps",       categories: ["TRAPS"],                             defaultPriority: "maintain" },
  { key: "triceps",    label: "Triceps",     categories: ["TRICEPS"],                           defaultPriority: "medium" },
  { key: "biceps",     label: "Biceps",      categories: ["BICEPS"],                            defaultPriority: "medium" },
  { key: "quads",      label: "Quads",       categories: ["QUADS"],                             defaultPriority: "medium" },
  { key: "hamstrings", label: "Hamstrings",  categories: ["HAMSTRINGS"],                        defaultPriority: "medium" },
  { key: "glutes",     label: "Glutes",      categories: ["GLUTES"],                            defaultPriority: "medium" },
  { key: "calves",     label: "Calves",      categories: ["CALVES"],                            defaultPriority: "maintain" },
  { key: "abs",        label: "Abs",         categories: ["ABS"],                               defaultPriority: "maintain" },
];

// ─── Split templates ─────────────────────────────────────────────────────────
// Each split defines which muscle group keys appear on each training day.
// Days with the same muscle key will use offset exercise selection for variety.

const SPLITS: Record<number, { name: string; muscleKeys: string[] }[]> = {
  3: [
    { name: "Full Body A", muscleKeys: ["chest", "back", "quads", "biceps", "abs"] },
    { name: "Full Body B", muscleKeys: ["shoulders", "rearDelts", "hamstrings", "glutes", "triceps"] },
    { name: "Full Body C", muscleKeys: ["chest", "back", "quads", "calves", "traps"] },
  ],
  4: [
    { name: "Upper A", muscleKeys: ["chest", "back", "shoulders", "biceps"] },
    { name: "Lower A", muscleKeys: ["quads", "hamstrings", "glutes", "calves"] },
    { name: "Upper B", muscleKeys: ["chest", "back", "rearDelts", "triceps", "traps"] },
    { name: "Lower B", muscleKeys: ["quads", "hamstrings", "glutes", "abs"] },
  ],
  5: [
    { name: "Push",  muscleKeys: ["chest", "shoulders", "triceps"] },
    { name: "Pull",  muscleKeys: ["back", "rearDelts", "biceps"] },
    { name: "Legs",  muscleKeys: ["quads", "hamstrings", "glutes", "calves"] },
    { name: "Upper", muscleKeys: ["chest", "back", "traps", "biceps", "triceps"] },
    { name: "Lower", muscleKeys: ["quads", "hamstrings", "glutes", "abs"] },
  ],
  6: [
    { name: "Push A", muscleKeys: ["chest", "shoulders", "triceps"] },
    { name: "Pull A", muscleKeys: ["back", "biceps"] },
    { name: "Legs A", muscleKeys: ["quads", "hamstrings", "glutes"] },
    { name: "Push B", muscleKeys: ["chest", "rearDelts", "triceps"] },
    { name: "Pull B", muscleKeys: ["back", "traps", "biceps"] },
    { name: "Legs B", muscleKeys: ["quads", "hamstrings", "glutes", "calves", "abs"] },
  ],
};

// ─── Exercise count per priority per category in a day ───────────────────────

function exerciseCountForPriority(priority: Priority, categoryIndex: number): number {
  switch (priority) {
    case "skip":     return 0;
    case "maintain": return categoryIndex === 0 ? 1 : 0; // only primary category
    case "medium":   return 1;                            // one per category
    case "high":     return categoryIndex === 0 ? 2 : 1; // extra from primary category
  }
}

// ─── Pick an exercise from a category with gym-type + offset variety ─────────

function pickExercise(
  allExercises: Exercise[],
  category: string,
  gymType: GymType,
  usedInDay: Set<string>,
  offset: number
): Exercise | null {
  const pool = allExercises.filter(
    (e) =>
      e.category === category &&
      (gymType === "GYM" ||
        e.equipment === "DUMBBELL" ||
        e.equipment === "BODYWEIGHT") &&
      !usedInDay.has(e.id)
  );
  if (!pool.length) return null;
  return pool[offset % pool.length];
}

// ─── Main generation function ─────────────────────────────────────────────────

export function autoGenerateTemplate(
  daysPerWeek: number,
  priorities: MusclePriorities,
  allExercises: Exercise[],
  gymType: GymType
): GeneratedDay[] {
  const splitDays = SPLITS[daysPerWeek] ?? SPLITS[4];

  // Track how many times each muscle group key has appeared across days
  // so we can offset exercise selection and get variety
  const muscleAppearanceCount: Record<string, number> = {};

  return splitDays.map((splitDay, dayIndex) => {
    const usedInDay = new Set<string>();
    const exerciseIds: string[] = [];

    for (const muscleKey of splitDay.muscleKeys) {
      const priority = priorities[muscleKey] ?? "medium";
      if (priority === "skip") continue;

      const group = MUSCLE_GROUPS.find((g) => g.key === muscleKey);
      if (!group) continue;

      const offset = muscleAppearanceCount[muscleKey] ?? 0;

      group.categories.forEach((category, catIdx) => {
        const count = exerciseCountForPriority(priority, catIdx);
        for (let i = 0; i < count; i++) {
          const ex = pickExercise(
            allExercises,
            category,
            gymType,
            usedInDay,
            offset + i
          );
          if (ex) {
            exerciseIds.push(ex.id);
            usedInDay.add(ex.id);
          }
        }
      });

      muscleAppearanceCount[muscleKey] = offset + 1;
    }

    return {
      dayNumber: dayIndex + 1,
      name: splitDay.name,
      exerciseIds,
    };
  });
}

// ─── Default priorities ───────────────────────────────────────────────────────

export function getDefaultPriorities(): MusclePriorities {
  return Object.fromEntries(
    MUSCLE_GROUPS.map((g) => [g.key, g.defaultPriority])
  );
}

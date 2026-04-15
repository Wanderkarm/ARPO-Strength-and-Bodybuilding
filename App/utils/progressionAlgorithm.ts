const UPPER_BODY_CATEGORIES = [
  "HORIZONTAL PUSH", "INCLINE PUSH", "VERTICAL PUSH",
  "HORIZONTAL BACK", "VERTICAL BACK",
  "BICEPS", "TRICEPS", "CHEST", "BACK", "SHOULDERS", "TRAPS", "REAR DELTS",
];
const LOWER_BODY_CATEGORIES = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS"];

const COMPOUND_CATEGORIES = [
  "QUADS", "GLUTES", "HAMSTRINGS",
  "HORIZONTAL PUSH", "INCLINE PUSH", "VERTICAL PUSH",
  "HORIZONTAL BACK", "VERTICAL BACK",
];

const ISOLATION_CATEGORIES = [
  "BICEPS", "TRICEPS", "CALVES", "ABS", "TRAPS", "REAR DELTS",
  "CHEST", "BACK", "SHOULDERS",
];

export type GoalType = "strength" | "powerbuilding" | "hypertrophy";

const RIR_SCHEDULE_HYPERTROPHY: Record<number, string> = {
  1: "3 RIR", 2: "2 RIR", 3: "1 RIR", 4: "Deload",
};

const RIR_SCHEDULE_POWERBUILDING: Record<number, string> = {
  1: "3 RIR", 2: "2 RIR", 3: "1 RIR", 4: "Deload",
};

const RIR_SCHEDULE_STRENGTH: Record<number, string> = {
  1: "2 RIR", 2: "1 RIR", 3: "0 RIR", 4: "Deload",
};

function getRIRSchedule(goal: GoalType): Record<number, string> {
  if (goal === "strength") return RIR_SCHEDULE_STRENGTH;
  if (goal === "powerbuilding") return RIR_SCHEDULE_POWERBUILDING;
  return RIR_SCHEDULE_HYPERTROPHY;
}

export function getRepTarget(category: string, goal: GoalType): number {
  const cat = category.toUpperCase();
  const isCompound = COMPOUND_CATEGORIES.includes(cat);
  if (goal === "strength") return isCompound ? 4 : 6;
  if (goal === "powerbuilding") return isCompound ? 6 : 10;
  return isCompound ? 10 : 12;
}

interface WorkoutResult {
  exerciseId: string;
  category: string;
  weekNumber: number;
  targetSets: number;
  targetWeight: number;
  actualWeight: number;
  targetRIR: string;
  repsCompleted: number | null;
  repGoal: number;
  sorenessRating: number | null;
  /** Pump quality 1–5: 1=no pump, 3=sweet spot, 5=extreme/painful pump */
  pumpRating?: number | null;
  goalType?: GoalType;
}

interface NextWeekTargets {
  exerciseId: string;
  weekNumber: number;
  targetSets: number;
  targetWeight: number;
  targetReps: number;
  targetRIR: string;
}

export function calculateNextWeekTargets(result: WorkoutResult): NextWeekTargets {
  const goal: GoalType = result.goalType ?? "hypertrophy";
  const nextWeek = result.weekNumber + 1;
  const cat = result.category.toUpperCase();
  const isLowerBody = LOWER_BODY_CATEGORIES.includes(cat);
  const soreness = result.sorenessRating ?? 0;
  const rirSchedule = getRIRSchedule(goal);
  const nextRepTarget = getRepTarget(cat, goal);

  // Deload week
  if (nextWeek === 5 || (nextWeek > 4 && nextWeek % 4 === 1)) {
    return {
      exerciseId: result.exerciseId,
      weekNumber: nextWeek,
      targetSets: Math.max(2, Math.ceil(result.targetSets / 2)),
      targetWeight: Math.round((result.actualWeight * 0.85) / 2.5) * 2.5,
      targetReps: nextRepTarget,
      targetRIR: "Deload",
    };
  }

  // Base next weight = what they actually lifted
  let nextWeight = result.actualWeight;
  let nextSets = result.targetSets;

  // Combined pump + soreness volume signal
  // sorenessRating: -2 (very fatigued) → +2 (very fresh)
  // pumpRating: 1 (no pump) → 5 (extreme/painful pump)
  const pump = result.pumpRating ?? null;

  type VolumeSignal = "add" | "hold" | "reduce";
  let volumeSignal: VolumeSignal = "hold";

  if (pump !== null) {
    // Pump-informed decision (backed by Hirono et al. 2022, Schoenfeld & Contreras 2014)
    if (pump <= 2 && soreness >= 0) {
      // Under-stimulated + well-recovered → add volume
      volumeSignal = "add";
    } else if (pump >= 5 || soreness <= -2) {
      // Over-stimulated or severely fatigued → reduce volume
      volumeSignal = "reduce";
    } else if (pump === 4 && soreness <= -1) {
      // High pump + some fatigue → err on side of recovery
      volumeSignal = "reduce";
    } else {
      // Sweet spot (pump 3-4, soreness -1 to +2) → maintain
      volumeSignal = "hold";
    }
  } else {
    // Fallback: soreness-only (original logic)
    if (soreness >= 1) volumeSignal = "add";
    else if (soreness <= -1) volumeSignal = "reduce";
  }

  // Apply volume adjustment
  if (volumeSignal === "add") {
    nextSets = Math.min(result.targetSets + 1, 6);
  } else if (volumeSignal === "reduce") {
    const drop = (pump !== null && pump >= 5) || soreness <= -2 ? 2 : 1;
    nextSets = Math.max(result.targetSets - drop, 1);
  }

  // Weight increment — only if rep goal met and recovery OK
  const repGoalMet = result.repsCompleted !== null && result.repsCompleted >= result.repGoal;
  const recoveryOk = soreness >= 0;

  if (repGoalMet && recoveryOk) {
    let increment: number;
    if (goal === "strength") {
      increment = isLowerBody ? 2.5 : 1.25;
    } else {
      // powerbuilding and hypertrophy
      increment = isLowerBody ? 5 : 2.5;
    }
    nextWeight = result.actualWeight + increment;
  }

  const mesoWeek = ((nextWeek - 1) % 4) + 1;
  const nextRIR = rirSchedule[mesoWeek] || rirSchedule[1];

  return {
    exerciseId: result.exerciseId,
    weekNumber: nextWeek,
    targetSets: nextSets,
    targetWeight: nextWeight,
    targetReps: nextRepTarget,
    targetRIR: nextRIR,
  };
}

export type { WorkoutResult, NextWeekTargets };

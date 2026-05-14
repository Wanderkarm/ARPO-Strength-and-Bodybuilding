// ─── Myo-Reps: eligibility, constants, and progression ────────────────────────
// Myo-reps (Børge Fagerli): activation set near failure, then short rests (5–20s)
// to re-perform small clusters of reps at high motor-unit recruitment.
// Best suited to stable isolation movements; contraindicated for CNS-heavy compounds.

export const MYO_REST_SECONDS   = 15;
export const MYO_MIN_REPS       = 3;   // terminate block if mini-set falls below this
export const MYO_MAX_MINI_SETS  = 5;   // hard cap; more = past MAV for most people
export const MYO_ACTIVATION_REP_TARGET = 15; // sweet-spot for activation set

// ─── Ineligible categories ────────────────────────────────────────────────────
// Heavy compounds tax the CNS too severely for rest-pause work and carry higher
// injury risk when form breaks down under fatigue.
export const MYO_INELIGIBLE_CATEGORIES = [
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "HORIZONTAL PUSH",
  "INCLINE PUSH",
  "VERTICAL PUSH",
  "HORIZONTAL BACK",
  "VERTICAL BACK",
];

// Specific exercises excluded even if their category would pass
export const MYO_INELIGIBLE_EXERCISES = [
  "deadlift",
  "romanian deadlift",
  "rdl",
  "good morning",
  "back squat",
  "front squat",
  "hack squat",
  "barbell row",
  "pendlay row",
  "sumo deadlift",
  "trap bar deadlift",
];

export function isMyoEligible(category: string, exerciseName: string): boolean {
  if (MYO_INELIGIBLE_CATEGORIES.includes(category.toUpperCase())) return false;
  const nameLower = exerciseName.toLowerCase();
  return !MYO_INELIGIBLE_EXERCISES.some((ex) => nameLower.includes(ex));
}

// ─── Volume counting ──────────────────────────────────────────────────────────
// 1 activation + N mini-sets ≈ set-equivalents for MEV/MRV accounting.
// Each pair of mini-sets ≈ one straight set of effective reps.
export function myoSetEquivalent(miniSetCount: number): number {
  return 1 + Math.floor(miniSetCount / 2);
}

// ─── Progression logic ────────────────────────────────────────────────────────
export type MyoProgressionAction =
  | "increase_weight"   // full cycle achieved
  | "add_mini_set"      // close — chase one more mini-set
  | "add_activation_rep" // building up activation reps
  | "hold"              // floor hit early — back off activation reps next session
  | "reduce_activation"; // fatigued too fast

export interface MyoProgression {
  action: MyoProgressionAction;
  reason: string;
}

export function getMyoProgression(
  activationReps: number,
  miniSetCount: number,
  /** true if the last mini-set hit the MYO_MIN_REPS floor */
  floorHit: boolean,
): MyoProgression {
  // Full cycle: reward with weight increase
  if (activationReps >= 20 && miniSetCount >= 4) {
    return {
      action: "increase_weight",
      reason: "Full cycle — increase weight next session and reset activation to ~10 reps",
    };
  }
  // Floor hit after only 2 or fewer mini-sets → too heavy/fatigued
  if (floorHit && miniSetCount <= 2) {
    return {
      action: "reduce_activation",
      reason: "Reduce activation reps by 2 next session — fatigued too fast",
    };
  }
  // Activation reps below sweet-spot → chase reps first
  if (activationReps < MYO_ACTIVATION_REP_TARGET) {
    return {
      action: "add_activation_rep",
      reason: `Chase ${MYO_ACTIVATION_REP_TARGET} activation reps before adding mini-sets`,
    };
  }
  // Everything fine, just not at full cycle yet
  return {
    action: "add_mini_set",
    reason: "One more mini-set next session to reach full cycle",
  };
}

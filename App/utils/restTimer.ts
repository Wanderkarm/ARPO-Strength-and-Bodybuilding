import type { GoalType } from "./progressionAlgorithm";

// ─── Tier 1: Heavy Compounds ──────────────────────────────────────────────────
// Multi-joint axial-load movements. Full ATP + phosphocreatine resynthesis
// requires 3–5 min; CNS recovery for technical proficiency needs similar windows.
// (Schoenfeld 2016, Grgic et al. 2017, Morton et al. 2024)
const HEAVY_COMPOUND_CATEGORIES = [
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "HORIZONTAL PUSH",  // bench press variants
  "INCLINE PUSH",
  "HORIZONTAL BACK",  // barbell row, T-bar row
  "VERTICAL BACK",    // pull-ups, weighted pull-downs
];

// ─── Tier 2: Secondary Compounds ─────────────────────────────────────────────
// Multi-joint but lower CNS demand or shorter range of motion.
// 2-min rest maintains volume-load without over-extending session length.
// OHP (VERTICAL PUSH) goes here — compound but not axial-load like squat/deadlift.
const SECONDARY_COMPOUND_CATEGORIES = [
  "VERTICAL PUSH",   // overhead press variants
  "CHEST",           // cable flyes, dips (accessory on compound muscle)
  "BACK",            // pullovers, straight-arm pulldowns
  "SHOULDERS",       // compound shoulder work (not lateral raises)
];

// ─── Tier 3: Isolation ────────────────────────────────────────────────────────
// Single-joint. 60s is the research floor for hypertrophy; 90s prevents the
// rep-drop that undermines volume-load. (Kassiano et al. 2023, Henselmans 2024)
// Everything else defaults here.

// ─── Rest times (seconds) ─────────────────────────────────────────────────────
const REST = {
  heavyCompound:     { strength: 240, default: 180 },  // 4 min / 3 min
  secondaryCompound: { strength: 180, default: 120 },  // 3 min / 2 min
  isolation:         { strength: 120, default: 90  },  // 2 min / 90s
} as const;

export function calculateRestTime(
  exerciseCategory: string,
  goalType: GoalType = "hypertrophy",
): number {
  const cat = exerciseCategory.toUpperCase();
  const tier = goalType === "strength" ? "strength" : "default";

  if (HEAVY_COMPOUND_CATEGORIES.includes(cat))     return REST.heavyCompound[tier];
  if (SECONDARY_COMPOUND_CATEGORIES.includes(cat)) return REST.secondaryCompound[tier];
  return REST.isolation[tier];
}

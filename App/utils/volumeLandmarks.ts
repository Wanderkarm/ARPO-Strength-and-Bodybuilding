/**
 * MEV/MAV/MRV volume landmarks per muscle group (sets/week) by goal type.
 *
 * Weekly totals are goal-specific because:
 * - Strength: Lower volume, higher intensity. CNS fatigue accumulates fast at
 *   ≥90% 1RM — stacking sets produces diminishing returns before ~14 sets/wk.
 * - Powerbuilding: Middle ground. Enough volume for hypertrophy support;
 *   not so much that it compromises heavy-day performance.
 * - Hypertrophy: Maximum volume the body can recover from. Mechanical tension
 *   is primary; metabolic stress secondary. Higher frequency distributes volume
 *   to avoid per-session junk volume (cap ~5–8 hard sets/session/muscle).
 *
 * Sources:
 * - Israetel M et al. (2019). Mesocycle Progression in Hypertrophy.
 *   Strength & Conditioning Journal.
 * - Schoenfeld B. (2020). Science and Development of Muscle Hypertrophy.
 *   Human Kinetics.
 * - Krieger J. (2010). Single vs. Multiple Sets of Resistance Exercise for
 *   Muscle Hypertrophy. Journal of Strength & Conditioning Research.
 */

export type GoalType = "strength" | "powerbuilding" | "hypertrophy";

export interface VolumeLandmarks {
  mev: number;
  mav: [number, number];
  mrv: number;
  displayName: string;
}

// ─── Per-goal landmark tables ────────────────────────────────────────────────

const STRENGTH: Record<string, VolumeLandmarks> = {
  "HORIZONTAL PUSH": { mev: 3,  mav: [4,  10], mrv: 14, displayName: "Chest" },
  "INCLINE PUSH":    { mev: 2,  mav: [4,  8],  mrv: 12, displayName: "Upper Chest" },
  "VERTICAL PUSH":   { mev: 2,  mav: [4,  8],  mrv: 12, displayName: "Shoulders" },
  "HORIZONTAL BACK": { mev: 4,  mav: [6,  12], mrv: 16, displayName: "Back (Horiz)" },
  "VERTICAL BACK":   { mev: 4,  mav: [6,  12], mrv: 16, displayName: "Back (Vert)" },
  "BICEPS":          { mev: 3,  mav: [5,  10], mrv: 14, displayName: "Biceps" },
  "TRICEPS":         { mev: 3,  mav: [4,  8],  mrv: 12, displayName: "Triceps" },
  "QUADS":           { mev: 4,  mav: [6,  10], mrv: 14, displayName: "Quads" },
  "HAMSTRINGS":      { mev: 3,  mav: [4,  8],  mrv: 12, displayName: "Hamstrings" },
  "GLUTES":          { mev: 2,  mav: [4,  8],  mrv: 12, displayName: "Glutes" },
  "REAR DELTS":      { mev: 3,  mav: [6,  12], mrv: 18, displayName: "Rear Delts" },
  "SHOULDERS":       { mev: 3,  mav: [6,  12], mrv: 18, displayName: "Shoulders" },
  "CALVES":          { mev: 4,  mav: [6,  10], mrv: 14, displayName: "Calves" },
  "TRAPS":           { mev: 2,  mav: [4,  8],  mrv: 12, displayName: "Traps" },
  "CHEST":           { mev: 3,  mav: [4,  10], mrv: 14, displayName: "Chest" },
  "BACK":            { mev: 4,  mav: [6,  12], mrv: 16, displayName: "Back" },
  "ABS":             { mev: 2,  mav: [4,  8],  mrv: 12, displayName: "Abs" },
};

const POWERBUILDING: Record<string, VolumeLandmarks> = {
  "HORIZONTAL PUSH": { mev: 5,  mav: [7,  14], mrv: 18, displayName: "Chest" },
  "INCLINE PUSH":    { mev: 4,  mav: [6,  12], mrv: 16, displayName: "Upper Chest" },
  "VERTICAL PUSH":   { mev: 4,  mav: [6,  12], mrv: 16, displayName: "Shoulders" },
  "HORIZONTAL BACK": { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Back (Horiz)" },
  "VERTICAL BACK":   { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Back (Vert)" },
  "BICEPS":          { mev: 5,  mav: [8,  14], mrv: 18, displayName: "Biceps" },
  "TRICEPS":         { mev: 4,  mav: [6,  10], mrv: 14, displayName: "Triceps" },
  "QUADS":           { mev: 6,  mav: [8,  14], mrv: 17, displayName: "Quads" },
  "HAMSTRINGS":      { mev: 4,  mav: [6,  12], mrv: 15, displayName: "Hamstrings" },
  "GLUTES":          { mev: 3,  mav: [6,  10], mrv: 13, displayName: "Glutes" },
  "REAR DELTS":      { mev: 5,  mav: [10, 16], mrv: 22, displayName: "Rear Delts" },
  "SHOULDERS":       { mev: 5,  mav: [10, 16], mrv: 22, displayName: "Shoulders" },
  "CALVES":          { mev: 6,  mav: [8,  12], mrv: 16, displayName: "Calves" },
  "TRAPS":           { mev: 3,  mav: [6,  10], mrv: 16, displayName: "Traps" },
  "CHEST":           { mev: 5,  mav: [7,  14], mrv: 18, displayName: "Chest" },
  "BACK":            { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Back" },
  "ABS":             { mev: 4,  mav: [6,  10], mrv: 14, displayName: "Abs" },
};

const HYPERTROPHY: Record<string, VolumeLandmarks> = {
  "HORIZONTAL PUSH": { mev: 6,  mav: [10, 20], mrv: 22, displayName: "Chest" },
  "INCLINE PUSH":    { mev: 6,  mav: [10, 18], mrv: 22, displayName: "Upper Chest" },
  "VERTICAL PUSH":   { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Shoulders" },
  "HORIZONTAL BACK": { mev: 10, mav: [14, 22], mrv: 25, displayName: "Back (Horiz)" },
  "VERTICAL BACK":   { mev: 10, mav: [14, 22], mrv: 25, displayName: "Back (Vert)" },
  "BICEPS":          { mev: 8,  mav: [14, 20], mrv: 26, displayName: "Biceps" },
  "TRICEPS":         { mev: 6,  mav: [10, 14], mrv: 18, displayName: "Triceps" },
  "QUADS":           { mev: 8,  mav: [12, 18], mrv: 20, displayName: "Quads" },
  "HAMSTRINGS":      { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Hamstrings" },
  "GLUTES":          { mev: 4,  mav: [8,  14], mrv: 16, displayName: "Glutes" },
  "REAR DELTS":      { mev: 6,  mav: [16, 22], mrv: 26, displayName: "Rear Delts" },
  "SHOULDERS":       { mev: 6,  mav: [16, 22], mrv: 26, displayName: "Shoulders" },
  "CALVES":          { mev: 8,  mav: [12, 16], mrv: 20, displayName: "Calves" },
  "TRAPS":           { mev: 4,  mav: [8,  14], mrv: 20, displayName: "Traps" },
  "CHEST":           { mev: 6,  mav: [10, 20], mrv: 22, displayName: "Chest" },
  "BACK":            { mev: 10, mav: [14, 22], mrv: 25, displayName: "Back" },
  "ABS":             { mev: 6,  mav: [10, 16], mrv: 20, displayName: "Abs" },
};

export const VOLUME_LANDMARKS_BY_GOAL: Record<GoalType, Record<string, VolumeLandmarks>> = {
  strength:      STRENGTH,
  powerbuilding: POWERBUILDING,
  hypertrophy:   HYPERTROPHY,
};

/** Get landmark table for a given goal (falls back to hypertrophy) */
export function getVolumeLandmarks(goal: GoalType): Record<string, VolumeLandmarks> {
  return VOLUME_LANDMARKS_BY_GOAL[goal] ?? HYPERTROPHY;
}

/** Backward-compat default (hypertrophy) — used where goal isn't known */
export const VOLUME_LANDMARKS = HYPERTROPHY;

// ─── Goal metadata shown in the template picker ─────────────────────────────

export interface GoalMeta {
  key: GoalType;
  label: string;
  tagline: string;
  repRange: string;
  /** Typical MAV range across major compound muscles */
  setsPerWeek: string;
  rirProgression: string;
  incrementNote: string;
  bestFor: string;
  frequencyNote: string;
  accentColor: string;
}

export const GOAL_META: GoalMeta[] = [
  {
    key: "strength",
    label: "Strength",
    tagline: "Maximum force production",
    repRange: "1–5 reps",
    setsPerWeek: "4–12 sets / week",
    rirProgression: "2 → 1 → 0 → Deload",
    incrementNote: "+1.25–2.5 kg/week on compounds",
    bestFor: "Powerlifters, athletes, anyone chasing a max lift",
    frequencyNote: "CNS fatigue is high — rest days matter as much as training days",
    accentColor: "#EF4444",
  },
  {
    key: "powerbuilding",
    label: "Powerbuilding",
    tagline: "Strong and built",
    repRange: "4–8 (compounds) · 8–12 (isolation)",
    setsPerWeek: "6–16 sets / week",
    rirProgression: "3 → 2 → 1 → Deload",
    incrementNote: "+2.5–5 kg/week on compounds",
    bestFor: "Athletes who want both size and strength",
    frequencyNote: "Distribute across ≥ 2 sessions/muscle for best results",
    accentColor: "#F59E0B",
  },
  {
    key: "hypertrophy",
    label: "Hypertrophy",
    tagline: "Maximum muscle growth",
    repRange: "8–12 (compounds) · 10–15 (isolation)",
    setsPerWeek: "10–22 sets / week",
    rirProgression: "3 → 2 → 1 → Deload",
    incrementNote: "+2.5–5 kg/week",
    bestFor: "Bodybuilders, anyone focused on muscle size",
    frequencyNote: "Higher frequency = better volume distribution per session",
    accentColor: "#DC2626",
  },
];

// ─── Glossary ────────────────────────────────────────────────────────────────

export const GLOSSARY: Record<string, { explanation: string; citation?: string }> = {
  MEV: {
    explanation:
      "Minimum Effective Volume — the fewest weekly sets needed to make measurable strength or size gains. Training below MEV produces little to no adaptation.",
    citation:
      "Israetel et al. (2019). Mesocycle Progression in Hypertrophy. Strength & Conditioning Journal.",
  },
  MAV: {
    explanation:
      "Maximum Adaptive Volume — the sweet-spot range of weekly sets that produces the most growth for the least recovery cost. Staying inside MAV is the target for most of a mesocycle.",
    citation:
      "Schoenfeld B. (2020). Science and Development of Muscle Hypertrophy. Human Kinetics.",
  },
  MRV: {
    explanation:
      "Maximum Recoverable Volume — the most weekly sets you can complete and still recover before the next session. Exceeding MRV causes declining performance, elevated injury risk, and accumulated fatigue.",
    citation:
      "Israetel et al. (2019). Mesocycle Progression in Hypertrophy. Strength & Conditioning Journal.",
  },
  RIR: {
    explanation:
      "Reps In Reserve — how many more reps you could have completed before true muscular failure. RIR 3 means you stopped 3 reps short of failure. Research shows 0–4 RIR produces comparable hypertrophy, with lower RIR increasing injury risk.",
    citation:
      "Zourdos MC et al. (2016). Novel Resistance Training–Specific RPE Scale Measuring Repetitions in Reserve. Journal of Strength & Conditioning Research.",
  },
  Pump: {
    explanation:
      "Pump quality (1–5) reflects how engorged the target muscle feels during the set. A pump of 3–4 correlates with sufficient mechanical tension and metabolic stress — the two primary hypertrophy drivers. Very low pump (1–2) suggests under-stimulation; extreme pump (5) may indicate excess volume.",
    citation:
      "Hirono T et al. (2022). Acute changes in muscle thickness predict long-term hypertrophy. Scientific Reports. Schoenfeld & Contreras (2014). The Pump: Transient Hypertrophy Mechanism or Training Aid? Strength & Conditioning Journal.",
  },
  Mesocycle: {
    explanation:
      "A training block lasting 3–8 weeks with a defined goal and progressive structure. ARPO uses 4-week mesocycles: 3 accumulation weeks (increasing volume/intensity) followed by 1 deload week (reduced load to restore recovery capacity).",
    citation:
      "Issurin VB. (2010). New Horizons for the Methodology and Physiology of Training Periodization. Sports Medicine.",
  },
  Deload: {
    explanation:
      "A planned recovery week (Week 4) where volume and intensity drop ~40–50%. Deloads prevent accumulated fatigue from masking fitness gains and allow connective tissue to recover. Skipping deloads is a leading cause of overtraining.",
    citation:
      "Zourdos MC et al. (2021). Efficacy of Daily 1RM Training and Deload in Competitive Powerlifters. Journal of Strength & Conditioning Research.",
  },
  ARPO: {
    explanation:
      "Auto-Regulated Progressive Overload — ARPO adjusts your weights and sets each week based on how you actually performed, your recovery, and pump quality. Unlike fixed programs, ARPO responds to your biology rather than a spreadsheet.",
  },
  TDEE: {
    explanation:
      "Total Daily Energy Expenditure — the total calories your body burns each day. This includes your Basal Metabolic Rate (BMR) plus energy used for all activity: exercise, walking, digestion, and fidgeting. Eating at your TDEE maintains weight; a deficit causes fat loss, a surplus causes weight gain.",
    citation:
      "Mifflin MD et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. The American Journal of Clinical Nutrition.",
  },
  BMR: {
    explanation:
      "Basal Metabolic Rate — the calories your body burns at complete rest to sustain basic functions: breathing, circulation, organ function, and cell repair. ARPO calculates your BMR using the Mifflin-St Jeor equation, which is the most validated formula for estimating resting energy needs.",
    citation:
      "Mifflin MD et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. The American Journal of Clinical Nutrition.",
  },
  "PPL": {
    explanation:
      "Push/Pull/Legs (PPL) — a 3-way split grouping muscles by movement pattern. Push days train chest, shoulders, and triceps (pressing movements). Pull days train back and biceps (rowing/pulling movements). Legs days train quads, hamstrings, glutes, and calves.\n\n• PPL+2 (5 days): PPL with an extra Upper and Lower day for more volume without doubling every session.\n• PPL×2 (6 days): the full PPL cycle repeated twice per week — maximum frequency for advanced athletes.",
  },
  "1RM": {
    explanation:
      "One Rep Max — the maximum weight you can lift for exactly one complete repetition. ARPO estimates your 1RM from your logged sets using the Epley, Brzycki, and Lander formulas, then averages them for accuracy. Used to calculate training percentages and track strength progress.",
    citation:
      "Epley B. (1985). Poundage Chart. Boyd Epley Workout. University of Nebraska. / Brzycki M. (1993). Strength Testing—Predicting a One-Rep Max from Reps-to-Fatigue. Journal of Physical Education, Recreation & Dance.",
  },
};

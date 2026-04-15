/**
 * MEV/MAV/MRV volume landmarks per muscle group (sets/week)
 *
 * Sources:
 * - Israetel M, Hoffmann J, Smith C. Scientific Principles of Strength Training. 2015.
 * - Israetel M, Feather J, Faleiro T, Krieger J. Mesocycle Progression in Hypertrophy:
 *   Volume-Focused Approach. Strength & Conditioning Journal, 2019.
 * - Schoenfeld B. Science and Development of Muscle Hypertrophy. Human Kinetics, 2020.
 *
 * MEV = Minimum Effective Volume (below this = no/minimal growth stimulus)
 * MAV = Maximum Adaptive Volume [min, max] (sweet spot for growth)
 * MRV = Maximum Recoverable Volume (above this = recovery fails, performance drops)
 */

export interface VolumeLandmarks {
  mev: number;
  mav: [number, number];
  mrv: number;
  displayName: string;
}

export const VOLUME_LANDMARKS: Record<string, VolumeLandmarks> = {
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
};

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
};

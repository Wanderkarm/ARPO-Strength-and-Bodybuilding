/**
 * Body composition utilities — all inputs/outputs in metric (kg, cm).
 * No external dependencies.
 */

// ── BMI ───────────────────────────────────────────────────────────────────────

export function calcBMI(weightKg: number, heightCm: number): number | null {
  if (weightKg <= 0 || heightCm <= 0) return null;
  const hm = heightCm / 100;
  return Math.round((weightKg / (hm * hm)) * 10) / 10;
}

export type BMICategory = "Underweight" | "Normal" | "Overweight" | "Obese";

export function bmiCategory(bmi: number): { label: BMICategory; color: string } {
  if (bmi < 18.5) return { label: "Underweight", color: "#42A5F5" };
  if (bmi < 25)   return { label: "Normal",      color: "#66BB6A" };
  if (bmi < 30)   return { label: "Overweight",  color: "#FFA726" };
  return              { label: "Obese",        color: "#EF5350" };
}

/**
 * True when BMI is meaningfully misleading for a trained athlete.
 * Overweight/Obese BMI with an FFMI in the good+ range = "muscular, not fat".
 */
export function bmiMisleadingForAthlete(bmi: number, ffmi: number): boolean {
  return bmi >= 25 && ffmi >= 22;
}

// ── U.S. Navy Body Fat % ──────────────────────────────────────────────────────

/**
 * Returns estimated body fat % using the U.S. Navy circumference formula.
 * All measurements in cm.  hips is required for female.
 * Returns null if inputs are invalid or insufficient.
 */
export function calcNavyBodyFat(
  gender: "MALE" | "FEMALE",
  waistCm: number,
  neckCm: number,
  heightCm: number,
  hipsCm?: number | null,
): number | null {
  if (waistCm <= 0 || neckCm <= 0 || heightCm <= 0) return null;
  if (waistCm <= neckCm) return null;

  if (gender === "MALE") {
    const bf =
      495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
    if (!isFinite(bf) || bf < 2) return null;
    return Math.round(bf * 10) / 10;
  } else {
    if (!hipsCm || hipsCm <= 0) return null;
    const diff = waistCm + hipsCm - neckCm;
    if (diff <= 0) return null;
    const bf =
      495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.22100 * Math.log10(heightCm)) - 450;
    if (!isFinite(bf) || bf < 5) return null;
    return Math.round(bf * 10) / 10;
  }
}

export type BodyFatCategory =
  | "Essential fat"
  | "Athletic"
  | "Fitness"
  | "Average"
  | "Above average";

export function bodyFatCategory(
  pct: number,
  gender: "MALE" | "FEMALE",
): { label: BodyFatCategory; color: string } {
  if (gender === "MALE") {
    if (pct < 6)  return { label: "Essential fat",  color: "#42A5F5" };
    if (pct < 14) return { label: "Athletic",        color: "#66BB6A" };
    if (pct < 18) return { label: "Fitness",         color: "#26C6DA" };
    if (pct < 25) return { label: "Average",         color: "#FFA726" };
    return             { label: "Above average",    color: "#EF5350" };
  } else {
    if (pct < 14) return { label: "Essential fat",  color: "#42A5F5" };
    if (pct < 21) return { label: "Athletic",        color: "#66BB6A" };
    if (pct < 25) return { label: "Fitness",         color: "#26C6DA" };
    if (pct < 32) return { label: "Average",         color: "#FFA726" };
    return             { label: "Above average",    color: "#EF5350" };
  }
}

// ── FFMI ──────────────────────────────────────────────────────────────────────

/**
 * Normalized Fat-Free Mass Index — adjusted for height vs average (1.8 m).
 * Far more meaningful than BMI for trained athletes.
 */
export function calcFFMI(
  weightKg: number,
  heightCm: number,
  bodyFatPct: number,
): number | null {
  if (weightKg <= 0 || heightCm <= 0 || bodyFatPct < 0 || bodyFatPct >= 100) return null;
  const hm = heightCm / 100;
  const leanKg = weightKg * (1 - bodyFatPct / 100);
  const rawFFMI = leanKg / (hm * hm);
  const normalized = rawFFMI + 6.1 * (1.8 - hm);
  return Math.round(normalized * 10) / 10;
}

export type FFMICategory =
  | "Below average"
  | "Average"
  | "Good"
  | "Very good"
  | "Exceptional"
  | "Elite";

/**
 * FFMI ranges for natural athletes (male-calibrated; female norms ~2 pts lower).
 * >26 is associated with anabolic steroid use in the research literature.
 */
export function ffmiCategory(
  ffmi: number,
  gender: "MALE" | "FEMALE",
): { label: FFMICategory; color: string } {
  // Female norms shift ~2 points lower
  const f = gender === "FEMALE" ? ffmi + 2 : ffmi;
  if (f < 17)  return { label: "Below average", color: "#90A4AE" };
  if (f < 20)  return { label: "Average",        color: "#42A5F5" };
  if (f < 22)  return { label: "Good",           color: "#26C6DA" };
  if (f < 24)  return { label: "Very good",      color: "#66BB6A" };
  if (f < 26)  return { label: "Exceptional",    color: "#FFA726" };
  return            { label: "Elite",           color: "#EF5350" };
}

// ── Lean mass ─────────────────────────────────────────────────────────────────

export function calcLeanMassKg(weightKg: number, bodyFatPct: number): number {
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}

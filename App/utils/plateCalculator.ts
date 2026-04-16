/**
 * Plate Calculator
 * Computes which plates to load on each side of a barbell to reach a target weight.
 * Designed so Apple Health / Google Fit integration can slot in via the `source`
 * field without touching this file.
 */

export interface PlateResult {
  /** Plates required on each side (largest first) */
  platesPerSide: Array<{ weight: number; count: number }>;
  /** Actual total weight when plates are loaded (may differ from target if not exact) */
  totalWeight: number;
  /** Bar weight used in the calculation */
  barWeight: number;
  /** True when plates exactly match the target weight */
  canMatch: boolean;
  /** Unaccounted weight per side when exact match is not possible */
  remainder: number;
}

// Standard plate sets
const LBS_PLATES = [45, 35, 25, 10, 5, 2.5];
const KG_PLATES  = [20, 15, 10,  5, 2.5, 1.25];

export interface BarPreset {
  label: string;
  weight: number;
}

export const BAR_PRESETS: { lbs: BarPreset[]; kg: BarPreset[] } = {
  lbs: [
    { label: "Standard (45 lbs)", weight: 45 },
    { label: "EZ Bar (35 lbs)",   weight: 35 },
    { label: "Smith (30 lbs)",    weight: 30 },
  ],
  kg: [
    { label: "Standard (20 kg)", weight: 20 },
    { label: "EZ Bar (15 kg)",   weight: 15 },
    { label: "Smith (14 kg)",    weight: 14 },
  ],
};

export function calculatePlates(
  targetWeight: number,
  unit: "lbs" | "kg",
  barWeight?: number
): PlateResult {
  const plates  = unit === "lbs" ? LBS_PLATES : KG_PLATES;
  const bar     = barWeight ?? (unit === "lbs" ? 45 : 20);

  if (targetWeight <= bar) {
    return {
      platesPerSide: [],
      totalWeight:   bar,
      barWeight:     bar,
      canMatch:      Math.abs(targetWeight - bar) < 0.01,
      remainder:     0,
    };
  }

  const perSide = (targetWeight - bar) / 2;
  const loaded: Array<{ weight: number; count: number }> = [];
  let remaining = perSide;

  for (const p of plates) {
    if (remaining < p - 0.001) continue;
    const count = Math.floor(remaining / p + 1e-9); // epsilon avoids float drift
    if (count > 0) {
      loaded.push({ weight: p, count });
      remaining -= count * p;
      remaining  = Math.round(remaining * 1000) / 1000;
    }
  }

  const loadedTotal = loaded.reduce((s, p) => s + p.weight * p.count * 2, 0) + bar;

  return {
    platesPerSide: loaded,
    totalWeight:   Math.round(loadedTotal * 100) / 100,
    barWeight:     bar,
    canMatch:      remaining < 0.1,
    remainder:     Math.round(remaining * 100) / 100,
  };
}

/** Renders plates as a compact string, e.g. "45+25+10+5" */
export function platesString(result: PlateResult): string {
  if (result.platesPerSide.length === 0) return "Bar only";
  return result.platesPerSide
    .flatMap(p => Array(p.count).fill(String(p.weight)))
    .join(" + ");
}

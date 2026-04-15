interface BaselineWeights {
  squat: number;
  benchPress: number;
  deadlift: number;
  overheadPress: number;
  barbellRow: number;
  barbellCurl: number;
}

const CATEGORY_TO_LIFT: Record<string, keyof BaselineWeights> = {
  QUADS: "squat",
  GLUTES: "deadlift",
  HAMSTRINGS: "deadlift",
  "HORIZONTAL PUSH": "benchPress",
  "INCLINE PUSH": "benchPress",
  "VERTICAL PUSH": "overheadPress",
  "HORIZONTAL BACK": "barbellRow",
  "VERTICAL BACK": "barbellRow",
  BICEPS: "barbellCurl",
  TRICEPS: "overheadPress",
  CALVES: "barbellCurl",
  TRAPS: "barbellRow",
  "REAR DELTS": "barbellRow",
  ABS: "barbellCurl",
};

const CATEGORY_WEIGHT_MODIFIER: Record<string, number> = {
  QUADS: 1.0,
  GLUTES: 0.9,
  HAMSTRINGS: 0.85,
  "HORIZONTAL PUSH": 1.0,
  "INCLINE PUSH": 0.85,
  "VERTICAL PUSH": 1.0,
  "HORIZONTAL BACK": 1.0,
  "VERTICAL BACK": 0.85,
  BICEPS: 1.0,
  TRICEPS: 0.7,
  CALVES: 0.8,
  TRAPS: 0.7,
  "REAR DELTS": 0.4,
  ABS: 0.5,
};

export function getCategoryWeight(
  category: string,
  baselines: BaselineWeights
): number {
  const cat = category.toUpperCase();
  const liftKey = CATEGORY_TO_LIFT[cat];
  if (!liftKey) return 50;
  const baseWeight = baselines[liftKey];
  const modifier = CATEGORY_WEIGHT_MODIFIER[cat] ?? 1.0;
  return Math.round((baseWeight * modifier) / 5) * 5;
}

export function baselineWeightsFromMap(
  categoryMap: Record<string, number>
): BaselineWeights {
  return {
    squat: categoryMap["QUADS"] || 135,
    benchPress: categoryMap["HORIZONTAL PUSH"] || 95,
    deadlift: categoryMap["HAMSTRINGS"] || 135,
    overheadPress: categoryMap["VERTICAL PUSH"] || 65,
    barbellRow: categoryMap["HORIZONTAL BACK"] || 95,
    barbellCurl: categoryMap["BICEPS"] || 45,
  };
}

export type { BaselineWeights };

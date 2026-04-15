type Gender = "MALE" | "FEMALE";
type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

interface OnboardingInput {
  gender: Gender;
  bodyweight: number;
  experience: ExperienceLevel;
}

interface EstimatedWeights {
  squat: number;
  benchPress: number;
  deadlift: number;
  overheadPress: number;
  barbellRow: number;
  barbellCurl: number;
}

const MALE_RATIOS: Record<ExperienceLevel, Record<string, number>> = {
  BEGINNER: {
    squat: 0.75,
    benchPress: 0.6,
    deadlift: 0.85,
    overheadPress: 0.4,
    barbellRow: 0.5,
    barbellCurl: 0.25,
  },
  INTERMEDIATE: {
    squat: 1.25,
    benchPress: 1.0,
    deadlift: 1.5,
    overheadPress: 0.65,
    barbellRow: 0.8,
    barbellCurl: 0.35,
  },
  ADVANCED: {
    squat: 1.75,
    benchPress: 1.35,
    deadlift: 2.0,
    overheadPress: 0.85,
    barbellRow: 1.1,
    barbellCurl: 0.45,
  },
};

const FEMALE_RATIOS: Record<ExperienceLevel, Record<string, number>> = {
  BEGINNER: {
    squat: 0.5,
    benchPress: 0.35,
    deadlift: 0.65,
    overheadPress: 0.25,
    barbellRow: 0.35,
    barbellCurl: 0.15,
  },
  INTERMEDIATE: {
    squat: 1.0,
    benchPress: 0.65,
    deadlift: 1.25,
    overheadPress: 0.45,
    barbellRow: 0.6,
    barbellCurl: 0.25,
  },
  ADVANCED: {
    squat: 1.5,
    benchPress: 1.0,
    deadlift: 1.75,
    overheadPress: 0.65,
    barbellRow: 0.85,
    barbellCurl: 0.35,
  },
};

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

export function estimateWeights(input: OnboardingInput): EstimatedWeights {
  const ratios =
    input.gender === "MALE"
      ? MALE_RATIOS[input.experience]
      : FEMALE_RATIOS[input.experience];

  return {
    squat: roundToNearest(input.bodyweight * ratios.squat, 5),
    benchPress: roundToNearest(input.bodyweight * ratios.benchPress, 5),
    deadlift: roundToNearest(input.bodyweight * ratios.deadlift, 5),
    overheadPress: roundToNearest(input.bodyweight * ratios.overheadPress, 5),
    barbellRow: roundToNearest(input.bodyweight * ratios.barbellRow, 5),
    barbellCurl: roundToNearest(input.bodyweight * ratios.barbellCurl, 5),
  };
}

export type { Gender, ExperienceLevel, OnboardingInput, EstimatedWeights };

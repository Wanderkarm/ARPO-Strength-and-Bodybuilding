// ─── Types ────────────────────────────────────────────────────────────────────

export type BodyGoal = "cut" | "recomp" | "bulk";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type AggressionLevel = "conservative" | "moderate" | "aggressive";

export interface NutritionInput {
  gender: "MALE" | "FEMALE";
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  bodyGoal: BodyGoal;
  targetWeightKg?: number; // for cut/bulk
  weeksToGoal?: number;    // for cut/bulk
  experienceLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
}

export interface MacroSet {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface NutritionPlan {
  tdee: number;
  bmr: number;
  conservative: MacroSet;
  moderate: MacroSet;
  aggressive: MacroSet;
  weeklyChangeKg: { conservative: number; moderate: number; aggressive: number };
  weeksToGoal?: { conservative: number; moderate: number; aggressive: number };
  timelineValid: boolean;
  realisticWeeks?: number;
  timelineWarning?: string;
  scienceNote: string;
}

export interface MealExample {
  name: string;
  foods: string;
  calories: number;
  proteinG: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; description: string; multiplier: number }> = {
  sedentary:   { label: "Sedentary",     description: "Desk job, minimal movement outside training",         multiplier: 1.2   },
  light:       { label: "Lightly Active",description: "On your feet some of the day, light daily activity",  multiplier: 1.375 },
  moderate:    { label: "Moderately Active", description: "Active job or active most days outside training",  multiplier: 1.55  },
  active:      { label: "Very Active",   description: "Physical job or very active lifestyle",               multiplier: 1.725 },
  very_active: { label: "Athlete",       description: "Physical job + intense daily training",               multiplier: 1.9   },
};

// ─── BMR — Mifflin-St Jeor (most validated equation) ─────────────────────────

export function calculateBMR(
  gender: "MALE" | "FEMALE",
  weightKg: number,
  heightCm: number,
  age: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === "MALE" ? base + 5 : base - 161;
}

// ─── TDEE ─────────────────────────────────────────────────────────────────────

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_LABELS[activityLevel].multiplier);
}

// ─── Timeline validation ──────────────────────────────────────────────────────
// Max safe fat loss: 1% bodyweight/week
// Max realistic lean bulk: beginner 0.5 kg/month, intermediate 0.25 kg/month, advanced 0.1 kg/month

export function validateTimeline(
  currentWeightKg: number,
  targetWeightKg: number,
  weeksToGoal: number,
  bodyGoal: BodyGoal,
  experience: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" = "INTERMEDIATE"
): {
  isRealistic: boolean;
  requiredWeeklyKg: number;
  maxWeeklyKg: number;
  realisticWeeks: number;
  explanation: string;
} {
  const totalChange = Math.abs(targetWeightKg - currentWeightKg);
  const requiredWeeklyKg = totalChange / weeksToGoal;

  let maxWeeklyKg: number;
  let explanation: string;

  if (bodyGoal === "cut") {
    // Research supports max 0.5–1% BW/week fat loss to preserve muscle
    maxWeeklyKg = currentWeightKg * 0.01;
    explanation =
      "Research shows losing more than ~1% of your bodyweight per week significantly increases muscle loss alongside fat. " +
      "A slower cut preserves more lean mass and keeps your metabolism from adapting.";
  } else {
    // Muscle gain per month: beginner ~1–2 lbs (0.45–0.9 kg), intermediate ~0.5–1 lb (0.23–0.45 kg), advanced ~0.25 lb (0.11 kg)
    const monthlyKg =
      experience === "BEGINNER" ? 0.7 :
      experience === "INTERMEDIATE" ? 0.35 : 0.15;
    maxWeeklyKg = monthlyKg / 4.33;
    explanation =
      "Muscle protein synthesis is rate-limited by biology. " +
      `${experience.charAt(0) + experience.slice(1).toLowerCase()} lifters can realistically add ~${(monthlyKg * 2.205).toFixed(1)} lbs of muscle per month maximum. ` +
      "Gaining faster than this mostly adds body fat, not muscle.";
  }

  const isRealistic = requiredWeeklyKg <= maxWeeklyKg * 1.05; // 5% tolerance
  const realisticWeeks = Math.ceil(totalChange / maxWeeklyKg);

  return { isRealistic, requiredWeeklyKg, maxWeeklyKg, realisticWeeks, explanation };
}

// ─── Calorie + macro targets ──────────────────────────────────────────────────

function buildMacros(calories: number, bodyweightKg: number, bodyGoal: BodyGoal): MacroSet {
  // Protein: 1g per lb of bodyweight (2.2g/kg) — research-supported for strength athletes
  const lbs = bodyweightKg * 2.205;
  const proteinG = Math.round(lbs);

  // Fat floor: 0.35g per lb for hormonal health
  const fatG = Math.round(lbs * 0.35);

  // Remaining calories → carbs
  const remainingCals = calories - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(remainingCals / 4));

  return { calories: Math.round(calories), proteinG, fatG, carbsG };
}

export function calculateNutritionPlan(input: NutritionInput): NutritionPlan {
  const bmr = calculateBMR(input.gender, input.weightKg, input.heightCm, input.age);
  const tdee = calculateTDEE(bmr, input.activityLevel);

  let conservativeCals: number;
  let moderateCals: number;
  let aggressiveCals: number;
  let scienceNote: string;

  if (input.bodyGoal === "cut") {
    // Deficits: conservative 250, moderate 500, aggressive 750 cal/day
    conservativeCals = tdee - 250;
    moderateCals = tdee - 500;
    aggressiveCals = tdee - 750;
    scienceNote =
      "A caloric deficit forces your body to burn stored fat for energy. " +
      "The 3,500 cal ≈ 1 lb of fat rule (Hall et al., 2012) means a 500 cal/day deficit yields ~1 lb/week of fat loss. " +
      "Keeping protein high (1g per lb of bodyweight) during a cut is critical — without it, up to 25–50% of weight lost can be lean mass (Helms et al., 2014). " +
      "Deficits beyond 750 cal/day trigger hormonal adaptations (T3 drop, cortisol rise, ghrelin increase) that slow metabolism and accelerate muscle catabolism.";
  } else if (input.bodyGoal === "bulk") {
    // Surpluses: conservative 200, moderate 350, aggressive 500 cal/day
    conservativeCals = tdee + 200;
    moderateCals = tdee + 350;
    aggressiveCals = tdee + 500;
    scienceNote =
      "Muscle protein synthesis requires a caloric surplus to sustain — you can't build tissue from nothing. " +
      "A lean bulk (200–350 cal surplus) maximises the ratio of muscle gained to fat gained. " +
      "Larger surpluses beyond ~500 cal/day primarily add body fat, not more muscle, since MPS is rate-limited regardless of calories (Morton et al., 2018). " +
      "Higher protein intake (0.7–1g per lb) during a bulk optimises muscle protein synthesis throughout the meso.";
  } else {
    // Recomp: slight deficit or maintenance
    conservativeCals = tdee - 100;
    moderateCals = tdee;
    aggressiveCals = tdee + 100;
    scienceNote =
      "Body recomposition — simultaneously losing fat and gaining muscle — is achievable for beginners, returning lifters, and those with elevated body fat (>20% for males, >28% for females). " +
      "The mechanism: resistance training creates a local anabolic environment in muscle even in a slight deficit, while stored body fat fuels recovery and MPS (Barakat et al., 2020). " +
      "High protein (1g per lb bodyweight) is the single most important lever — it drives muscle protein synthesis and provides satiety. " +
      "Progress is slower than a dedicated cut or bulk but sustainable indefinitely without a phase switch.";
  }

  const conservative = buildMacros(conservativeCals, input.weightKg, input.bodyGoal);
  const moderate = buildMacros(moderateCals, input.weightKg, input.bodyGoal);
  const aggressive = buildMacros(aggressiveCals, input.weightKg, input.bodyGoal);

  // Weekly body weight change (1 lb fat ≈ 3,500 cal)
  const weeklyChangeKg = {
    conservative: Math.round(((conservativeCals - tdee) * 7 / 7700) * 100) / 100,
    moderate:     Math.round(((moderateCals - tdee) * 7 / 7700) * 100) / 100,
    aggressive:   Math.round(((aggressiveCals - tdee) * 7 / 7700) * 100) / 100,
  };

  // Timeline to goal
  let weeksToGoal: NutritionPlan["weeksToGoal"] | undefined;
  let timelineValid = true;
  let realisticWeeks: number | undefined;
  let timelineWarning: string | undefined;

  if (
    input.bodyGoal !== "recomp" &&
    input.targetWeightKg !== undefined &&
    input.weeksToGoal !== undefined
  ) {
    const validation = validateTimeline(
      input.weightKg,
      input.targetWeightKg,
      input.weeksToGoal,
      input.bodyGoal,
      input.experienceLevel
    );

    timelineValid = validation.isRealistic;

    const totalChange = Math.abs(input.targetWeightKg - input.weightKg);
    weeksToGoal = {
      conservative: Math.ceil(totalChange / Math.abs(weeklyChangeKg.conservative || 0.1)),
      moderate:     Math.ceil(totalChange / Math.abs(weeklyChangeKg.moderate || 0.1)),
      aggressive:   Math.ceil(totalChange / Math.abs(weeklyChangeKg.aggressive || 0.1)),
    };

    if (!validation.isRealistic) {
      realisticWeeks = validation.realisticWeeks;
      timelineWarning = validation.explanation;
    }
  }

  return {
    bmr: Math.round(bmr),
    tdee,
    conservative,
    moderate,
    aggressive,
    weeklyChangeKg,
    weeksToGoal,
    timelineValid,
    realisticWeeks,
    timelineWarning,
    scienceNote,
  };
}

// ─── Example meals ────────────────────────────────────────────────────────────
// Returns 4 meals that together roughly hit the target calories + protein.

export function generateMealExamples(
  dailyCalories: number,
  dailyProteinG: number
): MealExample[] {
  // Distribute across 4 meals: ~25% / 30% / 15% / 30%
  const splits = [0.25, 0.30, 0.15, 0.30];

  const templates: MealExample[] = [
    {
      name: "Breakfast",
      foods: "4 whole eggs + 80g oats + 200ml skimmed milk",
      calories: 540, proteinG: 38,
    },
    {
      name: "Lunch",
      foods: "200g chicken breast + 180g cooked white rice + mixed greens",
      calories: 620, proteinG: 52,
    },
    {
      name: "Snack",
      foods: "200g low-fat Greek yogurt + 1 scoop whey protein + 1 banana",
      calories: 380, proteinG: 45,
    },
    {
      name: "Dinner",
      foods: "200g salmon fillet + 200g sweet potato + 150g broccoli",
      calories: 650, proteinG: 48,
    },
  ];

  // Scale each meal proportionally to hit target calories + protein
  const templateTotal = templates.reduce((s, m) => s + m.calories, 0);
  const templateProtein = templates.reduce((s, m) => s + m.proteinG, 0);

  return templates.map((m, i) => ({
    ...m,
    calories: Math.round((dailyCalories * splits[i])),
    proteinG: Math.round((dailyProteinG * splits[i])),
  }));
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────

export function kgToLbs(kg: number): number { return Math.round(kg * 2.205 * 10) / 10; }
export function lbsToKg(lbs: number): number { return Math.round(lbs / 2.205 * 10) / 10; }
export function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn % 12);
  return `${ft}'${inches}"`;
}
export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54);
}

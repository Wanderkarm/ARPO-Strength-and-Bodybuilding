const COMPOUND_CATEGORIES = [
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "HORIZONTAL PUSH",
  "INCLINE PUSH",
  "HORIZONTAL BACK",
  "VERTICAL BACK",
  "CHEST",
  "BACK",
];

const ISOLATION_CATEGORIES = [
  "BICEPS",
  "TRICEPS",
  "VERTICAL PUSH",
  "SHOULDERS",
  "CALVES",
  "ABS",
  "TRAPS",
  "REAR DELTS",
];

export function calculateRestTime(exerciseCategory: string): number {
  const cat = exerciseCategory.toUpperCase();
  if (COMPOUND_CATEGORIES.includes(cat)) {
    return 180;
  }
  return 90;
}

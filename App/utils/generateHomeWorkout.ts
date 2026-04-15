interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  defaultVideoUrl: string | null;
}

interface SwapResult {
  original: Exercise;
  replacement: Exercise;
}

export function generateHomeWorkout(
  templateExercises: Exercise[],
  allExercises: Exercise[]
): SwapResult[] {
  const results: SwapResult[] = [];

  for (const exercise of templateExercises) {
    if (
      exercise.equipment === "DUMBBELL" ||
      exercise.equipment === "BODYWEIGHT"
    ) {
      results.push({ original: exercise, replacement: exercise });
      continue;
    }

    const alternatives = allExercises.filter(
      (e) =>
        e.category === exercise.category &&
        (e.equipment === "DUMBBELL" || e.equipment === "BODYWEIGHT") &&
        e.id !== exercise.id
    );

    if (alternatives.length > 0) {
      const dumbbellFirst = alternatives.find(
        (a) => a.equipment === "DUMBBELL"
      );
      results.push({
        original: exercise,
        replacement: dumbbellFirst || alternatives[0],
      });
    } else {
      results.push({ original: exercise, replacement: exercise });
    }
  }

  return results;
}

export type { Exercise, SwapResult };

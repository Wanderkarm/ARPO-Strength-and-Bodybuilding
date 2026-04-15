import React from "react";
import { View, Text, useWindowDimensions } from "react-native";
import Body, { ExtendedBodyPart, Slug } from "react-native-body-highlighter";
import { Exercise } from "@/lib/local-db";
import { EXERCISE_METADATA } from "@/lib/exercise-metadata";
import Colors from "@/constants/colors";

const CRIMSON = "#C62828";
const INACTIVE_FILL = "#242424";
const BODY_BORDER = "none";

const MUSCLE_TO_SLUG: Record<string, Slug[]> = {
  Chest: ["chest"],
  Pecs: ["chest"],
  Pectorals: ["chest"],
  Triceps: ["triceps"],
  Shoulders: ["deltoids"],
  Deltoids: ["deltoids"],
  "Front Delts": ["deltoids"],
  "Rear Delts": ["deltoids"],
  Abs: ["abs"],
  Core: ["abs"],
  Obliques: ["obliques"],
  Biceps: ["biceps"],
  Quads: ["quadriceps"],
  Quadriceps: ["quadriceps"],
  Hamstrings: ["hamstring"],
  Glutes: ["gluteal"],
  Calves: ["calves"],
  "Lower Leg": ["calves"],
  Back: ["upper-back", "trapezius"],
  Lats: ["upper-back"],
  "Upper Back": ["upper-back", "trapezius"],
  Traps: ["trapezius"],
  Trapezius: ["trapezius"],
  "Lower Back": ["lower-back"],
  Erectors: ["lower-back"],
  Forearms: ["forearm"],
  "Hip Flexors": ["adductors"],
};

const CATEGORY_TO_SLUGS: Record<string, Slug[]> = {
  CHEST: ["chest", "deltoids", "triceps"],
  BACK: ["upper-back", "trapezius", "biceps"],
  SHOULDERS: ["deltoids"],
  BICEPS: ["biceps", "forearm"],
  TRICEPS: ["triceps"],
  QUADS: ["quadriceps"],
  HAMSTRINGS: ["hamstring"],
  GLUTES: ["gluteal"],
  CALVES: ["calves"],
  ABS: ["abs", "obliques"],
  "HORIZONTAL PUSH": ["chest", "deltoids", "triceps"],
  "INCLINE PUSH": ["chest", "deltoids", "triceps"],
  "VERTICAL PUSH": ["deltoids", "triceps"],
  "HORIZONTAL BACK": ["upper-back", "biceps"],
  "HORIZONTAL PULL": ["upper-back", "biceps"],
  "VERTICAL BACK": ["upper-back", "trapezius", "biceps"],
  "VERTICAL PULL": ["upper-back", "trapezius", "biceps"],
  "REAR DELTS": ["deltoids", "trapezius"],
};

interface Props {
  exercise: Exercise;
  containerWidth?: number;
}

function getBodyData(exercise: Exercise): ExtendedBodyPart[] {
  const meta = EXERCISE_METADATA[exercise.name];
  const slugSet = new Set<Slug>();

  if (meta?.muscleBreakdown?.length) {
    for (const { muscle } of meta.muscleBreakdown) {
      const mapped = MUSCLE_TO_SLUG[muscle];
      if (mapped) mapped.forEach((s) => slugSet.add(s));
    }
  } else {
    const mapped = CATEGORY_TO_SLUGS[exercise.category];
    if (mapped) mapped.forEach((s) => slugSet.add(s));
  }

  return Array.from(slugSet).map((slug) => ({ slug, intensity: 1 }));
}

export default function AnatomyMap({ exercise, containerWidth }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const totalWidth = containerWidth ?? screenWidth - 40;
  const figureWidth = (totalWidth - 8) / 2;
  const scale = figureWidth / 200;

  const bodyData = getBodyData(exercise);

  const sharedProps = {
    data: bodyData,
    colors: [CRIMSON] as ReadonlyArray<string>,
    defaultFill: INACTIVE_FILL,
    gender: "male" as const,
    scale,
    border: BODY_BORDER,
  };

  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      <View style={{ alignItems: "center" }}>
        <Body {...sharedProps} side="front" />
        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 8, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginTop: 4 }}>
          Front
        </Text>
      </View>
      <View style={{ alignItems: "center" }}>
        <Body {...sharedProps} side="back" />
        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 8, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginTop: 4 }}>
          Back
        </Text>
      </View>
    </View>
  );
}

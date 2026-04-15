import React from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import AnatomyMap from "./AnatomyMap";
import { Exercise } from "@/lib/local-db";
import { EXERCISE_METADATA } from "@/lib/exercise-metadata";
import Colors from "@/constants/colors";

interface Props {
  exercise: Exercise;
}

export default function ExerciseGuide({ exercise }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const meta = EXERCISE_METADATA[exercise.name];
  const breakdown = meta?.muscleBreakdown;
  const instructions = meta?.instructions;

  const usableWidth = screenWidth - 40;
  const anatomyWidth = Math.floor(usableWidth * 0.42);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Targeted Muscles</Text>

      {/* Side-by-side: anatomy left, bars right */}
      <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
        {/* Left — anatomy diagram */}
        <AnatomyMap exercise={exercise} containerWidth={anatomyWidth} />

        {/* Right — muscle % bars */}
        {breakdown && breakdown.length > 0 && (
          <View style={{ flex: 1, paddingTop: 4, gap: 10 }}>
            {breakdown.map(({ muscle, percentage }) => (
              <View key={muscle} style={styles.barRow}>
                <View style={styles.barHeader}>
                  <Text style={styles.muscleName}>{muscle}</Text>
                  <Text style={styles.barPct}>{percentage}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${percentage}%` as any }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Instructions — directly below so they appear early */}
      {instructions && instructions.length > 0 && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsLabel}>Instructions</Text>
          {instructions.map((step, idx) => (
            <View key={idx} style={styles.step}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sectionLabel: {
    fontFamily: "Rubik_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },

  barRow: {
    gap: 4,
  },
  barHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  muscleName: {
    fontFamily: "Rubik_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 1,
    marginRight: 4,
  },
  barPct: {
    fontFamily: "Rubik_700Bold",
    fontSize: 11,
    color: Colors.text,
  },
  barTrack: {
    height: 4,
    backgroundColor: Colors.bgAccent,
    width: "100%",
  },
  barFill: {
    height: 4,
    backgroundColor: "#C62828",
  },

  instructionsContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  instructionsLabel: {
    fontFamily: "Rubik_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },
  step: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  stepBadge: {
    width: 20,
    height: 20,
    backgroundColor: "#C62828",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  stepNumber: {
    fontFamily: "Rubik_700Bold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  stepText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
});

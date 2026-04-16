import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import { kgToLbs, lbsToKg } from "@/utils/nutritionCalculator";

// ─── 1RM Formulas ─────────────────────────────────────────────────────────────
// All validated in scientific literature; each performs best at different rep ranges.

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function brzycki(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps >= 37) return weight; // formula breaks down at high reps
  return weight * (36 / (37 - reps));
}

function lander(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return (100 * weight) / (101.3 - 2.67123 * reps);
}

function lombardi(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * Math.pow(reps, 0.1);
}

function average1RM(weight: number, reps: number): number {
  const estimates = [epley(weight, reps), brzycki(weight, reps), lander(weight, reps)];
  return estimates.reduce((a, b) => a + b, 0) / estimates.length;
}

// Percentage of 1RM → reps (Prilepin / % table approximation)
const PERCENT_TABLE = [
  { pct: 100, reps: 1, label: "1 Rep Max" },
  { pct: 95, reps: 2, label: "Heavy Single" },
  { pct: 90, reps: 3, label: "Strength" },
  { pct: 85, reps: 5, label: "Strength" },
  { pct: 80, reps: 7, label: "Strength/Hypertrophy" },
  { pct: 75, reps: 10, label: "Hypertrophy" },
  { pct: 70, reps: 12, label: "Hypertrophy" },
  { pct: 65, reps: 15, label: "Hypertrophy/Endurance" },
  { pct: 60, reps: 20, label: "Endurance" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OneRepMaxScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const w = parseFloat(weight);
  const r = parseInt(reps);
  const valid = !isNaN(w) && w > 0 && !isNaN(r) && r >= 1 && r <= 30;

  // Convert input to kg for calculations, display back in user's unit
  const weightKg = useMemo(() => {
    if (!valid) return 0;
    return unit === "lbs" ? lbsToKg(w) : w;
  }, [w, r, unit, valid]);

  const oneRmKg = valid ? average1RM(weightKg, r) : 0;

  function displayWeight(kg: number): string {
    const val = unit === "lbs" ? kgToLbs(kg) : kg;
    return Math.round(val).toString();
  }

  const formulas = valid
    ? [
        { name: "Epley",    value: displayWeight(epley(weightKg, r)),    note: "Best for 1–10 reps" },
        { name: "Brzycki",  value: displayWeight(brzycki(weightKg, r)),  note: "Best for 2–10 reps" },
        { name: "Lander",   value: displayWeight(lander(weightKg, r)),   note: "General purpose" },
        { name: "Lombardi", value: displayWeight(lombardi(weightKg, r)), note: "Higher rep sets" },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/body")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            1RM Calculator
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

          {/* Inputs */}
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <View style={{ flex: 2 }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Weight Lifted ({unit})
              </Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder={unit === "lbs" ? "e.g. 225" : "e.g. 100"}
                placeholderTextColor={Colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent,
                  paddingHorizontal: 14,
                  paddingVertical: 16,
                  fontFamily: "Rubik_700Bold",
                  fontSize: 24,
                  color: Colors.text,
                  textAlign: "center",
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Reps
              </Text>
              <TextInput
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="e.g. 5"
                placeholderTextColor={Colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent,
                  paddingHorizontal: 14,
                  paddingVertical: 16,
                  fontFamily: "Rubik_700Bold",
                  fontSize: 24,
                  color: Colors.text,
                  textAlign: "center",
                }}
              />
            </View>
          </View>

          {/* Estimated 1RM */}
          {valid && (
            <>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "66",
                borderLeftWidth: 3,
                borderLeftColor: Colors.primary,
                padding: 20,
                alignItems: "center",
                marginBottom: 20,
              }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                  Estimated 1 Rep Max
                </Text>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 48, color: Colors.text }}>
                  {displayWeight(oneRmKg)}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 14, color: Colors.textMuted }}>
                  {unit} (average of 3 formulas)
                </Text>
              </View>

              {/* Formula breakdown */}
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
                Formula Breakdown
              </Text>
              <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 20 }}>
                {formulas.map((f, i) => (
                  <View
                    key={f.name}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 14,
                      borderTopWidth: i > 0 ? 1 : 0,
                      borderTopColor: Colors.border,
                    }}
                  >
                    <View>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                        {f.name}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                        {f.note}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text }}>
                      {f.value} <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted }}>{unit}</Text>
                    </Text>
                  </View>
                ))}
              </View>

              {/* % of 1RM table */}
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
                Training Zones
              </Text>
              <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 20 }}>
                {PERCENT_TABLE.map((row, i) => {
                  const zoneWeight = (row.pct / 100) * oneRmKg;
                  const isCurrentInput = row.pct === 100;
                  return (
                    <View
                      key={row.pct}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 12,
                        borderTopWidth: i > 0 ? 1 : 0,
                        borderTopColor: Colors.border,
                        backgroundColor: isCurrentInput ? Colors.primary + "11" : "transparent",
                      }}
                    >
                      <View style={{
                        width: 40,
                        height: 24,
                        backgroundColor: isCurrentInput ? Colors.primary : Colors.bgAccent,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: isCurrentInput ? Colors.text : Colors.textMuted }}>
                          {row.pct}%
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text }}>
                          {displayWeight(zoneWeight)} {unit}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
                          {row.label}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.textSecondary }}>
                        ×{row.reps}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Science note */}
              <View style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderLeftWidth: 3,
                borderLeftColor: Colors.primary,
                padding: 14,
              }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                  Accuracy Note
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  1RM formulas are most accurate with 1–5 rep sets. Accuracy drops above 10 reps due to fatigue compounding the estimate. Use the average of multiple formulas for the best estimate. Actual 1RM testing is always more accurate but carries higher injury risk.
                </Text>
              </View>
            </>
          )}

          {!valid && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 12, textAlign: "center" }}>
                Enter a weight and rep count to calculate your estimated 1 rep max.
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

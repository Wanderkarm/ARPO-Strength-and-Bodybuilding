import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getWeightBaselines, updateWeightBaselines, getUserUnit } from "@/lib/local-db";
import type { BaselineWeights } from "@/utils/categoryWeightMap";

type Step = "weights";

const TOTAL_FLOW_STEPS = 5;
const STEP_NUMBERS: Record<Step, number> = { weights: 5 };

// ─── Lift display config ───────────────────────────────────────────────────────
const LIFTS: Array<{ key: keyof BaselineWeights; label: string; icon: string; category: string }> = [
  { key: "squat",         label: "Back Squat",     icon: "fitness-outline",   category: "Legs" },
  { key: "benchPress",    label: "Bench Press",     icon: "barbell-outline",   category: "Push" },
  { key: "deadlift",      label: "Deadlift",        icon: "barbell-outline",   category: "Legs" },
  { key: "overheadPress", label: "Overhead Press",  icon: "arrow-up-outline",  category: "Push" },
  { key: "barbellRow",    label: "Barbell Row",     icon: "swap-horizontal-outline", category: "Pull" },
  { key: "barbellCurl",   label: "Barbell Curl",    icon: "body-outline",      category: "Arms" },
];

export default function PostOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [step, setStep] = useState<Step>("weights");
  const [userId, setUserId] = useState<string | null>(null);
  const [unit, setUnit] = useState<"lbs" | "kg">("lbs");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Weights state ──────────────────────────────────────────────────────────
  const [weights, setWeights] = useState<BaselineWeights>({
    squat: 135,
    benchPress: 95,
    deadlift: 135,
    overheadPress: 65,
    barbellRow: 95,
    barbellCurl: 45,
  });
  const [weightInputs, setWeightInputs] = useState<Record<keyof BaselineWeights, string>>({
    squat: "135",
    benchPress: "95",
    deadlift: "135",
    overheadPress: "65",
    barbellRow: "95",
    barbellCurl: "45",
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;
      setUserId(uid);
      const [u, baselines] = await Promise.all([getUserUnit(uid), getWeightBaselines(uid)]);
      setUnit(u);
      if (baselines) {
        setWeights(baselines);
        setWeightInputs({
          squat:         String(baselines.squat),
          benchPress:    String(baselines.benchPress),
          deadlift:      String(baselines.deadlift),
          overheadPress: String(baselines.overheadPress),
          barbellRow:    String(baselines.barbellRow),
          barbellCurl:   String(baselines.barbellCurl),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function updateInput(key: keyof BaselineWeights, val: string) {
    setWeightInputs((prev) => ({ ...prev, [key]: val }));
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setWeights((prev) => ({ ...prev, [key]: Math.round(num) }));
    }
  }

  async function handleSaveWeights() {
    if (!userId) return;
    setSaving(true);
    try {
      // Flush any partially-typed inputs
      const committed = { ...weights };
      for (const lift of LIFTS) {
        const num = parseFloat(weightInputs[lift.key]);
        if (!isNaN(num) && num > 0) committed[lift.key] = Math.round(num);
      }
      await updateWeightBaselines(userId, committed);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ─── Progress bar ────────────────────────────────────────────────────────────
  const currentStep = STEP_NUMBERS[step];
  const progressBar = (
    <View style={{ flexDirection: "row", gap: 3, marginBottom: 24 }}>
      {Array.from({ length: TOTAL_FLOW_STEPS }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            backgroundColor: i < currentStep ? Colors.primary : Colors.border,
          }}
        />
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 10: STARTING WEIGHTS
  // ──────────────────────────────────────────────────────────────────────────────
  if (step === "weights") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 24, paddingTop: topInset + 16 }}>
            {progressBar}

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Step {currentStep} of {TOTAL_FLOW_STEPS}
              </Text>
            </View>

            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 26, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Starting Weights
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 20 }}>
              ARPO estimated these from your bodyweight. Fine-tune them to match your last working sets — the closer to reality, the better your Week 1 targets.
            </Text>

            {/* Info box */}
            <View style={{
              borderWidth: 1, borderColor: Colors.border,
              borderLeftWidth: 3, borderLeftColor: Colors.primary,
              backgroundColor: Colors.primary + "0A",
              padding: 14, marginBottom: 24,
              flexDirection: "row", alignItems: "flex-start", gap: 10,
            }}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, flex: 1 }}>
                These are your <Text style={{ color: Colors.text, fontFamily: "Rubik_600SemiBold" }}>working set weights</Text> — what you currently lift for a typical work set. ARPO uses them to estimate starting loads for each exercise and auto-adjusts every session as you log your sets.
              </Text>
            </View>

            {/* Lift inputs */}
            <View style={{ gap: 10, marginBottom: 28 }}>
              {LIFTS.map((lift) => (
                <View key={lift.key} style={{
                  borderWidth: 1, borderColor: Colors.border,
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 14, paddingVertical: 12,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                      {lift.label}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {lift.category}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={weightInputs[lift.key]}
                      onChangeText={(v) => updateInput(lift.key, v)}
                      keyboardType="numeric"
                      style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 20,
                        color: Colors.primary,
                        textAlign: "right",
                        minWidth: 64,
                        borderBottomWidth: 1,
                        borderBottomColor: Colors.primary,
                        paddingBottom: 2,
                      }}
                    />
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.textMuted }}>
                      {unit}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Save & Continue */}
            <Pressable
              onPress={handleSaveWeights}
              disabled={saving}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
                marginBottom: 12,
              })}
            >
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Save & Continue →
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: "center", paddingVertical: 8 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Use Estimates →
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

}

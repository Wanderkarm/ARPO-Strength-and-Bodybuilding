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
import { getWeightBaselines, updateWeightBaselines, getUserUnit, getUserProfile } from "@/lib/local-db";
import type { BaselineWeights } from "@/utils/categoryWeightMap";

type Step = "weights";

const TOTAL_FLOW_STEPS = 5;
const STEP_NUMBERS: Record<Step, number> = { weights: 5 };

// ─── Lift display config ───────────────────────────────────────────────────────
const LIFTS: Array<{ key: keyof BaselineWeights; label: string; icon: string; category: string }> = [
  { key: "squat",         label: "Back Squat",     icon: "fitness-outline",         category: "Legs" },
  { key: "benchPress",    label: "Bench Press",     icon: "barbell-outline",         category: "Push" },
  { key: "deadlift",      label: "Deadlift",        icon: "barbell-outline",         category: "Legs" },
  { key: "overheadPress", label: "Overhead Press",  icon: "arrow-up-outline",        category: "Push" },
  { key: "barbellRow",    label: "Barbell Row",     icon: "swap-horizontal-outline", category: "Pull" },
  { key: "barbellCurl",   label: "Barbell Curl",    icon: "body-outline",            category: "Arms" },
];

const LIFT_SUBSTEPS: Array<{
  title: string;
  subtitle: string;
  keys: (keyof BaselineWeights)[];
}> = [
  { title: "What do you currently lift?", subtitle: "Tap a range or enter your own — 2 lifts per step", keys: ["squat", "deadlift"] },
  { title: "Push",        subtitle: "Horizontal and vertical pressing", keys: ["benchPress", "overheadPress"] },
  { title: "Pull & Arms", subtitle: "Rowing and curl strength",         keys: ["barbellRow", "barbellCurl"] },
];

// ─── Bodyweight-scaled tier system ────────────────────────────────────────────
// Ratios [Light, Moderate, Heavy] as a fraction of bodyweight, tuned to real
// working-set norms for beginner → intermediate lifters.
const LIFT_TIER_RATIOS: Record<keyof BaselineWeights, [number, number, number]> = {
  squat:         [0.54, 0.77, 1.06],
  deadlift:      [0.66, 0.89, 1.17],
  benchPress:    [0.43, 0.60, 0.83],
  overheadPress: [0.26, 0.37, 0.54],
  barbellRow:    [0.37, 0.54, 0.77],
  barbellCurl:   [0.20, 0.31, 0.43],
};

const TIER_LABELS: ["Light", "Moderate", "Heavy"] = ["Light", "Moderate", "Heavy"];

/** Snap to nearest loadable barbell increment (5 lb / 2.5 kg, floor at 45 / 20). */
function snapBarbell(w: number, unit: "lbs" | "kg"): number {
  if (unit === "kg") return Math.max(20, Math.round(w / 2.5) * 2.5);
  return Math.max(45, Math.round(w / 5) * 5);
}

function calcTiers(
  key: keyof BaselineWeights,
  bw: number,
  unit: "lbs" | "kg"
): [number, number, number] {
  const ratios = LIFT_TIER_RATIOS[key];
  return ratios.map((r) => snapBarbell(bw * r, unit)) as [number, number, number];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PostOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [step, setStep] = useState<Step>("weights");
  const [weightSubstep, setWeightSubstep] = useState<1 | 2 | 3>(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [unit, setUnit] = useState<"lbs" | "kg">("lbs");
  const [bodyweight, setBodyweight] = useState(165); // lbs default; updated from profile
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Weights state ──────────────────────────────────────────────────────────
  const [weights, setWeights] = useState<BaselineWeights>({
    squat: 135, benchPress: 95, deadlift: 135,
    overheadPress: 65, barbellRow: 95, barbellCurl: 45,
  });
  const [weightInputs, setWeightInputs] = useState<Record<keyof BaselineWeights, string>>({
    squat: "135", benchPress: "95", deadlift: "135",
    overheadPress: "65", barbellRow: "95", barbellCurl: "45",
  });

  // Tracks which tier chip (0=Light, 1=Moderate, 2=Heavy) is selected per lift,
  // or undefined if the user typed a custom value.
  const [selectedTier, setSelectedTier] = useState<Partial<Record<keyof BaselineWeights, number>>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;
      setUserId(uid);

      const [u, baselines, profile] = await Promise.all([
        getUserUnit(uid),
        getWeightBaselines(uid),
        getUserProfile(uid),
      ]);
      setUnit(u);

      // Use profile bodyweight to seed the tier calculations (stored in user's unit)
      if (profile?.bodyweight && profile.bodyweight > 0) {
        setBodyweight(profile.bodyweight);
      } else {
        // Sensible fallback if bodyweight wasn't set during onboarding
        setBodyweight(u === "kg" ? 75 : 165);
      }

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

  /** User typed a number — clear any tier selection for this lift. */
  function updateInput(key: keyof BaselineWeights, val: string) {
    setSelectedTier((prev) => ({ ...prev, [key]: undefined }));
    setWeightInputs((prev) => ({ ...prev, [key]: val }));
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setWeights((prev) => ({ ...prev, [key]: Math.round(num) }));
    }
  }

  /** User tapped a tier chip — populate the input and mark selection. */
  function selectTier(key: keyof BaselineWeights, tierIndex: number, value: number) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTier((prev) => ({ ...prev, [key]: tierIndex }));
    setWeightInputs((prev) => ({ ...prev, [key]: String(value) }));
    setWeights((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveWeights() {
    if (!userId) return;
    setSaving(true);
    try {
      const committed = { ...weights };
      for (const lift of LIFTS) {
        const num = parseFloat(weightInputs[lift.key]);
        if (!isNaN(num) && num > 0) committed[lift.key] = Math.round(num);
      }
      await updateWeightBaselines(userId, committed);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/health-permissions");
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
        <View key={i} style={{ flex: 1, height: 3, backgroundColor: i < currentStep ? Colors.primary : Colors.border }} />
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
  // STEP: STARTING WEIGHTS (3 substeps of 2 lifts each)
  // ──────────────────────────────────────────────────────────────────────────────
  if (step === "weights") {
    const substep = LIFT_SUBSTEPS[weightSubstep - 1];
    const isLastSubstep = weightSubstep === 3;

    function handleSubstepNext() {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (isLastSubstep) {
        handleSaveWeights();
      } else {
        setWeightSubstep((weightSubstep + 1) as 1 | 2 | 3);
      }
    }

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

            {/* Step label + substep dots */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Step {currentStep} of {TOTAL_FLOW_STEPS}
              </Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[1, 2, 3].map(n => (
                  <View key={n} style={{ width: 6, height: 6, backgroundColor: n <= weightSubstep ? Colors.primary : Colors.border }} />
                ))}
              </View>
            </View>

            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 26, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              {substep.title}
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 }}>
              {substep.subtitle}
            </Text>

            {/* Info box — only on first substep */}
            {weightSubstep === 1 && (
              <View style={{
                borderWidth: 1, borderColor: Colors.border,
                borderLeftWidth: 3, borderLeftColor: Colors.primary,
                backgroundColor: Colors.primary + "0A",
                padding: 14, marginBottom: 20,
                flexDirection: "row", alignItems: "flex-start", gap: 10,
              }}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} style={{ marginTop: 2 }} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, flex: 1 }}>
                  These <Text style={{ color: Colors.text, fontFamily: "Rubik_600SemiBold" }}>6 key lifts</Text> tell ARPO how strong you are — it estimates starting weights for every other exercise from them.{" "}
                  <Text style={{ color: Colors.text, fontFamily: "Rubik_600SemiBold" }}>Not sure what to enter?</Text> Tap a range on each card. You can fine-tune after your first session.
                </Text>
              </View>
            )}

            {/* Lift cards with tier chips */}
            <View style={{ gap: 10, marginBottom: 28 }}>
              {substep.keys.map((key) => {
                const lift = LIFTS.find(l => l.key === key)!;
                const tiers = calcTiers(key, bodyweight, unit);
                const activeTier = selectedTier[key];
                const hasSelection = activeTier !== undefined;

                return (
                  <View key={key} style={{ borderWidth: 1, borderColor: hasSelection ? Colors.primary + "66" : Colors.border }}>

                    {/* Name + number input row */}
                    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 15, color: Colors.text }}>
                          {lift.label}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                          {lift.category}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TextInput
                          value={weightInputs[key]}
                          onChangeText={(v) => updateInput(key, v)}
                          keyboardType="numeric"
                          style={{
                            fontFamily: "Rubik_700Bold",
                            fontSize: 24,
                            color: Colors.primary,
                            textAlign: "right",
                            minWidth: 72,
                            borderBottomWidth: 1,
                            borderBottomColor: Colors.primary,
                            paddingBottom: 2,
                          }}
                        />
                        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                          {unit}
                        </Text>
                      </View>
                    </View>

                    {/* Tier chips row */}
                    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border }}>
                      {TIER_LABELS.map((label, i) => {
                        const isSelected = activeTier === i;
                        return (
                          <Pressable
                            key={label}
                            onPress={() => selectTier(key, i, tiers[i])}
                            style={({ pressed }) => ({
                              flex: 1,
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor: isSelected ? Colors.primary + "1A" : "transparent",
                              borderRightWidth: i < 2 ? 1 : 0,
                              borderRightColor: Colors.border,
                              opacity: pressed ? 0.7 : 1,
                            })}
                          >
                            <Text style={{
                              fontFamily: "Rubik_700Bold",
                              fontSize: 14,
                              color: isSelected ? Colors.primary : Colors.textSecondary,
                            }}>
                              {tiers[i]}
                            </Text>
                            <Text style={{
                              fontFamily: "Rubik_400Regular",
                              fontSize: 9,
                              color: isSelected ? Colors.primary : Colors.textMuted,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                              marginTop: 2,
                            }}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                  </View>
                );
              })}
            </View>

            {/* Continue / Save button */}
            <Pressable
              onPress={handleSubstepNext}
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
                  {isLastSubstep ? "Save & Continue →" : "Next →"}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace("/(tabs)")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: Colors.border,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
                marginBottom: 10,
              })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Skip — Use ARPO's Estimates
              </Text>
            </Pressable>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", lineHeight: 17 }}>
              Not sure of your numbers? ARPO estimates all starting weights.{"\n"}Fine-tune any lift after your first session.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

}

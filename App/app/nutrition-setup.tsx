import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  getNutritionProfile,
  updateNutritionProfile,
  getUserProfile,
} from "@/lib/local-db";
import {
  ACTIVITY_LABELS,
  validateTimeline,
  lbsToKg,
  kgToLbs,
  cmToFtIn,
  ftInToCm,
  type ActivityLevel,
  type BodyGoal,
} from "@/utils/nutritionCalculator";

const BODY_GOALS: { key: BodyGoal; label: string; tagline: string; icon: string; color: string }[] = [
  {
    key: "cut",
    label: "Lose Fat",
    tagline: "Caloric deficit · Preserve muscle · Lean out",
    icon: "trending-down",
    color: "#E53935",
  },
  {
    key: "recomp",
    label: "Recompose",
    tagline: "Lose fat & gain muscle simultaneously",
    icon: "swap-vertical",
    color: Colors.primary,
  },
  {
    key: "bulk",
    label: "Build Muscle",
    tagline: "Caloric surplus · Maximise muscle growth",
    icon: "trending-up",
    color: "#43A047",
  },
];

type Step = 1 | 2 | 3 | 4;

export default function NutritionSetupScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { unit } = useUnit();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isOnboarding = from === "onboarding";

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — body goal
  const [bodyGoal, setBodyGoal] = useState<BodyGoal>("recomp");

  // Step 2 — physical details
  const [heightFt, setHeightFt] = useState("5");
  const [heightIn, setHeightIn] = useState("10");
  const [heightCm, setHeightCm] = useState("178");
  const [age, setAge] = useState("");

  // Step 3 — activity level
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");

  // Step 4 — target + timeline (cut/bulk only)
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [weeksToGoal, setWeeksToGoal] = useState("12");

  // Timeline validation result
  const [timelineCheck, setTimelineCheck] = useState<ReturnType<typeof validateTimeline> | null>(null);
  const [experience, setExperience] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">("INTERMEDIATE");

  useEffect(() => {
    loadExisting();
  }, []);

  async function loadExisting() {
    const uid = await AsyncStorage.getItem("userId");
    if (!uid) return;
    const profile = await getUserProfile(uid);
    if (profile) {
      setExperience(profile.experience as "BEGINNER" | "INTERMEDIATE" | "ADVANCED");
      if (profile.bodyweight) {
        // bodyweight is stored in the user's native unit — no conversion needed
        setCurrentWeight(String(Math.round(profile.bodyweight)));
      }
    }
    const nutrition = await getNutritionProfile(uid);
    if (nutrition) {
      if (nutrition.bodyGoal) setBodyGoal(nutrition.bodyGoal as BodyGoal);
      if (nutrition.heightCm) {
        setHeightCm(String(Math.round(nutrition.heightCm)));
        const totalIn = nutrition.heightCm / 2.54;
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(Math.round(totalIn % 12)));
      }
      if (nutrition.age) setAge(String(nutrition.age));
      if (nutrition.activityLevel) setActivityLevel(nutrition.activityLevel as ActivityLevel);
      if (nutrition.targetWeightKg) {
        const tw = unit === "kg"
          ? String(Math.round(nutrition.targetWeightKg))
          : String(Math.round(kgToLbs(nutrition.targetWeightKg)));
        setTargetWeight(tw);
      }
      if (nutrition.weeksToGoal) setWeeksToGoal(String(nutrition.weeksToGoal));
    }
  }

  function handleHeightFtChange(val: string) {
    setHeightFt(val);
    const ft = parseInt(val) || 0;
    const inches = parseInt(heightIn) || 0;
    setHeightCm(String(ftInToCm(ft, inches)));
  }

  function handleHeightInChange(val: string) {
    setHeightIn(val);
    const ft = parseInt(heightFt) || 0;
    const inches = parseInt(val) || 0;
    setHeightCm(String(ftInToCm(ft, inches)));
  }

  function checkTimeline() {
    const current = unit === "kg" ? parseFloat(currentWeight) : lbsToKg(parseFloat(currentWeight));
    const target = unit === "kg" ? parseFloat(targetWeight) : lbsToKg(parseFloat(targetWeight));
    const weeks = parseInt(weeksToGoal);
    if (!current || !target || !weeks || current === target) {
      setTimelineCheck(null);
      return;
    }
    const result = validateTimeline(current, target, weeks, bodyGoal, experience);
    setTimelineCheck(result);
  }

  async function handleSave() {
    const uid = await AsyncStorage.getItem("userId");
    if (!uid) return;
    setSaving(true);
    try {
      const parsedFt = parseInt(heightFt);
      const parsedIn = parseInt(heightIn);
      const cm = unit === "lbs"
        ? ftInToCm(isNaN(parsedFt) ? 5 : parsedFt, isNaN(parsedIn) ? 0 : parsedIn)
        : parseFloat(heightCm) || 178;

      const targetKg = targetWeight
        ? unit === "kg"
          ? parseFloat(targetWeight)
          : lbsToKg(parseFloat(targetWeight))
        : null;

      await updateNutritionProfile(uid, {
        heightCm: cm,
        age: parseInt(age) || 25,
        activityLevel,
        bodyGoal,
        targetWeightKg: targetKg,
        weeksToGoal: parseInt(weeksToGoal) || null,
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(isOnboarding ? "/templates?from=onboarding" : "/nutrition");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === 1) {
      if (isOnboarding) {
        router.replace("/onboarding");
      } else {
        router.canGoBack() ? router.back() : router.replace("/(tabs)");
      }
    } else {
      setStep((step - 1) as Step);
    }
  }

  function nextStep() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 3 && bodyGoal === "recomp") {
      handleSave();
    } else {
      setStep((step + 1) as Step);
    }
  }

  const totalSteps = bodyGoal === "recomp" ? 3 : 4;
  const stepLabels = bodyGoal === "recomp"
    ? ["Goal", "Details", "Activity"]
    : ["Goal", "Details", "Activity", "Target"];

  const canProceedStep2 = age.trim() !== "" && parseInt(age) > 0 && parseInt(age) < 100 &&
    (unit === "lbs"
      ? (parseInt(heightFt) > 0)
      : (parseFloat(heightCm) > 0));

  const canProceedStep4 = targetWeight.trim() !== "" && weeksToGoal.trim() !== "";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            {isOnboarding ? "Set Up Nutrition" : "Nutrition Setup"}
          </Text>
        </View>
        {isOnboarding && step === 1 ? (
          <Pressable onPress={() => router.replace("/templates?from=onboarding")} hitSlop={12}>
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Skip
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {/* Progress bar */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {stepLabels.map((label, i) => {
          const isActive = step === i + 1;
          const isDone = step > i + 1;
          return (
            <View key={label} style={{ flex: 1, alignItems: "center", gap: 5 }}>
              <View style={{ height: 2, width: "100%", backgroundColor: isActive || isDone ? Colors.primary : Colors.border }} />
              <Text style={{ fontFamily: isActive ? "Rubik_600SemiBold" : "Rubik_400Regular", fontSize: 9, color: isActive ? Colors.primary : isDone ? Colors.textSecondary : Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* ── Step 1: Body Goal ── */}
        {step === 1 && (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                What's Your Goal?
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 28 }}>
                This sets your calorie target and macro split. You can change it any time in Settings.
              </Text>

              {BODY_GOALS.map((g) => (
                <Pressable
                  key={g.key}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBodyGoal(g.key);
                  }}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: bodyGoal === g.key ? g.color : Colors.border,
                    borderLeftWidth: 3,
                    borderLeftColor: g.color,
                    backgroundColor: bodyGoal === g.key ? g.color + "11" : Colors.bg,
                    paddingHorizontal: 16,
                    paddingVertical: 18,
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Ionicons name={g.icon as any} size={24} color={g.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: bodyGoal === g.key ? g.color : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                      {g.label}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {g.tagline}
                    </Text>
                  </View>
                  {bodyGoal === g.key && (
                    <Ionicons name="checkmark-circle" size={20} color={g.color} />
                  )}
                </Pressable>
              ))}

              {bodyGoal === "recomp" && (
                <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 8, backgroundColor: Colors.bgAccent }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                    Who is Recomposition For?
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                    Recomp works best for: beginners, returning lifters (muscle memory), and those with a higher body fat percentage ({">"} 20% for men, {">"} 28% for women). Results are slower but you don't need to cycle between phases.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
              <Pressable
                onPress={nextStep}
                style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Continue →
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Step 2: Physical Details ── */}
        {step === 2 && (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                Your Details
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 28 }}>
                Used to calculate your BMR (Basal Metabolic Rate) via the Mifflin-St Jeor equation — the most validated formula for TDEE estimation.
              </Text>

              {/* Height */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Height
              </Text>
              {unit === "lbs" ? (
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={heightFt}
                      onChangeText={handleHeightFtChange}
                      keyboardType="number-pad"
                      style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                    />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>Feet</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={heightIn}
                      onChangeText={handleHeightInChange}
                      keyboardType="number-pad"
                      style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                    />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>Inches</Text>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  <TextInput
                    value={heightCm}
                    onChangeText={setHeightCm}
                    keyboardType="decimal-pad"
                    style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                  />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>cm</Text>
                </View>
              )}

              {/* Age */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Age
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                  placeholder="e.g. 28"
                  placeholderTextColor={Colors.textMuted}
                  style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }} numberOfLines={1}>yrs</Text>
              </View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 8 }}>
                Age affects your BMR — metabolism slows ~1–2% per decade after 25.
              </Text>
            </ScrollView>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
              <Pressable
                onPress={nextStep}
                disabled={!canProceedStep2}
                style={({ pressed }) => ({ backgroundColor: canProceedStep2 ? Colors.primary : Colors.bgAccent, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: canProceedStep2 ? Colors.text : Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                  Continue →
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Step 3: Activity Level ── */}
        {step === 3 && (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                Activity Level
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 24 }}>
                Choose based on your <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>total daily activity</Text>, including your training sessions. A desk-job lifter training 4×/week is typically Moderately Active.
              </Text>

              {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, typeof ACTIVITY_LABELS[ActivityLevel]][]).map(([key, val]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActivityLevel(key);
                  }}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: activityLevel === key ? Colors.primary : Colors.border,
                    backgroundColor: activityLevel === key ? Colors.primary + "11" : Colors.bg,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: activityLevel === key ? Colors.primary : Colors.text }}>
                      {val.label}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {val.description}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: activityLevel === key ? Colors.primary : Colors.textMuted }}>
                    ×{val.multiplier}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
              <Pressable
                onPress={nextStep}
                style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  {bodyGoal === "recomp" ? "Calculate My Targets →" : "Continue →"}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Step 4: Target Weight + Timeline (cut/bulk only) ── */}
        {step === 4 && bodyGoal !== "recomp" && (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                Your Target
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 24 }}>
                We'll tell you if your timeline is realistic and suggest an aggressive-but-safe alternative if it isn't.
              </Text>

              {/* Current weight */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Current Weight ({unit})
              </Text>
              <TextInput
                value={currentWeight}
                onChangeText={(v) => { setCurrentWeight(v); setTimelineCheck(null); }}
                keyboardType="decimal-pad"
                placeholder={unit === "lbs" ? "e.g. 185" : "e.g. 84"}
                placeholderTextColor={Colors.textMuted}
                style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 20 }}
              />

              {/* Target weight */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Target Weight ({unit})
              </Text>
              <TextInput
                value={targetWeight}
                onChangeText={(v) => { setTargetWeight(v); setTimelineCheck(null); }}
                keyboardType="decimal-pad"
                placeholder={bodyGoal === "cut" ? (unit === "lbs" ? "e.g. 165" : "e.g. 75") : (unit === "lbs" ? "e.g. 200" : "e.g. 91")}
                placeholderTextColor={Colors.textMuted}
                style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 20 }}
              />

              {/* Timeline */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Timeline (Weeks)
              </Text>
              <TextInput
                value={weeksToGoal}
                onChangeText={(v) => { setWeeksToGoal(v); setTimelineCheck(null); }}
                keyboardType="number-pad"
                placeholder="e.g. 16"
                placeholderTextColor={Colors.textMuted}
                style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 16 }}
              />

              {/* Check timeline button */}
              {!timelineCheck && currentWeight && targetWeight && weeksToGoal ? (
                <Pressable
                  onPress={checkTimeline}
                  style={({ pressed }) => ({ borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, alignItems: "center", marginBottom: 16, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                    Check If This Is Realistic
                  </Text>
                </Pressable>
              ) : null}

              {/* Timeline result */}
              {timelineCheck && (
                <View style={{
                  borderWidth: 1,
                  borderColor: timelineCheck.isRealistic ? Colors.success : Colors.warning,
                  borderLeftWidth: 3,
                  borderLeftColor: timelineCheck.isRealistic ? Colors.success : Colors.warning,
                  padding: 14,
                  marginBottom: 16,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Ionicons
                      name={timelineCheck.isRealistic ? "checkmark-circle" : "warning"}
                      size={18}
                      color={timelineCheck.isRealistic ? Colors.success : Colors.warning}
                    />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: timelineCheck.isRealistic ? Colors.success : Colors.warning, textTransform: "uppercase", letterSpacing: 1 }}>
                      {timelineCheck.isRealistic ? "Realistic Goal" : "Ambitious Timeline"}
                    </Text>
                  </View>

                  {!timelineCheck.isRealistic && (
                    <>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 }}>
                        {timelineCheck.explanation}
                      </Text>
                      <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 10, backgroundColor: Colors.bgAccent }}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, marginBottom: 2 }}>
                          Realistic timeline: <Text style={{ color: Colors.primary }}>{timelineCheck.realisticWeeks} weeks</Text>
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                          At a safe rate of {unit === "lbs"
                            ? `${(kgToLbs(timelineCheck.maxWeeklyKg)).toFixed(1)} lbs/week`
                            : `${timelineCheck.maxWeeklyKg.toFixed(2)} kg/week`
                          }
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setWeeksToGoal(String(timelineCheck.realisticWeeks))}
                        style={({ pressed }) => ({ marginTop: 10, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                      >
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                          Use {timelineCheck.realisticWeeks} weeks instead
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {timelineCheck.isRealistic && (
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                      Losing {unit === "lbs"
                        ? `${kgToLbs(timelineCheck.requiredWeeklyKg).toFixed(1)} lbs/week`
                        : `${timelineCheck.requiredWeeklyKg.toFixed(2)} kg/week`
                      } is within safe limits. Your muscle mass will be well-protected at high protein intake.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
              <Pressable
                onPress={handleSave}
                disabled={!canProceedStep4 || saving}
                style={({ pressed }) => ({ backgroundColor: canProceedStep4 ? Colors.primary : Colors.bgAccent, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: canProceedStep4 ? Colors.text : Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                    Calculate My Targets →
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  estimateWeights,
  type Gender,
  type ExperienceLevel,
} from "@/utils/onboardingCalculator";
import {
  ACTIVITY_LABELS,
  ftInToCm,
  lbsToKg,
  type ActivityLevel,
  type BodyGoal,
} from "@/utils/nutritionCalculator";
import {
  createUser,
  updateNutritionProfile,
} from "@/lib/local-db";
import { useUnit, type WeightUnit } from "@/contexts/UnitContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "welcome" | "unit" | "identity" | "physical" | "goals" | "target" | "pace" | "summary";

// ─── Static data ──────────────────────────────────────────────────────────────

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; desc: string; detail: string }[] = [
  {
    value: "BEGINNER",
    label: "Beginner",
    desc: "Less than 1 year of consistent training",
    detail: "Lower starting volume — your body responds well to almost anything right now.",
  },
  {
    value: "INTERMEDIATE",
    label: "Intermediate",
    desc: "1–3 years of consistent training",
    detail: "Moderate volume with progressive overload. The sweet spot for most people.",
  },
  {
    value: "ADVANCED",
    label: "Advanced",
    desc: "3+ years of serious training",
    detail: "Higher volume and intensity needed to keep driving adaptation.",
  },
];

const BODY_GOALS: { key: BodyGoal; label: string; tagline: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "cut",    label: "Lose Fat",     tagline: "Caloric deficit · Preserve muscle · Lean out",        icon: "trending-down",  color: "#E53935" },
  { key: "recomp", label: "Recompose",    tagline: "Lose fat & gain muscle simultaneously",                icon: "swap-vertical",  color: Colors.primary },
  { key: "bulk",   label: "Build Muscle", tagline: "Caloric surplus · Maximise muscle growth",            icon: "trending-up",    color: "#43A047" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { refreshUnit } = useUnit();

  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);

  // Step: unit
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");

  // Step: identity — gender
  const [gender, setGender] = useState<Gender | null>(null);

  // Step: identity — bodyweight (optional)
  const [bodyweight, setBodyweight] = useState("");

  // Step: identity — experience
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);

  // Step: goals — body goal
  const [bodyGoal, setBodyGoal] = useState<BodyGoal>("recomp");

  // Step: goals — height + age
  const [heightFt, setHeightFt] = useState("5");
  const [heightIn, setHeightIn] = useState("10");
  const [heightCm, setHeightCm] = useState("178");
  const [age, setAge] = useState("");

  // Step: goals — activity
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");

  // Step: pace — deficit/surplus aggressiveness (cut/bulk only)
  const [deficitPace, setDeficitPace] = useState<"slow" | "moderate" | "aggressive">("moderate");

  // Step: target — current + target weight (cut/bulk only, optional)
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");

  // Dynamic step config — summary always last, target+pace only for cut/bulk
  const NUMBERED_STEPS: Step[] = bodyGoal === "recomp"
    ? ["unit", "identity", "physical", "goals", "summary"]
    : ["unit", "identity", "physical", "goals", "target", "pace", "summary"];
  const TOTAL_FLOW_STEPS = bodyGoal === "recomp" ? 7 : 9;
  // recomp: 5 onboarding + templates + weights = 7
  // cut/bulk: 7 onboarding + templates + weights = 9

  // Estimated TDEE for summary screen
  const tdeeEstimate = useMemo(() => {
    if (!gender) return null;
    const multipliers: Record<ActivityLevel, number> = {
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    };
    const bwKg = currentWeight && parseFloat(currentWeight) > 0
      ? (weightUnit === "lbs" ? lbsToKg(parseFloat(currentWeight)) : parseFloat(currentWeight))
      : gender === "MALE" ? 75 : 60;
    const h = weightUnit === "lbs"
      ? ftInToCm(parseInt(heightFt) || 5, parseInt(heightIn) || 10)
      : parseFloat(heightCm) || 178;
    const a = parseInt(age) || 25;
    const bmr = gender === "MALE"
      ? 10 * bwKg + 6.25 * h - 5 * a + 5
      : 10 * bwKg + 6.25 * h - 5 * a - 161;
    return Math.round(bmr * (multipliers[activityLevel] ?? 1.55));
  }, [gender, currentWeight, weightUnit, heightFt, heightIn, heightCm, age, activityLevel]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function haptic() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleHeightFtChange(val: string) {
    setHeightFt(val);
    setHeightCm(String(ftInToCm(parseInt(val) || 0, parseInt(heightIn) || 0)));
  }

  function handleHeightInChange(val: string) {
    setHeightIn(val);
    setHeightCm(String(ftInToCm(parseInt(heightFt) || 0, parseInt(val) || 0)));
  }

  const stepIndex = NUMBERED_STEPS.indexOf(step); // -1 for welcome
  const currentStepNumber = stepIndex + 1; // 1-based, 0 for welcome

  // ── Save & navigate ──────────────────────────────────────────────────────────

  async function handleComplete() {
    if (!gender || !experience) {
      Alert.alert("Missing Info", "Please go back and select your biological sex and training experience.");
      return;
    }
    setSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Use entered bodyweight, or fall back to a sensible gender-based default
      const bw = bodyweight && parseFloat(bodyweight) > 0
        ? parseFloat(bodyweight)
        : gender === "MALE"
          ? (weightUnit === "lbs" ? 165 : 75)
          : (weightUnit === "lbs" ? 135 : 60);

      // 1. Estimate starting weights from profile
      const weights = estimateWeights({
        gender,
        bodyweight: bw,
        experience,
      });

      // 2. Create user record + weight baselines
      const user = await createUser(gender, bw, experience, weights, weightUnit);
      await AsyncStorage.setItem("userId", user.id);
      await AsyncStorage.setItem("userGender", gender);
      if (bodyGoal !== "recomp") {
        await AsyncStorage.setItem("nutritionPace", deficitPace);
      }
      // Start the 7-day trial clock from the moment onboarding completes
      const existingLaunch = await AsyncStorage.getItem("firstLaunchDate");
      if (!existingLaunch) {
        await AsyncStorage.setItem("firstLaunchDate", new Date().toISOString());
      }
      await refreshUnit();

      // 3. Save nutrition profile (goal + height + age + activity + optional target)
      const cm = weightUnit === "lbs"
        ? ftInToCm(parseInt(heightFt) || 5, parseInt(heightIn) || 10)
        : parseFloat(heightCm) || 178;
      const targetKg = targetWeight && parseFloat(targetWeight) > 0
        ? weightUnit === "lbs" ? lbsToKg(parseFloat(targetWeight)) : parseFloat(targetWeight)
        : null;
      await updateNutritionProfile(user.id, {
        heightCm: cm,
        age: parseInt(age) || 25,
        activityLevel,
        bodyGoal,
        targetWeightKg: targetKg,
        weeksToGoal: null,
      });

      router.replace(`/templates?from=onboarding&totalSteps=${TOTAL_FLOW_STEPS}&step=${NUMBERED_STEPS.length + 1}`);
    } catch (err) {
      console.error(err);
      Alert.alert(
        "Setup Failed",
        err instanceof Error ? err.message : "Unable to save your profile. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === "welcome") {
      router.canGoBack() ? router.back() : router.replace("/(tabs)");
    } else if (step === "unit") {
      setStep("welcome");
    } else if (step === "identity") {
      setStep("unit");
    } else if (step === "physical") {
      setStep("identity");
    } else if (step === "goals") {
      setStep("physical");
    } else if (step === "target") {
      setStep("goals");
    } else if (step === "pace") {
      setStep("target");
    } else if (step === "summary") {
      setStep(bodyGoal === "recomp" ? "goals" : "pace");
    }
  }

  // ── Shared styles ────────────────────────────────────────────────────────────

  const titleStyle = {
    fontFamily: "Rubik_700Bold" as const,
    fontSize: 22,
    color: Colors.text,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 6,
  };

  const subtitleStyle = {
    fontFamily: "Rubik_400Regular" as const,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 28,
  };

  const continueBtn = (onPress: () => void, disabled = false, label = "Continue →") => (
    <View style={{
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      paddingBottom: 12 + bottomInset,
    }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          backgroundColor: disabled ? Colors.bgAccent : Colors.primary,
          paddingVertical: 16,
          alignItems: "center",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {saving
          ? <ActivityIndicator color={Colors.text} />
          : <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 14,
              color: disabled ? Colors.textMuted : Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}>
              {label}
            </Text>
        }
      </Pressable>
    </View>
  );

  // ── Header ───────────────────────────────────────────────────────────────────

  const header = step !== "welcome" && (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
      {/* Back + step counter row */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <Pressable onPress={goBack} hitSlop={12} style={{ marginRight: 8 }}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text style={{
          fontFamily: "Rubik_500Medium",
          fontSize: 11,
          color: Colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}>
          Step {currentStepNumber} of {TOTAL_FLOW_STEPS}
        </Text>
      </View>

      {/* Segmented progress bar — all 5 steps */}
      <View style={{ flexDirection: "row", gap: 3 }}>
        {Array.from({ length: TOTAL_FLOW_STEPS }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 2,
              backgroundColor: i < currentStepNumber ? Colors.primary : Colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {header}

      {/* ── WELCOME ─────────────────────────────────────────────────────────── */}
      {step === "welcome" && (
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "space-between", paddingBottom: bottomInset + 24 }}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            {/* Logo */}
            <Image
              source={require("../assets/images/logo.png")}
              style={{ width: "100%", aspectRatio: 1, marginBottom: 20 }}
              resizeMode="contain"
            />
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 14,
              color: Colors.textSecondary,
              lineHeight: 22,
              marginBottom: 32,
              textAlign: "center",
            }}>
              Answer a few questions and POWRLOG builds a complete program around your body, experience, and goals — then adjusts it every single session.
            </Text>

            {[
              {
                icon: "trending-up" as const,
                title: "Auto-progressing weights",
                detail: "Targets update every session based on your actual performance.",
              },
              {
                icon: "restaurant-outline" as const,
                title: "Precision nutrition",
                detail: "Personalised calories and macros calculated from your physiology.",
              },
              {
                icon: "body-outline" as const,
                title: "Body progress tracking",
                detail: "Weight, measurements, and body fat charted over time.",
              },
            ].map(item => (
              <View key={item.title} style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 16,
                borderLeftWidth: 2,
                borderLeftColor: Colors.primary + "44",
                paddingLeft: 14,
              }}>
                <Ionicons name={item.icon} size={18} color={Colors.primary} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 17 }}>
                    {item.detail}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 8 }}>
              Takes about 2 minutes · Everything is editable in Settings later
            </Text>
          </View>

          <Pressable
            onPress={() => { haptic(); setStep("unit"); }}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: 18,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 15,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}>
              Build My Program →
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── UNIT ────────────────────────────────────────────────────────────── */}
      {step === "unit" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Pounds or Kilograms?</Text>
            <Text style={subtitleStyle}>
              Every weight in POWRLOG — your lifts, targets, and bodyweight — uses this unit throughout the app.
            </Text>

            {(["lbs", "kg"] as WeightUnit[]).map(u => (
              <Pressable
                key={u}
                onPress={() => { haptic(); setWeightUnit(u); setStep("identity"); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: weightUnit === u ? Colors.primary : Colors.border,
                  backgroundColor: weightUnit === u ? Colors.bgAccent : Colors.bg,
                  paddingVertical: 24,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                    {u === "lbs" ? "Pounds" : "Kilograms"}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
                    {u === "lbs" ? "lbs — USA, Canada" : "kg — most of the world"}
                  </Text>
                </View>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 32, color: weightUnit === u ? Colors.primary : Colors.textMuted, letterSpacing: -1 }}>
                  {u}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* ── IDENTITY ────────────────────────────────────────────────────────── */}
      {step === "identity" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>About You</Text>
            <Text style={subtitleStyle}>
              These two selections are required to personalise your training targets.
            </Text>

            {/* ── Biological Sex ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              Biological Sex
            </Text>

            {([["MALE", "male"], ["FEMALE", "female"]] as [Gender, keyof typeof Ionicons.glyphMap][]).map(([g, icon]) => (
              <Pressable
                key={g}
                onPress={() => { haptic(); setGender(g); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: gender === g ? Colors.primary : Colors.border,
                  backgroundColor: gender === g ? Colors.bgAccent : Colors.bg,
                  paddingVertical: 20,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  {g === "MALE" ? "Male" : "Female"}
                </Text>
                <Ionicons name={icon} size={24} color={gender === g ? Colors.primary : Colors.textMuted} />
              </Pressable>
            ))}

            <View style={{ height: 24 }} />

            {/* ── Training Experience ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              Training Experience
            </Text>

            {EXPERIENCE_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                onPress={() => { haptic(); setExperience(opt.value); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: experience === opt.value ? Colors.primary : Colors.border,
                  backgroundColor: experience === opt.value ? Colors.bgAccent : Colors.bg,
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: experience === opt.value ? Colors.primary : Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  {opt.label}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 4 }}>
                  {opt.desc}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, fontStyle: "italic" }}>
                  {opt.detail}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {continueBtn(
            () => { haptic(); setStep("physical"); },
            !(gender !== null && experience !== null)
          )}
        </>
      )}

      {/* ── PHYSICAL ────────────────────────────────────────────────────────── */}
      {step === "physical" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Body Stats</Text>
            <Text style={subtitleStyle}>
              Optional — used to calculate your calorie and macro targets. Defaults are applied if skipped.
            </Text>

            {/* ── Height ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Height
            </Text>

            {weightUnit === "lbs" ? (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 32 }}>
                {[
                  { value: heightFt, onChange: handleHeightFtChange, label: "Feet" },
                  { value: heightIn, onChange: handleHeightInChange, label: "Inches" },
                ].map(f => (
                  <View key={f.label} style={{ flex: 1 }}>
                    <TextInput
                      value={f.value}
                      onChangeText={f.onChange}
                      keyboardType="number-pad"
                      style={{ borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                    />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      {f.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 32 }}>
                <TextInput
                  value={heightCm}
                  onChangeText={setHeightCm}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
                />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>cm</Text>
              </View>
            )}

            {/* ── Age ── */}
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
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>yrs</Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 32 }}>
              Metabolism slows ~1–2% per decade after 25 — age adjusts your TDEE accordingly.
            </Text>

            {/* ── Current Weight (optional) ── */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Current Weight
              </Text>
              <View style={{ borderWidth: 1, borderColor: Colors.primary + "44", backgroundColor: Colors.primary + "11", paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Optional</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TextInput
                value={bodyweight}
                onChangeText={setBodyweight}
                keyboardType="decimal-pad"
                placeholder={weightUnit === "lbs" ? "e.g. 185" : "e.g. 84"}
                placeholderTextColor={Colors.textMuted}
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
              />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>{weightUnit}</Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
              Used to estimate your starting lift targets and daily calorie needs.
            </Text>
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={() => { haptic(); setStep("goals"); }}
              style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1, marginBottom: 4 })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Continue →
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic(); setStep("goals"); }}
              style={({ pressed }) => ({ alignItems: "center", paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Skip this step
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── GOALS ───────────────────────────────────────────────────────────── */}
      {step === "goals" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Your Goals</Text>
            <Text style={subtitleStyle}>
              All optional — defaults are applied if skipped. You can change everything in Settings.
            </Text>

            {/* ── Body Goal ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              Body Goal
            </Text>

            {BODY_GOALS.map(g => (
              <Pressable
                key={g.key}
                onPress={() => { haptic(); setBodyGoal(g.key); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderLeftWidth: 3,
                  borderColor: bodyGoal === g.key ? g.color : Colors.border,
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
                <Ionicons name={g.icon} size={24} color={g.color} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: bodyGoal === g.key ? g.color : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    {g.label}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                    {g.tagline}
                  </Text>
                </View>
                {bodyGoal === g.key && <Ionicons name="checkmark-circle" size={20} color={g.color} />}
              </Pressable>
            ))}

            {bodyGoal === "recomp" && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 4, marginBottom: 16, backgroundColor: Colors.bgAccent }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Who Is Recomposition For?
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  Recomp works best for beginners, returning lifters, and those with higher body fat ({">"} 20% men / {">"} 28% women). Progress is slower but you avoid cycling between cut and bulk phases.
                </Text>
              </View>
            )}

            <View style={{ height: bodyGoal === "recomp" ? 8 : 24 }} />

            {/* ── Activity Level ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              Activity Level
            </Text>

            {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, typeof ACTIVITY_LABELS[ActivityLevel]][]).map(([key, val]) => (
              <Pressable
                key={key}
                onPress={() => { haptic(); setActivityLevel(key); }}
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
          {continueBtn(
            () => {
              haptic();
              setStep(bodyGoal === "recomp" ? "summary" : "target");
            },
          )}
        </>
      )}

      {/* ── TARGET ──────────────────────────────────────────────────────────── */}
      {step === "target" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Your Target</Text>
            <Text style={subtitleStyle}>
              {bodyGoal === "cut" ? "Where do you want to end up?" : "How much do you want to build up to?"}
              {" "}Both fields are optional — skip to set this later in{" "}
              <Text style={{ color: Colors.primary }}>Settings → Nutrition</Text>.
            </Text>

            {/* Current weight */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Current Weight ({weightUnit})
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <TextInput
                value={currentWeight}
                onChangeText={setCurrentWeight}
                keyboardType="decimal-pad"
                placeholder={weightUnit === "lbs" ? "e.g. 185" : "e.g. 84"}
                placeholderTextColor={Colors.textMuted}
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
              />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>{weightUnit}</Text>
            </View>

            {/* Target weight */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Target Weight ({weightUnit})
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TextInput
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
                placeholder={bodyGoal === "cut"
                  ? (weightUnit === "lbs" ? "e.g. 165" : "e.g. 75")
                  : (weightUnit === "lbs" ? "e.g. 200" : "e.g. 91")}
                placeholderTextColor={Colors.textMuted}
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
              />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>{weightUnit}</Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 8 }}>
              POWRLOG uses this to calculate your calorie deficit/surplus and tracks your progress over time.
            </Text>
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={() => { haptic(); setStep("pace"); }}
              style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1, marginBottom: 4 })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Continue →
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic(); setStep("pace"); }}
              style={({ pressed }) => ({ alignItems: "center", paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Skip — set in Settings → Nutrition later
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── PACE ────────────────────────────────────────────────────────────── */}
      {step === "pace" && (() => {
        type PaceKey = "slow" | "moderate" | "aggressive";
        const paceOptions: Array<{
          key: PaceKey;
          label: string;
          delta: number;
          rateLbs: string;
          detail: string;
          recommended?: boolean;
        }> = bodyGoal === "cut"
          ? [
              { key: "slow",       label: "Slow",       delta: -250, rateLbs: "~0.5 lb / week", detail: "Minimal muscle loss. Best if you're already lean or want to keep every bit of strength.", recommended: false },
              { key: "moderate",   label: "Moderate",   delta: -500, rateLbs: "~1 lb / week",   detail: "The sweet spot. Fast enough to stay motivated, controlled enough to preserve muscle.", recommended: true },
              { key: "aggressive", label: "Aggressive", delta: -750, rateLbs: "~1.5 lb / week", detail: "Fastest results. Higher muscle-loss risk — best if you have significant fat to lose.", recommended: false },
            ]
          : [
              { key: "slow",       label: "Slow",       delta: 200,  rateLbs: "~0.25 lb / week", detail: "Very lean gaining — slowest fat gain, ideal if you're cutting-sensitive.", recommended: false },
              { key: "moderate",   label: "Moderate",   delta: 350,  rateLbs: "~0.5 lb / week",  detail: "Optimal muscle-to-fat ratio for most lifters. Build steadily without blowing up.", recommended: true },
              { key: "aggressive", label: "Aggressive", delta: 500,  rateLbs: "~1 lb / week",    detail: "Fastest muscle gain. Expect more fat alongside — plan a future cut.", recommended: false },
            ];

        return (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={titleStyle}>
                {bodyGoal === "cut" ? "How fast do you want to cut?" : "How fast do you want to bulk?"}
              </Text>
              <Text style={subtitleStyle}>
                {bodyGoal === "cut"
                  ? "A larger deficit = faster fat loss but more muscle risk. Choose your trade-off."
                  : "A larger surplus = faster muscle gain but more fat alongside. Choose your trade-off."}
              </Text>

              {paceOptions.map(opt => {
                const isSelected = deficitPace === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { haptic(); setDeficitPace(opt.key); }}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderLeftWidth: 3,
                      borderColor: isSelected ? Colors.primary : Colors.border,
                      borderLeftColor: isSelected ? Colors.primary : Colors.border,
                      backgroundColor: isSelected ? Colors.primary + "11" : Colors.bg,
                      paddingHorizontal: 16,
                      paddingVertical: 18,
                      marginBottom: 12,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    {/* Title row */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: isSelected ? Colors.primary : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                          {opt.label}
                        </Text>
                        {opt.recommended && (
                          <View style={{ borderWidth: 1, borderColor: Colors.primary + "55", backgroundColor: Colors.primary + "15", paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                              Recommended
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: isSelected ? Colors.primary : Colors.textMuted }}>
                          {opt.delta > 0 ? "+" : ""}{opt.delta} kcal/day
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                          {opt.rateLbs}
                        </Text>
                      </View>
                    </View>
                    {/* Description */}
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 17 }}>
                      {opt.detail}
                    </Text>
                    {isSelected && (
                      <View style={{ position: "absolute", top: 10, right: 10 }}>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}

              {/* Live calorie preview */}
              {tdeeEstimate !== null && (() => {
                const selected = paceOptions.find(o => o.key === deficitPace)!;
                const preview = tdeeEstimate + selected.delta;
                return (
                  <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16, marginTop: 4, backgroundColor: Colors.bgAccent }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                      Your target calories
                    </Text>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 }}>
                      ~{preview.toLocaleString()} kcal / day
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                      Maintenance ~{tdeeEstimate.toLocaleString()} kcal · {selected.delta > 0 ? "+" : ""}{selected.delta} kcal {bodyGoal === "cut" ? "deficit" : "surplus"}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
            {continueBtn(() => { haptic(); setStep("summary"); })}
          </>
        );
      })()}

      {/* ── SUMMARY ─────────────────────────────────────────────────────────── */}
      {step === "summary" && (() => {
        const goalMeta = BODY_GOALS.find(g => g.key === bodyGoal)!;
        const heightDisplay = weightUnit === "lbs"
          ? `${heightFt}'${heightIn}"`
          : `${heightCm} cm`;
        const paceDeficit  = { slow: -250, moderate: -500, aggressive: -750 }[deficitPace];
        const paceSurplus  = { slow: 200, moderate: 350, aggressive: 500 }[deficitPace];
        const targetCalories = tdeeEstimate
          ? bodyGoal === "cut"  ? tdeeEstimate + paceDeficit
          : bodyGoal === "bulk" ? tdeeEstimate + paceSurplus
          : tdeeEstimate
          : null;

        const rows: Array<{ label: string; value: string; sub?: string }> = [
          { label: "Goal", value: goalMeta.label, sub: goalMeta.tagline },
          { label: "Training", value: `${experience ?? "—"} · ${gender === "MALE" ? "Male" : "Female"}` },
          { label: "Physique", value: [heightDisplay, age ? `${age} yrs` : null, bodyweight ? `${bodyweight} ${weightUnit}` : null].filter(Boolean).join(" · ") || "—" },
          { label: "Activity", value: ACTIVITY_LABELS[activityLevel]?.label ?? activityLevel },
          ...(bodyGoal !== "recomp" && (currentWeight || targetWeight)
            ? [{ label: "Target", value: [currentWeight ? `${currentWeight} ${weightUnit} now` : null, targetWeight ? `→ ${targetWeight} ${weightUnit}` : null].filter(Boolean).join("  ") }]
            : []),
          ...(bodyGoal !== "recomp"
            ? [{ label: "Pace", value: `${deficitPace.charAt(0).toUpperCase() + deficitPace.slice(1)} — ${paceDeficit < 0 ? Math.abs(paceDeficit) + " kcal deficit" : "+" + paceSurplus + " kcal surplus"}` }]
            : []),
        ];

        return (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={titleStyle}>All Set.</Text>
              <Text style={subtitleStyle}>
                Here's your profile — choose a program next.
              </Text>

              {/* Profile rows */}
              {rows.map(row => (
                <View key={row.label} style={{
                  flexDirection: "row", alignItems: "flex-start",
                  borderBottomWidth: 1, borderBottomColor: Colors.border,
                  paddingVertical: 14, gap: 12,
                }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, width: 64, marginTop: 2 }}>
                    {row.label}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text }}>{row.value}</Text>
                    {row.sub ? <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{row.sub}</Text> : null}
                  </View>
                </View>
              ))}

              {/* TDEE card */}
              {tdeeEstimate !== null && (
                <View style={{
                  borderWidth: 1, borderColor: Colors.border,
                  borderLeftWidth: 3, borderLeftColor: goalMeta.color,
                  backgroundColor: goalMeta.color + "0A",
                  padding: 16, marginTop: 20,
                }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                    Estimated Daily Calories
                  </Text>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 28, color: goalMeta.color, letterSpacing: -1 }}>
                    ~{targetCalories?.toLocaleString()} kcal
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
                    {bodyGoal === "cut" && `Maintenance ~${tdeeEstimate.toLocaleString()} kcal · ${Math.abs(paceDeficit)} kcal deficit`}
                    {bodyGoal === "bulk" && `Maintenance ~${tdeeEstimate.toLocaleString()} kcal · +${paceSurplus} kcal surplus`}
                    {bodyGoal === "recomp" && `Maintenance calories · body recomposition`}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 16 }}>
                    Full macro breakdown will appear in the Nutrition tab after setup.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={{ paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
              <Pressable
                onPress={() => { haptic(); handleComplete(); }}
                disabled={saving}
                style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
              >
                {saving
                  ? <ActivityIndicator color={Colors.text} />
                  : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                      Choose My Program →
                    </Text>
                }
              </Pressable>
            </View>
          </>
        );
      })()}
    </View>
    </KeyboardAvoidingView>
  );
}

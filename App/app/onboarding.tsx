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
import { useTranslation } from 'react-i18next';
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

type Step = "welcome" | "unit" | "identity" | "physical" | "goals" | "training" | "target" | "pace" | "summary";

// ─── Static data ──────────────────────────────────────────────────────────────

const EXPERIENCE_VALUES: ExperienceLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

const BODY_GOAL_KEYS: BodyGoal[] = ["cut", "recomp", "bulk"];
const BODY_GOAL_ICONS: Record<BodyGoal, keyof typeof Ionicons.glyphMap> = {
  cut:    "trending-down",
  recomp: "swap-vertical",
  bulk:   "trending-up",
};
const BODY_GOAL_COLORS: Record<BodyGoal, string> = {
  cut:    "#E53935",
  recomp: Colors.primary,
  bulk:   "#43A047",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { t } = useTranslation();
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

  // Step: goals — progression method
  const [progressionMode, setProgressionMode] = useState<"arpo" | "double_progression">("arpo");

  // Step: pace — deficit/surplus aggressiveness (cut/bulk only)
  const [deficitPace, setDeficitPace] = useState<"slow" | "moderate" | "aggressive">("moderate");

  // Step: target — current + target weight (cut/bulk only, optional)
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");

  // Dynamic step config — summary always last, target+pace only for cut/bulk
  const NUMBERED_STEPS: Step[] = bodyGoal === "recomp"
    ? ["unit", "identity", "physical", "goals", "training", "summary"]
    : ["unit", "identity", "physical", "goals", "training", "target", "pace", "summary"];
  const TOTAL_FLOW_STEPS = bodyGoal === "recomp" ? 7 : 9;
  // recomp: 6 onboarding + templates = 7
  // cut/bulk: 8 onboarding + templates = 9

  // Estimated TDEE for summary screen
  const tdeeEstimate = useMemo(() => {
    if (!gender) return null;
    const multipliers: Record<ActivityLevel, number> = {
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    };
    const bwKg = currentWeight && parseFloat(currentWeight) > 0
      ? (weightUnit === "lbs" ? lbsToKg(parseFloat(currentWeight)) : parseFloat(currentWeight))
      : bodyweight && parseFloat(bodyweight) > 0
        ? (weightUnit === "lbs" ? lbsToKg(parseFloat(bodyweight)) : parseFloat(bodyweight))
        : gender === "MALE" ? 75 : 60;
    const h = weightUnit === "lbs"
      ? ftInToCm(parseInt(heightFt) || 5, parseInt(heightIn) || 10)
      : parseFloat(heightCm) || 178;
    const a = parseInt(age) || 25;
    const bmr = gender === "MALE"
      ? 10 * bwKg + 6.25 * h - 5 * a + 5
      : 10 * bwKg + 6.25 * h - 5 * a - 161;
    return Math.round(bmr * (multipliers[activityLevel] ?? 1.55));
  }, [gender, currentWeight, bodyweight, weightUnit, heightFt, heightIn, heightCm, age, activityLevel]);

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
      Alert.alert(
        t('onboarding.alerts.missingInfoTitle'),
        t('onboarding.alerts.missingInfoMessage'),
      );
      return;
    }
    setSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Use the most recently entered weight: currentWeight (target step) takes
      // priority over bodyweight (physical step), then fall back to gender default.
      const bw = currentWeight && parseFloat(currentWeight) > 0
        ? parseFloat(currentWeight)
        : bodyweight && parseFloat(bodyweight) > 0
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
      // Save progression preference chosen during onboarding (always persist so the
      // default "arpo" is also written, not just double_progression)
      const { updateUserProgressionMode } = await import("@/lib/local-db");
      await updateUserProgressionMode(user.id, progressionMode);
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
        t('onboarding.alerts.setupFailedTitle'),
        err instanceof Error ? err.message : t('onboarding.alerts.setupFailedMessage'),
        [{ text: t('common.ok') }]
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
    } else if (step === "training") {
      setStep("goals");
    } else if (step === "target") {
      setStep("training");
    } else if (step === "pace") {
      setStep("target");
    } else if (step === "summary") {
      setStep(bodyGoal === "recomp" ? "training" : "pace");
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

  const continueBtn = (onPress: () => void, disabled = false, label = t('common.continue')) => (
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
          {t('postOnboarding.stepLabel', { current: currentStepNumber, total: NUMBERED_STEPS.length })}
        </Text>
      </View>

      {/* Segmented progress bar — shows onboarding steps only so the bar
          reaches 100% on the final onboarding step before routing away */}
      <View style={{ flexDirection: "row", gap: 3 }}>
        {Array.from({ length: NUMBERED_STEPS.length }).map((_, i) => (
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
              source={require("../assets/images/LOGO1.png")}
              style={{ width: "50%", maxWidth: 180, height: 140, alignSelf: "center", marginBottom: 16 }}
              resizeMode="contain"
            />
            <View style={{ width: 40, height: 3, backgroundColor: Colors.primary, marginBottom: 16 }} />
            <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 28,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 10,
              lineHeight: 34,
            }}>
              {t('onboarding.welcome.headline')}
            </Text>
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 14,
              color: Colors.textSecondary,
              lineHeight: 22,
              marginBottom: 28,
            }}>
              {t('onboarding.welcome.subheadline')}
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
              {t('onboarding.welcome.cta')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── UNIT ────────────────────────────────────────────────────────────── */}
      {step === "unit" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>{t('onboarding.units.title')}</Text>
            <Text style={subtitleStyle}>
              {t('onboarding.units.subtitle')}
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
                    {u === "lbs" ? t('onboarding.units.lbs') : t('onboarding.units.kg')}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
                    {u === "lbs" ? t('onboarding.units.lbsSub') : t('onboarding.units.kgSub')}
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
            <Text style={titleStyle}>{t('onboarding.identity.title')}</Text>
            <Text style={subtitleStyle}>
              {t('onboarding.identity.subtitle')}
            </Text>

            {/* ── Biological Sex ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              {t('onboarding.identity.biologicalSex')}
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
                  {g === "MALE" ? t('onboarding.identity.male') : t('onboarding.identity.female')}
                </Text>
                <Ionicons name={icon} size={24} color={gender === g ? Colors.primary : Colors.textMuted} />
              </Pressable>
            ))}

            <View style={{ height: 24 }} />

            {/* ── Training Experience ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              {t('onboarding.identity.experience')}
            </Text>

            {EXPERIENCE_VALUES.map(value => (
              <Pressable
                key={value}
                onPress={() => { haptic(); setExperience(value); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: experience === value ? Colors.primary : Colors.border,
                  backgroundColor: experience === value ? Colors.bgAccent : Colors.bg,
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: experience === value ? Colors.primary : Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  {t(`onboarding.identity.${value.toLowerCase()}`)}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 4 }}>
                  {t(`onboarding.identity.${value.toLowerCase()}Desc`)}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, fontStyle: "italic" }}>
                  {t(`onboarding.identity.${value.toLowerCase()}Detail`)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {continueBtn(
            () => { haptic(); setStep("physical"); },
            !(gender !== null && experience !== null),
            t('onboarding.identity.continue'),
          )}
        </>
      )}

      {/* ── PHYSICAL ────────────────────────────────────────────────────────── */}
      {step === "physical" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>{t('onboarding.physical.title')}</Text>
            <Text style={subtitleStyle}>
              {t('onboarding.physical.subtitle')}
            </Text>

            {/* ── Height ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              {t('onboarding.physical.height')}
            </Text>

            {weightUnit === "lbs" ? (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 32 }}>
                {[
                  { value: heightFt, onChange: handleHeightFtChange, label: t('onboarding.physical.heightFt') },
                  { value: heightIn, onChange: handleHeightInChange, label: t('onboarding.physical.heightIn') },
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
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>{t('onboarding.physical.heightCm')}</Text>
              </View>
            )}

            {/* ── Age ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              {t('onboarding.physical.age')}
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
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>{t('onboarding.physical.ageSuffix')}</Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 8 }}>
              Metabolism slows ~1–2% per decade after 25 — age adjusts your TDEE accordingly.
            </Text>
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={() => { haptic(); setStep("goals"); }}
              style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1, marginBottom: 4 })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                {t('onboarding.physical.continue')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic();
                // Clear all physical fields so defaults are applied — distinct from Continue
                setHeightFt(""); setHeightIn(""); setHeightCm("");
                setBodyweight(""); setAge("");
                setStep("goals");
              }}
              style={({ pressed }) => ({ alignItems: "center", paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                {t('common.skip')}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── GOALS ───────────────────────────────────────────────────────────── */}
      {step === "goals" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>{t('onboarding.goals.title')}</Text>
            <Text style={subtitleStyle}>
              {t('onboarding.goals.subtitle')}
            </Text>

            {BODY_GOAL_KEYS.map(key => {
              const icon = BODY_GOAL_ICONS[key];
              const color = BODY_GOAL_COLORS[key];
              const labelKey = key === "cut" ? "strength" : key === "recomp" ? "powerbuilding" : "hypertrophy";
              const taglineKey = key === "cut" ? "strengthTagline" : key === "recomp" ? "powerbuildingTagline" : "hypertrophyTagline";
              return (
                <Pressable
                  key={key}
                  onPress={() => { haptic(); setBodyGoal(key); }}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderLeftWidth: 3,
                    borderColor: bodyGoal === key ? color : Colors.border,
                    borderLeftColor: color,
                    backgroundColor: bodyGoal === key ? color + "11" : Colors.bg,
                    paddingHorizontal: 16,
                    paddingVertical: 18,
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Ionicons name={icon} size={24} color={color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: bodyGoal === key ? color : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                      {t(`onboarding.goals.${labelKey}`)}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {t(`onboarding.goals.${taglineKey}`)}
                    </Text>
                  </View>
                  {bodyGoal === key && <Ionicons name="checkmark-circle" size={20} color={color} />}
                </Pressable>
              );
            })}

            {bodyGoal === "recomp" && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 4, marginBottom: 16, backgroundColor: Colors.bgAccent }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Who Is Powerbuilding For?
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  Powerbuilding suits intermediate lifters who want both strength and size. You'll increase your 1RMs while building significant muscle — heavier compound work blended with hypertrophy volume.
                </Text>
              </View>
            )}
          </ScrollView>
          {continueBtn(() => { haptic(); setStep("training"); }, false, t('onboarding.goals.continue'))}
        </>
      )}

      {/* ── TRAINING ────────────────────────────────────────────────────────── */}
      {step === "training" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>{t('settings.sections.trainingSchedule')}</Text>
            <Text style={subtitleStyle}>
              These two settings shape how your program progresses. Both can be changed anytime in Settings.
            </Text>

            {/* ── Activity Level ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              {t('onboarding.trainingSetup.activityLevel')}
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

            <View style={{ height: 28 }} />

            {/* ── Progression Method ── */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
              {t('onboarding.trainingSetup.progressionMethod')}
            </Text>

            {([
              {
                key: "arpo" as const,
                label: t('onboarding.trainingSetup.arpo'),
                subtitle: "Autoregulated Progressive Overload",
                description: t('onboarding.trainingSetup.arpoDesc'),
                accentColor: Colors.primary,
              },
              {
                key: "double_progression" as const,
                label: t('onboarding.trainingSetup.doubleProgression'),
                subtitle: "Rep → Weight ladder",
                description: t('onboarding.trainingSetup.doubleProgressionDesc'),
                accentColor: "#F59E0B",
              },
            ]).map((m) => (
              <Pressable
                key={m.key}
                onPress={() => { haptic(); setProgressionMode(m.key); }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: progressionMode === m.key ? m.accentColor : Colors.border,
                  borderLeftWidth: 3,
                  borderLeftColor: m.accentColor,
                  backgroundColor: progressionMode === m.key ? m.accentColor + "11" : Colors.bg,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  marginBottom: 10,
                  gap: 4,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: progressionMode === m.key ? m.accentColor : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                      {m.label}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {m.subtitle}
                    </Text>
                  </View>
                  {progressionMode === m.key && <Ionicons name="checkmark-circle" size={20} color={m.accentColor} />}
                </View>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 6 }}>
                  {m.description}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {continueBtn(
            () => {
              haptic();
              if (bodyGoal !== "recomp") {
                if (!currentWeight && bodyweight) setCurrentWeight(bodyweight);
                setStep("target");
              } else {
                setStep("summary");
              }
            },
            false,
            t('onboarding.trainingSetup.continue'),
          )}
        </>
      )}

      {/* ── TARGET ──────────────────────────────────────────────────────────── */}
      {step === "target" && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>{t('nutritionSetup.step4.title')}</Text>
            <Text style={subtitleStyle}>
              {bodyGoal === "cut" ? "Where do you want to end up?" : "How much do you want to build up to?"}
              {" "}Both fields are optional — skip to set this later in{" "}
              <Text style={{ color: Colors.primary }}>Settings → Nutrition</Text>.
            </Text>

            {/* Current weight */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              {t('nutritionSetup.step4.currentWeight', { unit: weightUnit })}
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
              {t('nutritionSetup.step4.targetWeight', { unit: weightUnit })}
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
                {t('nutritionSetup.step4.continue')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { haptic(); setStep("pace"); }}
              style={({ pressed }) => ({ alignItems: "center", paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                {t('common.skip')}
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
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 8 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: isSelected ? Colors.primary : Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                          {opt.label}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
                        {!isSelected && opt.recommended && (
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
                      {t('onboarding.summary.targetCaloriesLabel')}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 }}>
                      ~{preview.toLocaleString()} {t('onboarding.summary.tdeeUnit')}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                      Maintenance ~{tdeeEstimate.toLocaleString()} kcal · {selected.delta > 0 ? "+" : ""}{selected.delta} kcal {bodyGoal === "cut" ? "deficit" : "surplus"}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
            {continueBtn(() => { haptic(); setStep("summary"); }, false, t('nutritionSetup.step5.calculateTargets'))}
          </>
        );
      })()}

      {/* ── SUMMARY ─────────────────────────────────────────────────────────── */}
      {step === "summary" && (() => {
        const goalColor = BODY_GOAL_COLORS[bodyGoal];
        const goalLabelKey = bodyGoal === "cut" ? "strength" : bodyGoal === "recomp" ? "powerbuilding" : "hypertrophy";
        const goalTaglineKey = bodyGoal === "cut" ? "strengthTagline" : bodyGoal === "recomp" ? "powerbuildingTagline" : "hypertrophyTagline";
        const goalLabel = t(`onboarding.goals.${goalLabelKey}`);
        const goalTagline = t(`onboarding.goals.${goalTaglineKey}`);
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

        const paceName = deficitPace.charAt(0).toUpperCase() + deficitPace.slice(1);
        const rows: Array<{ label: string; value: string; sub?: string }> = [
          { label: t('onboarding.summary.rows.goal'), value: goalLabel, sub: goalTagline },
          { label: t('onboarding.summary.rows.training'), value: `${experience ?? "—"} · ${gender === "MALE" ? t('onboarding.identity.male') : t('onboarding.identity.female')}` },
          { label: t('onboarding.summary.rows.physique'), value: [heightDisplay, age ? `${age} ${t('onboarding.physical.ageSuffix')}` : null, bodyweight ? `${bodyweight} ${weightUnit}` : null].filter(Boolean).join(" · ") || "—" },
          { label: t('onboarding.summary.rows.activity'), value: ACTIVITY_LABELS[activityLevel]?.label ?? activityLevel },
          ...(bodyGoal !== "recomp" && (currentWeight || targetWeight)
            ? [{ label: t('onboarding.summary.rows.target'), value: [currentWeight ? t('onboarding.summary.rows.currentWeightNow', { weight: currentWeight, unit: weightUnit }) : null, targetWeight ? `→ ${targetWeight} ${weightUnit}` : null].filter(Boolean).join("  ") }]
            : []),
          ...(bodyGoal !== "recomp"
            ? [{ label: t('onboarding.summary.rows.pace'), value: bodyGoal === "cut" ? t('onboarding.summary.deficitPace', { pace: paceName, amount: Math.abs(paceDeficit) }) : t('onboarding.summary.surplusPace', { pace: paceName, amount: paceSurplus }) }]
            : []),
        ];

        return (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
              <Text style={titleStyle}>{t('onboarding.summary.title')}</Text>
              <Text style={subtitleStyle}>
                {t('onboarding.summary.subtitle')}
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
                  borderLeftWidth: 3, borderLeftColor: goalColor,
                  backgroundColor: goalColor + "0A",
                  padding: 16, marginTop: 20,
                }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                    {t('onboarding.summary.tdeeCard')}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 28, color: goalColor, letterSpacing: -1 }}>
                    ~{targetCalories?.toLocaleString()} {t('onboarding.summary.tdeeUnit')}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
                    {bodyGoal === "cut" && t('onboarding.summary.maintenanceCut', { maintenance: tdeeEstimate.toLocaleString(), amount: Math.abs(paceDeficit) })}
                    {bodyGoal === "bulk" && t('onboarding.summary.maintenanceBulk', { maintenance: tdeeEstimate.toLocaleString(), amount: paceSurplus })}
                    {bodyGoal === "recomp" && t('onboarding.summary.maintenanceRecomp')}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 16 }}>
                    {t('onboarding.summary.macroBreakdownNote')}
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
                      {t('onboarding.summary.continue')}
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

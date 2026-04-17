import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
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
  type ActivityLevel,
  type BodyGoal,
} from "@/utils/nutritionCalculator";
import {
  createUser,
  updateNutritionProfile,
  logBodyMeasurements,
} from "@/lib/local-db";
import { useUnit, type WeightUnit } from "@/contexts/UnitContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "welcome"
  | "unit"
  | "gender"
  | "bodyweight"
  | "experience"
  | "goal"
  | "details"
  | "activity"
  | "body_comp";

// Steps that get a number in the progress bar (welcome is the intro, not counted)
const NUMBERED_STEPS: Step[] = [
  "unit", "gender", "bodyweight", "experience",
  "goal", "details", "activity", "body_comp",
];
const TOTAL_FLOW_STEPS = 11; // 8 here + templates (9) + weights (10) + notifications (11)

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

  // Step 1 — unit
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");

  // Step 2 — gender
  const [gender, setGender] = useState<Gender | null>(null);

  // Step 3 — bodyweight
  const [bodyweight, setBodyweight] = useState("");

  // Step 4 — experience
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);

  // Step 5 — goal
  const [bodyGoal, setBodyGoal] = useState<BodyGoal>("recomp");

  // Step 6 — details (height + age)
  const [heightFt, setHeightFt] = useState("5");
  const [heightIn, setHeightIn] = useState("10");
  const [heightCm, setHeightCm] = useState("178");
  const [age, setAge] = useState("");

  // Step 7 — activity
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");

  // Step 8 — body composition (optional)
  const [waist, setWaist] = useState("");
  const [neck, setNeck] = useState("");

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

  async function handleComplete(skipBodyComp = false) {
    if (!gender || !experience) return;
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
      await refreshUnit();

      // 3. Save nutrition profile (goal + height + age + activity)
      const cm = weightUnit === "lbs"
        ? ftInToCm(parseInt(heightFt) || 5, parseInt(heightIn) || 10)
        : parseFloat(heightCm) || 178;
      await updateNutritionProfile(user.id, {
        heightCm: cm,
        age: parseInt(age) || 25,
        activityLevel,
        bodyGoal,
        targetWeightKg: null,
        weeksToGoal: null,
      });

      // 4. Optionally save waist + neck measurements
      if (!skipBodyComp && (waist || neck)) {
        const tocm = (val: string) => {
          const n = parseFloat(val);
          return isNaN(n) ? null : weightUnit === "lbs" ? n * 2.54 : n;
        };
        await logBodyMeasurements(user.id, {
          waistCm: tocm(waist),
          neckCm: toNeck(neck),
          chestCm: null,
          hipsCm: null,
          leftArmCm: null,
          rightArmCm: null,
          leftThighCm: null,
          notes: null,
          bodyFatPct: null,
          source: "manual",
        });
      }

      router.replace("/templates?from=onboarding");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Helper used above (defined after function for clarity)
  function toNeck(val: string) {
    const n = parseFloat(val);
    return isNaN(n) ? null : weightUnit === "lbs" ? n * 2.54 : n;
  }

  function goBack() {
    const order: Step[] = ["welcome", ...NUMBERED_STEPS];
    const idx = order.indexOf(step);
    if (idx <= 0) {
      router.canGoBack() ? router.back() : router.replace("/(tabs)");
    } else {
      setStep(order[idx - 1]);
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

      {/* Segmented progress bar — all 11 steps */}
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
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {header}

      {/* ── WELCOME ─────────────────────────────────────────────────────────── */}
      {step === "welcome" && (
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "space-between", paddingBottom: bottomInset + 24 }}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <View style={{ width: 40, height: 3, backgroundColor: Colors.primary, marginBottom: 24 }} />
            <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 32,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 16,
              lineHeight: 38,
            }}>
              Build Your{"\n"}Programme
            </Text>
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 15,
              color: Colors.textSecondary,
              lineHeight: 23,
              marginBottom: 32,
            }}>
              ARPO personalises your training volume, weight targets, and calorie goals to your body and experience.
            </Text>

            {[
              { icon: "checkmark-circle-outline" as const, text: "2 required questions — under 1 minute" },
              { icon: "options-outline" as const,          text: "Optional questions personalise your nutrition" },
              { icon: "settings-outline" as const,         text: "Everything is editable later in Settings" },
            ].map(item => (
              <View key={item.text} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Ionicons name={item.icon} size={16} color={Colors.primary} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary }}>
                  {item.text}
                </Text>
              </View>
            ))}
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
              Get Started →
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── UNIT ────────────────────────────────────────────────────────────── */}
      {step === "unit" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Pounds or Kilograms?</Text>
            <Text style={subtitleStyle}>
              Every weight in ARPO — your lifts, targets, and bodyweight — uses this unit throughout the app.
            </Text>

            {(["lbs", "kg"] as WeightUnit[]).map(u => (
              <Pressable
                key={u}
                onPress={() => { haptic(); setWeightUnit(u); setStep("gender"); }}
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

      {/* ── GENDER ──────────────────────────────────────────────────────────── */}
      {step === "gender" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Biological Sex</Text>
            <Text style={subtitleStyle}>
              Used for BMR calculation and strength baseline estimates. This is a physiological input, not a preference.
            </Text>

            {([["MALE", "male"], ["FEMALE", "female"]] as [Gender, keyof typeof Ionicons.glyphMap][]).map(([g, icon]) => (
              <Pressable
                key={g}
                onPress={() => { haptic(); setGender(g); setStep("bodyweight"); }}
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
          </ScrollView>
        </>
      )}

      {/* ── BODYWEIGHT ──────────────────────────────────────────────────────── */}
      {step === "bodyweight" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            {/* Optional badge + skip */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "44",
                backgroundColor: Colors.primary + "11",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Optional
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic(); setStep("experience"); }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                  Skip →
                </Text>
              </Pressable>
            </View>

            <Text style={titleStyle}>Current Bodyweight</Text>
            <Text style={subtitleStyle}>
              Used to estimate your starting lift targets. Skip if you prefer — ARPO will use a typical value and you can update it any time in the Body tab.
            </Text>

            <View style={{
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.bgAccent,
              flexDirection: "row",
              alignItems: "center",
            }}>
              <TextInput
                value={bodyweight}
                onChangeText={setBodyweight}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                style={{
                  flex: 1,
                  fontFamily: "Rubik_700Bold",
                  fontSize: 52,
                  color: Colors.text,
                  paddingVertical: 24,
                  paddingHorizontal: 20,
                  textAlign: "center",
                }}
              />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 18, color: Colors.textMuted, paddingRight: 20, textTransform: "uppercase" }}>
                {weightUnit}
              </Text>
            </View>
          </ScrollView>
          {continueBtn(
            () => { haptic(); setStep("experience"); },
            bodyweight.length > 0 && parseFloat(bodyweight) <= 0  // only disable if something was typed but is invalid
          )}
        </>
      )}

      {/* ── EXPERIENCE ──────────────────────────────────────────────────────── */}
      {step === "experience" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            <Text style={titleStyle}>Training Experience</Text>
            <Text style={subtitleStyle}>
              Sets your starting training volume. Beginners recover faster and need less; advanced lifters need more stimulus to keep progressing.
            </Text>

            {EXPERIENCE_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                onPress={() => { haptic(); setExperience(opt.value); setStep("goal"); }}
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
        </>
      )}

      {/* ── GOAL ────────────────────────────────────────────────────────────── */}
      {step === "goal" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            {/* Optional badge + skip */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "44",
                backgroundColor: Colors.primary + "11",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Optional
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic(); setStep("details"); }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                  Skip →
                </Text>
              </Pressable>
            </View>

            <Text style={titleStyle}>What's the Goal?</Text>
            <Text style={subtitleStyle}>
              Sets your calorie target and macro split. Defaults to Recompose if skipped — you can change it any time in the Body tab.
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
              <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 4, backgroundColor: Colors.bgAccent }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Who Is Recomposition For?
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  Recomp works best for beginners, returning lifters, and those with higher body fat ({">"} 20% men / {">"} 28% women). Progress is slower but you avoid cycling between cut and bulk phases.
                </Text>
              </View>
            )}
          </ScrollView>
          {continueBtn(() => { haptic(); setStep("details"); })}
        </>
      )}

      {/* ── DETAILS ─────────────────────────────────────────────────────────── */}
      {step === "details" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            {/* Optional badge + skip */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "44",
                backgroundColor: Colors.primary + "11",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Optional
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic(); setStep("activity"); }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                  Skip →
                </Text>
              </Pressable>
            </View>

            <Text style={titleStyle}>A Few More Details</Text>
            <Text style={subtitleStyle}>
              Height and age let ARPO calculate your calorie needs using the Mifflin-St Jeor formula. Skip if you'd rather set these later.
            </Text>

            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Height
            </Text>

            {weightUnit === "lbs" ? (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
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
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
              Metabolism slows ~1–2% per decade after 25 — age adjusts your TDEE accordingly.
            </Text>
          </ScrollView>
          {continueBtn(() => { haptic(); setStep("activity"); })}
        </>
      )}

      {/* ── ACTIVITY ────────────────────────────────────────────────────────── */}
      {step === "activity" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            {/* Optional badge + skip */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "44",
                backgroundColor: Colors.primary + "11",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Optional
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic(); setStep("body_comp"); }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                  Skip →
                </Text>
              </Pressable>
            </View>

            <Text style={titleStyle}>How Active Are You?</Text>
            <Text style={subtitleStyle}>
              Count your <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>total daily activity</Text>, including training sessions. Defaults to Moderately Active if skipped.
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
          {continueBtn(() => { haptic(); setStep("body_comp"); })}
        </>
      )}

      {/* ── BODY COMPOSITION ────────────────────────────────────────────────── */}
      {step === "body_comp" && (
        <>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
            {/* Step label + skip */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{
                borderWidth: 1,
                borderColor: Colors.primary + "44",
                backgroundColor: Colors.primary + "11",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Optional
                </Text>
              </View>
              <Pressable
                onPress={() => handleComplete(true)}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>
                  Skip →
                </Text>
              </Pressable>
            </View>

            <Text style={titleStyle}>Body Composition</Text>
            <Text style={subtitleStyle}>
              Waist and neck measurements enable an estimated body fat % using the U.S. Navy formula — no scale needed.
            </Text>

            {/* Info box */}
            <View style={{
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.bgAccent,
              padding: 14,
              marginBottom: 28,
              flexDirection: "row",
              gap: 10,
            }}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                You can add these later in the <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>Body tab</Text>, or they'll sync automatically from your smart scale, Apple Watch, or Google Fit.
              </Text>
            </View>

            {/* Measurement unit label */}
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 20, textAlign: "center" }}>
              Enter measurements in <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>{weightUnit === "lbs" ? "inches" : "centimetres"}</Text>
            </Text>

            {/* Waist */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Waist — measured at navel
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <TextInput
                value={waist}
                onChangeText={setWaist}
                keyboardType="decimal-pad"
                placeholder={weightUnit === "lbs" ? "e.g. 34" : "e.g. 86"}
                placeholderTextColor={Colors.textMuted}
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
              />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>
                {weightUnit === "lbs" ? "in" : "cm"}
              </Text>
            </View>

            {/* Neck */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Neck — measured at mid-point
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TextInput
                value={neck}
                onChangeText={setNeck}
                keyboardType="decimal-pad"
                placeholder={weightUnit === "lbs" ? "e.g. 15" : "e.g. 38"}
                placeholderTextColor={Colors.textMuted}
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAccent, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Rubik_600SemiBold", fontSize: 22, color: Colors.text, textAlign: "center" }}
              />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, width: 30 }}>
                {weightUnit === "lbs" ? "in" : "cm"}
              </Text>
            </View>

            {gender === "FEMALE" && (
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 8, fontStyle: "italic" }}>
                For a more accurate female body fat estimate, also add your hip measurement in the Body tab.
              </Text>
            )}
          </ScrollView>

          <View style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingBottom: 12 + bottomInset,
            gap: 10,
          }}>
            <Pressable
              onPress={() => handleComplete(false)}
              disabled={saving}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {saving
                ? <ActivityIndicator color={Colors.text} />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                    Continue →
                  </Text>
              }
            </Pressable>
            <Pressable
              onPress={() => handleComplete(true)}
              style={({ pressed }) => ({ alignSelf: "center", opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Skip — add later in Body tab
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

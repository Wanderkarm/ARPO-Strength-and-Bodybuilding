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
  type EstimatedWeights,
} from "@/utils/onboardingCalculator";
import { createUser } from "@/lib/local-db";
import { useUnit, type WeightUnit } from "@/contexts/UnitContext";

type Step = "unit" | "gender" | "bodyweight" | "experience" | "weights";

const STEPS: Step[] = ["unit", "gender", "bodyweight", "experience", "weights"];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; desc: string }[] = [
  { value: "BEGINNER", label: "BEGINNER", desc: "< 1 year training" },
  { value: "INTERMEDIATE", label: "INTERMEDIATE", desc: "1-3 years training" },
  { value: "ADVANCED", label: "ADVANCED", desc: "3+ years training" },
];

const WEIGHT_LABELS: Record<keyof EstimatedWeights, string> = {
  squat: "SQUAT",
  benchPress: "BENCH PRESS",
  deadlift: "DEADLIFT",
  overheadPress: "OVERHEAD PRESS",
  barbellRow: "BARBELL ROW",
  barbellCurl: "BARBELL CURL",
};

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { refreshUnit } = useUnit();

  const [step, setStep] = useState<Step>("unit");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [gender, setGender] = useState<Gender | null>(null);
  const [bodyweight, setBodyweight] = useState("");
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [editedWeights, setEditedWeights] = useState<EstimatedWeights | null>(null);
  const [saving, setSaving] = useState(false);

  const estimatedWeights = useMemo(() => {
    if (gender && bodyweight && experience) {
      return estimateWeights({
        gender,
        bodyweight: parseFloat(bodyweight),
        experience,
      });
    }
    return null;
  }, [gender, bodyweight, experience]);

  function handleUnitSelect(u: WeightUnit) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWeightUnit(u);
    setStep("gender");
  }

  function handleGenderSelect(g: Gender) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGender(g);
    setStep("bodyweight");
  }

  function handleBodyweightNext() {
    if (!bodyweight || parseFloat(bodyweight) <= 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("experience");
  }

  function handleExperienceSelect(exp: ExperienceLevel) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExperience(exp);
    const weights = estimateWeights({
      gender: gender!,
      bodyweight: parseFloat(bodyweight),
      experience: exp,
    });
    setEditedWeights(weights);
    setStep("weights");
  }

  function updateWeight(key: keyof EstimatedWeights, value: string) {
    if (!editedWeights) return;
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setEditedWeights({ ...editedWeights, [key]: num });
    }
  }

  async function handleFinish() {
    if (!gender || !bodyweight || !experience || !editedWeights) return;
    setSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const user = await createUser(
        gender,
        parseFloat(bodyweight),
        experience,
        editedWeights,
        weightUnit
      );
      await AsyncStorage.setItem("userId", user.id);
      await AsyncStorage.setItem("userGender", gender);
      await AsyncStorage.setItem("userWeights", JSON.stringify(editedWeights));
      await refreshUnit();
      router.replace("/templates");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === "unit") router.canGoBack() ? router.back() : router.replace("/(tabs)");
    else if (step === "gender") setStep("unit");
    else if (step === "bodyweight") setStep("gender");
    else if (step === "experience") setStep("bodyweight");
    else if (step === "weights") setStep("experience");
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: topInset,
        paddingBottom: bottomInset,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}
      >
        {step !== "unit" && (
          <Pressable onPress={goBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Text
          style={{
            fontFamily: "Rubik_500Medium",
            fontSize: 12,
            color: Colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          {stepIndex + 1} / {STEPS.length}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          gap: 4,
          marginBottom: 32,
        }}
      >
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 2,
              backgroundColor: i <= stepIndex ? Colors.primary : Colors.border,
            }}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── UNIT SELECTION ── */}
        {step === "unit" && (
          <View>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 24,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Weight Unit
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 32,
              }}
            >
              Choose your preferred unit. You can change this later in settings.
            </Text>

            <Pressable
              onPress={() => handleUnitSelect("lbs")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: weightUnit === "lbs" ? Colors.primary : Colors.border,
                backgroundColor: weightUnit === "lbs" ? Colors.bgAccent : Colors.bg,
                paddingVertical: 24,
                paddingHorizontal: 20,
                marginBottom: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text
                    style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 22,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}
                  >
                    Pounds
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 13,
                      color: Colors.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    lbs — used in USA, Canada
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 32,
                    color: weightUnit === "lbs" ? Colors.primary : Colors.textMuted,
                    letterSpacing: -1,
                  }}
                >
                  lbs
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleUnitSelect("kg")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: weightUnit === "kg" ? Colors.primary : Colors.border,
                backgroundColor: weightUnit === "kg" ? Colors.bgAccent : Colors.bg,
                paddingVertical: 24,
                paddingHorizontal: 20,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text
                    style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 22,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}
                  >
                    Kilograms
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 13,
                      color: Colors.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    kg — used in most of the world
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 32,
                    color: weightUnit === "kg" ? Colors.primary : Colors.textMuted,
                    letterSpacing: -1,
                  }}
                >
                  kg
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ── GENDER ── */}
        {step === "gender" && (
          <View>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 24,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Select Gender
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 32,
              }}
            >
              Used to calculate starting weight estimates
            </Text>

            <Pressable
              onPress={() => handleGenderSelect("MALE")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: gender === "MALE" ? Colors.primary : Colors.border,
                backgroundColor: gender === "MALE" ? Colors.bgAccent : Colors.bg,
                paddingVertical: 20,
                paddingHorizontal: 20,
                marginBottom: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text
                  style={{
                    fontFamily: "Rubik_600SemiBold",
                    fontSize: 16,
                    color: Colors.text,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  Male
                </Text>
                <Ionicons name="male" size={24} color={gender === "MALE" ? Colors.primary : Colors.textMuted} />
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleGenderSelect("FEMALE")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: gender === "FEMALE" ? Colors.primary : Colors.border,
                backgroundColor: gender === "FEMALE" ? Colors.bgAccent : Colors.bg,
                paddingVertical: 20,
                paddingHorizontal: 20,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text
                  style={{
                    fontFamily: "Rubik_600SemiBold",
                    fontSize: 16,
                    color: Colors.text,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  Female
                </Text>
                <Ionicons name="female" size={24} color={gender === "FEMALE" ? Colors.primary : Colors.textMuted} />
              </View>
            </Pressable>
          </View>
        )}

        {/* ── BODYWEIGHT ── */}
        {step === "bodyweight" && (
          <View>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 24,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Bodyweight
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 32,
              }}
            >
              Enter your current bodyweight in {weightUnit}
            </Text>

            <View
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.bgInput,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <TextInput
                value={bodyweight}
                onChangeText={setBodyweight}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                style={{
                  flex: 1,
                  fontFamily: "Rubik_700Bold",
                  fontSize: 48,
                  color: Colors.text,
                  paddingVertical: 24,
                  paddingHorizontal: 20,
                  textAlign: "center",
                }}
              />
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 18,
                  color: Colors.textMuted,
                  paddingRight: 20,
                  textTransform: "uppercase",
                }}
              >
                {weightUnit}
              </Text>
            </View>

            <Pressable
              onPress={handleBodyweightNext}
              disabled={!bodyweight || parseFloat(bodyweight) <= 0}
              style={({ pressed }) => ({
                backgroundColor:
                  bodyweight && parseFloat(bodyweight) > 0 ? Colors.primary : Colors.bgAccent,
                paddingVertical: 18,
                marginTop: 24,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 14,
                  color:
                    bodyweight && parseFloat(bodyweight) > 0 ? Colors.text : Colors.textMuted,
                  textAlign: "center",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Continue
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── EXPERIENCE ── */}
        {step === "experience" && (
          <View>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 24,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Experience Level
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 32,
              }}
            >
              This determines your starting volume and intensity
            </Text>

            {EXPERIENCE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => handleExperienceSelect(opt.value)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: experience === opt.value ? Colors.primary : Colors.border,
                  backgroundColor: experience === opt.value ? Colors.bgAccent : Colors.bg,
                  paddingVertical: 20,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_600SemiBold",
                    fontSize: 16,
                    color: Colors.text,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginTop: 4,
                  }}
                >
                  {opt.desc}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── STARTING WEIGHTS ── */}
        {step === "weights" && editedWeights && (
          <View>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 24,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Starting Weights
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 24,
              }}
            >
              Estimated from your profile in {weightUnit}. Adjust as needed.
            </Text>

            {(Object.keys(WEIGHT_LABELS) as (keyof EstimatedWeights)[]).map((key) => (
              <View
                key={key}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingLeft: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_500Medium",
                    fontSize: 12,
                    color: Colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    flex: 1,
                  }}
                >
                  {WEIGHT_LABELS[key]}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    value={String(editedWeights[key])}
                    onChangeText={(v) => updateWeight(key, v)}
                    keyboardType="numeric"
                    style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 20,
                      color: Colors.text,
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      textAlign: "right",
                      minWidth: 80,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 12,
                      color: Colors.textMuted,
                      paddingRight: 16,
                    }}
                  >
                    {weightUnit}
                  </Text>
                </View>
              </View>
            ))}

            <Pressable
              onPress={handleFinish}
              disabled={saving}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 18,
                marginTop: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 14,
                    color: Colors.text,
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  Save & Choose Routine
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

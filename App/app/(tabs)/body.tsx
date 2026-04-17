import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  InputAccessoryView,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Svg, { Polyline, Circle } from "react-native-svg";
import Colors from "@/constants/colors";
import {
  getUserProfile,
  getNutritionProfile,
  getBodyWeightHistory,
  getBodyMeasurementHistory,
  logBodyWeight,
  type BodyMeasurement,
} from "@/lib/local-db";
import {
  calculateNutritionPlan,
  kgToLbs,
  lbsToKg,
  type BodyGoal,
  type ActivityLevel,
  type NutritionPlan,
} from "@/utils/nutritionCalculator";
import {
  calcBMI,
  calcNavyBodyFat,
  calcFFMI,
  calcLeanMassKg,
  bmiCategory,
  bodyFatCategory,
  ffmiCategory,
  bmiMisleadingForAthlete,
} from "@/utils/bodyComposition";
import { syncFromHealth, getLastSyncTime, type SyncResult } from "@/lib/healthSync";
import InfoTip from "@/components/InfoTip";

interface WeightEntry { id: string; weightKg: number; loggedAt: string; }

const GOAL_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  cut:    { label: "Lose Fat",     icon: "trending-down",  color: "#E53935" },
  recomp: { label: "Recompose",    icon: "swap-vertical",  color: Colors.primary },
  bulk:   { label: "Build Muscle", icon: "trending-up",    color: "#43A047" },
};

export default function BodyScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [userId, setUserId] = useState<string | null>(null);
  const [unit, setUnit] = useState<"lbs" | "kg">("lbs");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [heightCm, setHeightCm] = useState<number | null>(null);

  // Nutrition
  const [nutritionPlan, setNutritionPlan] = useState<NutritionPlan | null>(null);
  const [bodyGoal, setBodyGoal] = useState<string>("recomp");
  const [nutritionConfigured, setNutritionConfigured] = useState(false);

  // Weigh-in
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [weightLogged, setWeightLogged] = useState(false);

  // Measurements
  const [latestMeasurement, setLatestMeasurement] = useState<BodyMeasurement | null>(null);

  // Health sync
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => {
    loadAll();
    getLastSyncTime().then(setLastSyncAt);
  }, []));

  async function loadAll() {
    try {
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;
      setUserId(uid);

      const [profile, nutrition, weights, measurements] = await Promise.all([
        getUserProfile(uid),
        getNutritionProfile(uid),
        getBodyWeightHistory(uid, 14),
        getBodyMeasurementHistory(uid, 1),
      ]);

      const u = (profile?.weightUnit ?? "lbs") as "lbs" | "kg";
      setUnit(u);
      setGender((profile?.gender as "MALE" | "FEMALE") ?? "MALE");
      setHeightCm(nutrition?.heightCm ?? null);
      setWeightHistory(weights);
      setLatestMeasurement(measurements[0] ?? null);

      if (nutrition?.heightCm && nutrition?.age && profile?.bodyweight) {
        setNutritionConfigured(true);
        setBodyGoal(nutrition.bodyGoal ?? "recomp");
        const bodyweightKg = u === "lbs" ? lbsToKg(profile.bodyweight) : profile.bodyweight;
        const plan = calculateNutritionPlan({
          gender: profile.gender as "MALE" | "FEMALE",
          weightKg: bodyweightKg,
          heightCm: nutrition.heightCm,
          age: nutrition.age,
          activityLevel: nutrition.activityLevel as ActivityLevel,
          bodyGoal: nutrition.bodyGoal as BodyGoal,
          targetWeightKg: nutrition.targetWeightKg ?? undefined,
          weeksToGoal: nutrition.weeksToGoal ?? undefined,
        });
        setNutritionPlan(plan);
      } else {
        setNutritionConfigured(false);
        setNutritionPlan(null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleLogWeight() {
    if (!userId || !weightInput) return;
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) return;
    setLoggingWeight(true);
    try {
      const kg = unit === "lbs" ? lbsToKg(val) : val;
      await logBodyWeight(userId, kg);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWeightInput("");
      setWeightLogged(true);
      setTimeout(() => setWeightLogged(false), 2000);
      await loadAll();
    } finally {
      setLoggingWeight(false);
    }
  }

  async function handleHealthSync() {
    if (!userId || syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const result: SyncResult = await syncFromHealth(userId);
      setLastSyncAt(result.syncedAt);
      if (result.error) {
        setSyncError(result.error);
      } else if (!result.weightSynced && !result.bodyFatSynced && !result.stepsSynced) {
        setSyncError(`No new data found in ${Platform.OS === "ios" ? "Apple Health" : "Health Connect"}.`);
      } else {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadAll();
      }
    } catch (e) {
      setSyncError("Sync failed. Make sure you've granted permission.");
    } finally {
      setSyncing(false);
    }
  }

  // ── Sparkline ────────────────────────────────────────────────────────────────
  function buildSparkline(entries: WeightEntry[], w: number, h: number) {
    if (entries.length < 2) return null;
    const vals = entries.map(e => unit === "lbs" ? kgToLbs(e.weightKg) : e.weightKg);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const pad = 4;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const lastX = pad + (w - pad * 2);
    const lastY = pad + (1 - (vals[vals.length - 1] - min) / range) * (h - pad * 2);
    return { pts, lastX, lastY };
  }

  // ── Derived display values ────────────────────────────────────────────────────
  const latestEntry = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1] : null;
  const oldestEntry = weightHistory.length > 1 ? weightHistory[0] : null;

  const latestDisplay = latestEntry
    ? (unit === "lbs" ? kgToLbs(latestEntry.weightKg) : Math.round(latestEntry.weightKg * 10) / 10)
    : null;

  const changeVal = (latestEntry && oldestEntry && latestEntry.id !== oldestEntry.id)
    ? (unit === "lbs"
        ? Math.round((kgToLbs(latestEntry.weightKg) - kgToLbs(oldestEntry.weightKg)) * 10) / 10
        : Math.round((latestEntry.weightKg - oldestEntry.weightKg) * 10) / 10)
    : null;

  const sparkData = buildSparkline(weightHistory, 240, 44);
  const goalMeta = GOAL_META[bodyGoal] ?? GOAL_META.recomp;
  const macros = nutritionPlan?.moderate;

  function fmtMeasurement(valueCm: number | null) {
    if (valueCm === null) return null;
    return unit === "lbs"
      ? `${(valueCm / 2.54).toFixed(1)}"`
      : `${valueCm.toFixed(1)} cm`;
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // ── Body composition calculations ─────────────────────────────────────────────
  const latestWeightKg = latestEntry?.weightKg ?? null;
  const bmi = latestWeightKg && heightCm ? calcBMI(latestWeightKg, heightCm) : null;
  const bmiMeta = bmi ? bmiCategory(bmi) : null;

  // Prefer stored body fat % from hardware; fall back to Navy formula
  const storedBodyFatPct = latestMeasurement?.bodyFatPct ?? null;
  const navyBodyFatPct =
    latestMeasurement?.waistCm && latestMeasurement?.neckCm && heightCm
      ? calcNavyBodyFat(
          gender,
          latestMeasurement.waistCm,
          latestMeasurement.neckCm,
          heightCm,
          latestMeasurement.hipsCm,
        )
      : null;
  const bodyFatPct = storedBodyFatPct ?? navyBodyFatPct;
  const bodyFatSource = storedBodyFatPct ? latestMeasurement?.source ?? "device" : "navy_formula";
  const bodyFatMeta = bodyFatPct ? bodyFatCategory(bodyFatPct, gender) : null;

  const ffmi =
    latestWeightKg && heightCm && bodyFatPct !== null
      ? calcFFMI(latestWeightKg, heightCm, bodyFatPct)
      : null;
  const ffmiMeta = ffmi ? ffmiCategory(ffmi, gender) : null;

  const leanMassKg =
    latestWeightKg && bodyFatPct !== null
      ? calcLeanMassKg(latestWeightKg, bodyFatPct)
      : null;

  const hasCompositionData = bmi !== null || bodyFatPct !== null;
  const isBmiMisleading = bmi !== null && ffmi !== null && bmiMisleadingForAthlete(bmi, ffmi);
  const needsMeasurements = !navyBodyFatPct && !storedBodyFatPct;
  // Female users who've already logged waist + neck but are missing hips — Navy formula requires it
  const needsHipsForFemale =
    gender === "FEMALE" &&
    !storedBodyFatPct &&
    !!latestMeasurement?.waistCm &&
    !!latestMeasurement?.neckCm &&
    !latestMeasurement?.hipsCm;

  // ── Render ───────────────────────────────────────────────────────────────────
  const WEIGH_IN_INPUT_ID = "weighin-accessory";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
    <View style={{ flex: 1, paddingTop: topInset }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 20 }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 24,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}>
            Body
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>

          {/* ── Nutrition ─────────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push(nutritionConfigured ? "/nutrition" : "/nutrition-setup")}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 16,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Nutrition
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>

            {nutritionConfigured && macros ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Ionicons name={goalMeta.icon} size={18} color={goalMeta.color} />
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 16, color: Colors.text }}>
                    {goalMeta.label}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>
                    · {macros.calories} kcal
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Protein", value: `${macros.proteinG}g`, color: "#EF5350" },
                    { label: "Carbs",   value: `${macros.carbsG}g`,   color: Colors.primary },
                    { label: "Fat",     value: `${macros.fatG}g`,     color: "#FFA726" },
                  ].map(m => (
                    <View key={m.label} style={{
                      flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 8, alignItems: "center",
                    }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: m.color }}>{m.value}</Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                        {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="nutrition-outline" size={26} color={Colors.textMuted} />
                <View>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>Set up nutrition targets</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>Calories, macros & meal examples</Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* ── Weigh-in ──────────────────────────────────────────────────────── */}
          <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Weigh-in
              </Text>
              <Pressable onPress={() => router.push("/body-weight-log")} hitSlop={8}>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  History →
                </Text>
              </Pressable>
            </View>

            {latestDisplay !== null ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 36, color: Colors.text }}>
                    {latestDisplay}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 16, color: Colors.textSecondary }}>
                    {unit}
                  </Text>
                  {changeVal !== null && changeVal !== 0 && (
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: changeVal > 0 ? "#FFA726" : "#66BB6A" }}>
                      {changeVal > 0 ? `+${changeVal}` : changeVal} (14d)
                    </Text>
                  )}
                </View>
                {sparkData && (
                  <Svg width={240} height={44} style={{ marginBottom: 12 }}>
                    <Polyline points={sparkData.pts} fill="none" stroke={Colors.primary} strokeWidth="1.5" strokeOpacity={0.65} />
                    <Circle cx={sparkData.lastX} cy={sparkData.lastY} r={3.5} fill={Colors.primary} />
                  </Svg>
                )}
              </>
            ) : (
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, marginBottom: 12 }}>
                No weigh-ins logged yet.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder={`Weight (${unit})`}
                placeholderTextColor={Colors.textMuted}
                inputAccessoryViewID={Platform.OS === "ios" ? WEIGH_IN_INPUT_ID : undefined}
                style={{
                  flex: 1, borderWidth: 1, borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent, color: Colors.text,
                  fontFamily: "Rubik_400Regular", fontSize: 15,
                  paddingHorizontal: 12, paddingVertical: 10,
                }}
              />
              {/* On Android the Log button stays inline; on iOS it moves to the keyboard toolbar */}
              {Platform.OS !== "ios" && (
                <Pressable
                  onPress={handleLogWeight}
                  disabled={loggingWeight || !weightInput}
                  style={({ pressed }) => ({
                    backgroundColor: weightLogged ? "#2E7D32" : Colors.primary,
                    paddingHorizontal: 18, justifyContent: "center",
                    opacity: (pressed || loggingWeight || !weightInput) ? 0.7 : 1,
                  })}
                >
                  {loggingWeight
                    ? <ActivityIndicator color={Colors.text} size="small" />
                    : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                        {weightLogged ? "Logged ✓" : "Log"}
                      </Text>
                  }
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Body Composition ──────────────────────────────────────────────── */}
          <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Composition
              </Text>
              {bodyFatSource === "navy_formula" && bodyFatPct !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="calculator-outline" size={11} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
                    Navy formula
                  </Text>
                </View>
              )}
              {storedBodyFatPct !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="hardware-chip-outline" size={11} color={Colors.primary} />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.primary }}>
                    {latestMeasurement?.source === "apple_health" ? "Apple Health"
                      : latestMeasurement?.source === "google_fit" ? "Google Fit"
                      : latestMeasurement?.source === "smart_scale" ? "Smart Scale"
                      : "Device"}
                  </Text>
                </View>
              )}
            </View>

            {hasCompositionData ? (
              <>
                {/* Metric grid */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>

                  {/* BMI */}
                  {bmi !== null && bmiMeta && (
                    <View style={{
                      borderWidth: 1,
                      borderColor: isBmiMisleading ? Colors.border : bmiMeta.color + "55",
                      borderLeftWidth: 3,
                      borderLeftColor: isBmiMisleading ? Colors.textMuted : bmiMeta.color,
                      paddingHorizontal: 12, paddingVertical: 10, minWidth: 100, flex: 1,
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                          BMI
                        </Text>
                        <InfoTip term="BMI" size={11} />
                      </View>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: isBmiMisleading ? Colors.textMuted : bmiMeta.color, lineHeight: 26 }}>
                        {bmi.toFixed(1)}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: isBmiMisleading ? Colors.textMuted : bmiMeta.color, marginTop: 2 }}>
                        {isBmiMisleading ? "See FFMI ↓" : bmiMeta.label}
                      </Text>
                    </View>
                  )}

                  {/* Body Fat % */}
                  {bodyFatPct !== null && bodyFatMeta && (
                    <View style={{
                      borderWidth: 1,
                      borderColor: bodyFatMeta.color + "55",
                      borderLeftWidth: 3,
                      borderLeftColor: bodyFatMeta.color,
                      paddingHorizontal: 12, paddingVertical: 10, minWidth: 100, flex: 1,
                    }}>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                        Body Fat
                      </Text>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: bodyFatMeta.color, lineHeight: 26 }}>
                        {bodyFatPct.toFixed(1)}%
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: bodyFatMeta.color, marginTop: 2 }}>
                        {bodyFatMeta.label}
                      </Text>
                    </View>
                  )}

                  {/* FFMI */}
                  {ffmi !== null && ffmiMeta && (
                    <View style={{
                      borderWidth: 1,
                      borderColor: ffmiMeta.color + "55",
                      borderLeftWidth: 3,
                      borderLeftColor: ffmiMeta.color,
                      paddingHorizontal: 12, paddingVertical: 10, minWidth: 100, flex: 1,
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                          FFMI
                        </Text>
                        <InfoTip term="FFMI" size={11} />
                      </View>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: ffmiMeta.color, lineHeight: 26 }}>
                        {ffmi.toFixed(1)}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: ffmiMeta.color, marginTop: 2 }}>
                        {ffmiMeta.label}
                      </Text>
                    </View>
                  )}

                  {/* Lean Mass */}
                  {leanMassKg !== null && (
                    <View style={{
                      borderWidth: 1, borderColor: Colors.border,
                      paddingHorizontal: 12, paddingVertical: 10, minWidth: 100, flex: 1,
                    }}>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                        Lean Mass
                      </Text>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: Colors.text, lineHeight: 26 }}>
                        {unit === "lbs" ? kgToLbs(leanMassKg).toFixed(1) : leanMassKg.toFixed(1)}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                        {unit}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Athlete caveat for BMI */}
                {isBmiMisleading && (
                  <View style={{
                    borderWidth: 1, borderColor: Colors.border,
                    borderLeftWidth: 3, borderLeftColor: Colors.primary,
                    backgroundColor: Colors.primary + "0A",
                    padding: 12, marginBottom: 10,
                    flexDirection: "row", alignItems: "flex-start", gap: 8,
                  }}>
                    <Ionicons name="information-circle-outline" size={15} color={Colors.primary} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 17 }}>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>BMI is misleading for trained athletes.</Text>
                      {" "}Your FFMI accounts for muscle mass and is the better metric for lifters. A higher BMI with a strong FFMI just means you carry more muscle.
                    </Text>
                  </View>
                )}

                {/* Add measurements CTA if only BMI showing */}
                {needsMeasurements && bmi !== null && (
                  <Pressable
                    onPress={() => router.push("/body-measurements")}
                    style={({ pressed }) => ({
                      borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
                      padding: 12, flexDirection: "row", alignItems: "center", gap: 10,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={Colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      {needsHipsForFemale ? (
                        <>
                          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text }}>
                            Add hip measurement to unlock body fat % and FFMI
                          </Text>
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                            The Navy formula for women requires waist, hips &amp; neck
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text }}>
                            Add waist &amp; neck to unlock body fat % and FFMI
                          </Text>
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                            Calculated using the U.S. Navy formula — no scale needed
                          </Text>
                        </>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </Pressable>
                )}
              </>
            ) : (
              /* No data at all */
              <Pressable
                onPress={() => router.push("/body-measurements")}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1, marginBottom: 10 })}
              >
                <View style={{
                  width: 44, height: 44, backgroundColor: Colors.bgAccent,
                  borderWidth: 1, borderColor: Colors.border,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name="analytics-outline" size={22} color={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>
                    Unlock body composition metrics
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                    BMI · Body fat % · FFMI · Lean mass
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </Pressable>
            )}

            {/* ── Health sync button ── */}
            {Platform.OS !== "web" && (
              <View style={{ marginTop: hasCompositionData ? 4 : 0 }}>
                {syncError && (
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.warning, marginBottom: 8, lineHeight: 15 }}>
                    {syncError}
                  </Text>
                )}
                <Pressable
                  onPress={handleHealthSync}
                  disabled={syncing}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: Colors.border,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: (pressed || syncing) ? 0.6 : 1,
                  })}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons
                      name={Platform.OS === "ios" ? "heart-circle-outline" : "fitness-outline"}
                      size={15}
                      color={Colors.primary}
                    />
                  )}
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                    {Platform.OS === "ios" ? "Sync from Apple Health" : "Sync from Health Connect"}
                  </Text>
                </Pressable>
                {lastSyncAt && !syncing && (
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 6 }}>
                    Last synced {new Date(lastSyncAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── Measurements ──────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/body-measurements")}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: Colors.border, padding: 16, opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: latestMeasurement ? 10 : 0 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Measurements
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>

            {latestMeasurement ? (
              <>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 10 }}>
                  Last logged · {fmtDate(latestMeasurement.loggedAt)}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {([
                    { label: "Chest",  val: latestMeasurement.chestCm },
                    { label: "Waist",  val: latestMeasurement.waistCm },
                    { label: "Hips",   val: latestMeasurement.hipsCm },
                    { label: "Arms",   val: latestMeasurement.leftArmCm },
                    { label: "Thighs", val: latestMeasurement.leftThighCm },
                    { label: "Neck",   val: latestMeasurement.neckCm },
                  ] as { label: string; val: number | null }[])
                    .filter(m => m.val !== null)
                    .map(m => (
                      <View key={m.label} style={{
                        borderWidth: 1, borderColor: Colors.border,
                        paddingHorizontal: 10, paddingVertical: 6, minWidth: 70,
                      }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>
                          {fmtMeasurement(m.val)}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                          {m.label}
                        </Text>
                      </View>
                    ))
                  }
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
                <Ionicons name="body-outline" size={26} color={Colors.textMuted} />
                <View>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>Log measurements</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>Chest, waist, arms &amp; more</Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* ── 1RM Calculator ────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/one-rep-max")}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: Colors.border, padding: 16,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{
                width: 40, height: 40, backgroundColor: Colors.bgAccent,
                borderWidth: 1, borderColor: Colors.border,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name="barbell-outline" size={22} color={Colors.primary} />
              </View>
              <View>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text }}>
                  1RM Calculator
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                  Estimate your one-rep max from any set
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>

        </View>
      </ScrollView>

      {/* iOS keyboard toolbar — Log button floats above the keyboard */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={WEIGH_IN_INPUT_ID}>
          <View style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: Colors.bgAccent,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            gap: 10,
          }}>
            {weightInput.trim() !== "" && (
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>
                {weightInput} {unit}
              </Text>
            )}
            <Pressable
              onPress={handleLogWeight}
              disabled={loggingWeight || !weightInput}
              style={({ pressed }) => ({
                backgroundColor: weightLogged ? "#2E7D32" : Colors.primary,
                paddingHorizontal: 20,
                paddingVertical: 9,
                opacity: (pressed || loggingWeight || !weightInput) ? 0.7 : 1,
              })}
            >
              {loggingWeight
                ? <ActivityIndicator color={Colors.text} size="small" />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    {weightLogged ? "Logged ✓" : "Log Weight"}
                  </Text>
              }
            </Pressable>
          </View>
        </InputAccessoryView>
      )}

    </View>
    </KeyboardAvoidingView>
  );
}

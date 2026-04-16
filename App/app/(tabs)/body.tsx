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
  calculateBMR,
  calculateTDEE,
  calculateNutritionPlan,
  kgToLbs,
  lbsToKg,
  type BodyGoal,
  type ActivityLevel,
  type NutritionPlan,
} from "@/utils/nutritionCalculator";

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

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadAll(); }, []));

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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
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
              <Text style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 11,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
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
                      flex: 1,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      padding: 8,
                      alignItems: "center",
                    }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: m.color }}>
                        {m.value}
                      </Text>
                      <Text style={{
                        fontFamily: "Rubik_400Regular",
                        fontSize: 10,
                        color: Colors.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginTop: 2,
                      }}>
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
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>
                    Set up nutrition targets
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                    Calories, macros & meal examples
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* ── Weigh-in ──────────────────────────────────────────────────────── */}
          <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16 }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <Text style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 11,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
                Weigh-in
              </Text>
              <Pressable onPress={() => router.push("/body-weight-log")} hitSlop={8}>
                <Text style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 11,
                  color: Colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
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
                    <Text style={{
                      fontFamily: "Rubik_600SemiBold",
                      fontSize: 13,
                      color: changeVal > 0 ? "#FFA726" : "#66BB6A",
                    }}>
                      {changeVal > 0 ? `+${changeVal}` : changeVal} (14d)
                    </Text>
                  )}
                </View>

                {sparkData && (
                  <Svg width={240} height={44} style={{ marginBottom: 12 }}>
                    <Polyline
                      points={sparkData.pts}
                      fill="none"
                      stroke={Colors.primary}
                      strokeWidth="1.5"
                      strokeOpacity={0.65}
                    />
                    <Circle
                      cx={sparkData.lastX}
                      cy={sparkData.lastY}
                      r={3.5}
                      fill={Colors.primary}
                    />
                  </Svg>
                )}
              </>
            ) : (
              <Text style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 13,
                color: Colors.textMuted,
                marginBottom: 12,
              }}>
                No weigh-ins logged yet.
              </Text>
            )}

            {/* Inline log row */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder={`Weight (${unit})`}
                placeholderTextColor={Colors.textMuted}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent,
                  color: Colors.text,
                  fontFamily: "Rubik_400Regular",
                  fontSize: 15,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <Pressable
                onPress={handleLogWeight}
                disabled={loggingWeight || !weightInput}
                style={({ pressed }) => ({
                  backgroundColor: weightLogged ? "#2E7D32" : Colors.primary,
                  paddingHorizontal: 18,
                  justifyContent: "center",
                  opacity: (pressed || loggingWeight || !weightInput) ? 0.7 : 1,
                })}
              >
                {loggingWeight
                  ? <ActivityIndicator color={Colors.text} size="small" />
                  : (
                    <Text style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 12,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}>
                      {weightLogged ? "Logged ✓" : "Log"}
                    </Text>
                  )
                }
              </Pressable>
            </View>
          </View>

          {/* ── Measurements ──────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/body-measurements")}
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
              marginBottom: latestMeasurement ? 10 : 0,
            }}>
              <Text style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 11,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
                Measurements
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>

            {latestMeasurement ? (
              <>
                <Text style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 11,
                  color: Colors.textMuted,
                  marginBottom: 10,
                }}>
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
                        borderWidth: 1,
                        borderColor: Colors.border,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        minWidth: 70,
                      }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>
                          {fmtMeasurement(m.val)}
                        </Text>
                        <Text style={{
                          fontFamily: "Rubik_400Regular",
                          fontSize: 10,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginTop: 2,
                        }}>
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
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>
                    Log measurements
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                    Chest, waist, arms & more
                  </Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* ── 1RM Calculator ────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/one-rep-max")}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{
                width: 40,
                height: 40,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1,
                borderColor: Colors.border,
                alignItems: "center",
                justifyContent: "center",
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
    </View>
  );
}

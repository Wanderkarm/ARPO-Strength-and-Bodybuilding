import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import { getUserProfile, getNutritionProfile } from "@/lib/local-db";
import {
  calculateNutritionPlan,
  generateMealExamples,
  kgToLbs,
  type NutritionPlan,
  type MacroSet,
  type AggressionLevel,
  type BodyGoal,
} from "@/utils/nutritionCalculator";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = AggressionLevel;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GOAL_COLORS: Record<BodyGoal, string> = {
  cut: "#E53935",
  recomp: Colors.primary,
  bulk: "#43A047",
};

const GOAL_LABELS: Record<BodyGoal, string> = {
  cut: "Lose Fat",
  recomp: "Recompose",
  bulk: "Build Muscle",
};

const TAB_CONFIG: { key: Tab; label: string; shortLabel: string }[] = [
  { key: "conservative", label: "Conservative", shortLabel: "Easy" },
  { key: "moderate", label: "Moderate", shortLabel: "Steady" },
  { key: "aggressive", label: "Aggressive", shortLabel: "Fast" },
];

// ─── Macro bar ────────────────────────────────────────────────────────────────

function MacroBar({
  label,
  grams,
  calories,
  totalCalories,
  color,
}: {
  label: string;
  grams: number;
  calories: number;
  totalCalories: number;
  color: string;
}) {
  const pct = Math.round((calories / totalCalories) * 100);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color }}>
            {grams}g
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
            {pct}% · {calories} kcal
          </Text>
        </View>
      </View>
      <View style={{ height: 6, backgroundColor: Colors.bgAccent, borderRadius: 3, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{
      flex: 1,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      alignItems: "center",
    }}>
      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NutritionScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [bodyGoal, setBodyGoal] = useState<BodyGoal>("recomp");
  const [bodyweightKg, setBodyweightKg] = useState(80);
  const [activeTab, setActiveTab] = useState<Tab>("moderate");
  const [scienceExpanded, setScienceExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [unit])
  );

  async function loadData() {
    setLoading(true);
    try {
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) { router.replace("/nutrition-setup"); return; }

      const profile = await getUserProfile(uid);
      const nutrition = await getNutritionProfile(uid);

      if (!profile || !nutrition?.heightCm || !nutrition?.age) {
        router.replace("/nutrition-setup");
        return;
      }

      const bwKg = profile.bodyweight ?? 80;
      setBodyweightKg(bwKg);

      const goal = (nutrition.bodyGoal ?? "recomp") as BodyGoal;
      setBodyGoal(goal);

      const calculated = calculateNutritionPlan({
        gender: profile.gender as "MALE" | "FEMALE",
        weightKg: bwKg,
        heightCm: nutrition.heightCm,
        age: nutrition.age,
        activityLevel: nutrition.activityLevel as any,
        bodyGoal: goal,
        targetWeightKg: nutrition.targetWeightKg ?? undefined,
        weeksToGoal: nutrition.weeksToGoal ?? undefined,
        experienceLevel: profile.experience as any,
      });

      setPlan(calculated);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!plan) return null;

  const goalColor = GOAL_COLORS[bodyGoal];
  const macros: MacroSet = plan[activeTab];
  const meals = generateMealExamples(macros.calories, macros.proteinG);
  const weeklyChange = plan.weeklyChangeKg[activeTab];
  const weeksToGoal = plan.weeksToGoal?.[activeTab];

  const proteinCal = macros.proteinG * 4;
  const carbsCal = macros.carbsG * 4;
  const fatCal = macros.fatG * 9;

  const bwDisplay = unit === "lbs"
    ? `${Math.round(kgToLbs(bodyweightKg))} lbs`
    : `${Math.round(bodyweightKg)} kg`;

  const changePerWeek = Math.abs(weeklyChange);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* ── Header ── */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 13,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}>
            Nutrition Targets
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/nutrition-setup")}
          hitSlop={12}
        >
          <Ionicons name="create-outline" size={22} color={Colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Goal banner ── */}
        <View style={{
          marginHorizontal: 20,
          marginTop: 20,
          borderWidth: 1,
          borderColor: goalColor + "44",
          borderLeftWidth: 3,
          borderLeftColor: goalColor,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}>
          <Ionicons
            name={bodyGoal === "cut" ? "trending-down" : bodyGoal === "bulk" ? "trending-up" : "swap-vertical"}
            size={22}
            color={goalColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: goalColor, textTransform: "uppercase", letterSpacing: 1 }}>
              {GOAL_LABELS[bodyGoal]}
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
              BMR {plan.bmr.toLocaleString()} kcal · TDEE {plan.tdee.toLocaleString()} kcal · {bwDisplay}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/nutrition-setup")}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Edit
            </Text>
          </Pressable>
        </View>

        {/* ── Aggression tabs ── */}
        <View style={{ flexDirection: "row", marginHorizontal: 20, marginTop: 20, gap: 0 }}>
          {TAB_CONFIG.map((tab, i) => {
            const isActive = activeTab === tab.key;
            const tabMacros = plan[tab.key];
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1,
                  borderColor: isActive ? Colors.primary : Colors.border,
                  backgroundColor: isActive ? Colors.primary + "15" : Colors.bg,
                  paddingVertical: 12,
                  paddingHorizontal: 6,
                  alignItems: "center",
                  borderRightWidth: i < 2 ? 0 : 1,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 9,
                  color: isActive ? Colors.primary : Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 3,
                }}>
                  {tab.label}
                </Text>
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 20,
                  color: isActive ? Colors.text : Colors.textSecondary,
                }}>
                  {tabMacros.calories.toLocaleString()}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
                  kcal/day
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Stats row ── */}
        <View style={{ flexDirection: "row", marginHorizontal: 20, marginTop: 10, gap: 8 }}>
          <StatPill
            label="vs TDEE"
            value={`${macros.calories > plan.tdee ? "+" : ""}${macros.calories - plan.tdee}`}
            sub="kcal/day"
          />
          <StatPill
            label={bodyGoal === "recomp" ? "Rate" : "Change"}
            value={weeklyChange === 0 ? "Maintain" : (unit === "lbs" ? `${weeklyChange < 0 ? "−" : "+"}${kgToLbs(changePerWeek).toFixed(1)}` : `${weeklyChange < 0 ? "−" : "+"}${changePerWeek.toFixed(2)}`)}
            sub={weeklyChange === 0 ? "calories" : `${unit}/wk`}
          />
          {weeksToGoal && (
            <StatPill
              label="Est. Goal"
              value={`${weeksToGoal}w`}
              sub="to target"
            />
          )}
        </View>

        {/* ── Macro breakdown ── */}
        <View style={{
          marginHorizontal: 20,
          marginTop: 20,
          borderWidth: 1,
          borderColor: Colors.border,
          padding: 16,
        }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 10,
            color: Colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 14,
          }}>
            Daily Macros
          </Text>

          <MacroBar
            label="Protein"
            grams={macros.proteinG}
            calories={proteinCal}
            totalCalories={macros.calories}
            color="#3B82F6"
          />
          <MacroBar
            label="Carbohydrates"
            grams={macros.carbsG}
            calories={carbsCal}
            totalCalories={macros.calories}
            color="#F59E0B"
          />
          <MacroBar
            label="Fat"
            grams={macros.fatG}
            calories={fatCal}
            totalCalories={macros.calories}
            color="#EC4899"
          />

          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />

          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 17 }}>
            Protein target is <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>1g per lb of bodyweight</Text> — the research-supported maximum for muscle retention and growth (Helms et al., 2014). Fat minimum ensures hormonal health. Remaining calories go to carbs for training performance.
          </Text>
        </View>

        {/* ── Science note ── */}
        <Pressable
          onPress={() => setScienceExpanded(!scienceExpanded)}
          style={({ pressed }) => ({
            marginHorizontal: 20,
            marginTop: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            padding: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="flask-outline" size={16} color={Colors.primary} />
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                The Science
              </Text>
            </View>
            <Ionicons
              name={scienceExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors.textMuted}
            />
          </View>
          {scienceExpanded && (
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 12,
              color: Colors.textSecondary,
              lineHeight: 19,
              marginTop: 12,
            }}>
              {plan.scienceNote}
            </Text>
          )}
        </Pressable>

        {/* ── Timeline warning ── */}
        {!plan.timelineValid && plan.timelineWarning && (
          <View style={{
            marginHorizontal: 20,
            marginTop: 12,
            borderWidth: 1,
            borderColor: Colors.warning,
            borderLeftWidth: 3,
            borderLeftColor: Colors.warning,
            padding: 14,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ionicons name="warning" size={16} color={Colors.warning} />
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.warning, textTransform: "uppercase", letterSpacing: 1 }}>
                Ambitious Timeline
              </Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 }}>
              {plan.timelineWarning}
            </Text>
            {plan.realisticWeeks && (
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text }}>
                Suggested realistic timeline:{" "}
                <Text style={{ color: Colors.primary }}>{plan.realisticWeeks} weeks</Text>
              </Text>
            )}
            <Pressable
              onPress={() => router.push("/nutrition-setup")}
              style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                Update Timeline →
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Example meals ── */}
        <View style={{ marginHorizontal: 20, marginTop: 20 }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 10,
            color: Colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 10,
          }}>
            What {macros.calories.toLocaleString()} kcal Looks Like
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 14 }}>
            Example day hitting your {activeTab} target. Swap foods freely — hit the numbers, not the exact meals.
          </Text>

          {meals.map((meal, i) => (
            <View
              key={meal.name}
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderTopWidth: i === 0 ? 1 : 0,
                padding: 14,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <View style={{ width: 40, height: 40, backgroundColor: Colors.bgAccent, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontSize: 18 }}>
                  {i === 0 ? "🌅" : i === 1 ? "🍽️" : i === 2 ? "💪" : "🌙"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    {meal.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text }}>
                      {meal.calories} <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>kcal</Text>
                    </Text>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: "#3B82F6" }}>
                      {meal.proteinG}g <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>pro</Text>
                    </Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
                  {meal.foods}
                </Text>
              </View>
            </View>
          ))}

          {/* Daily total */}
          <View style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderTopWidth: 0,
            padding: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: Colors.bgAccent,
          }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Daily Total
            </Text>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text }}>
                {meals.reduce((s, m) => s + m.calories, 0).toLocaleString()} kcal
              </Text>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: "#3B82F6" }}>
                {meals.reduce((s, m) => s + m.proteinG, 0)}g protein
              </Text>
            </View>
          </View>
        </View>

        {/* ── Protein note ── */}
        <View style={{
          marginHorizontal: 20,
          marginTop: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          borderLeftWidth: 3,
          borderLeftColor: "#3B82F6",
          padding: 14,
        }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#3B82F6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Why Protein Is #1
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
            Hitting your protein target is the single biggest lever you have. Calories can fluctuate ±200 kcal without much impact — protein cannot. Missing protein targets means losing muscle on a cut or failing to build on a bulk. Prioritise protein at every meal, then fill calories with carbs and fat.
          </Text>
        </View>

        {/* ── Edit button ── */}
        <Pressable
          onPress={() => router.push("/nutrition-setup")}
          style={({ pressed }) => ({
            marginHorizontal: 20,
            marginTop: 24,
            borderWidth: 1,
            borderColor: Colors.border,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="create-outline" size={16} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            Edit Goal or Details
          </Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

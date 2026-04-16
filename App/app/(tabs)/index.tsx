import React, { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  Alert,
  Dimensions,
  TextInput,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import GlossaryTerm from "@/components/GlossaryTerm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  getWorkoutPlan, skipSession,
  getStreakInfo, getTodaySteps, updateDailySteps,
  type WorkoutPlan, type WorkoutLog, type StreakInfo, type DailyStepsEntry,
} from "@/lib/local-db";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<number, string> = {
  1: "ACCUMULATION",
  2: "INTENSIFICATION",
  3: "OVERREACH",
  4: "DELOAD",
};
const PHASE_RIR: Record<number, number> = { 1: 3, 2: 2, 3: 1, 4: 4 };

function mesoWeekOf(week: number) { return ((week - 1) % 4) + 1; }

/** Simple weight projection for unstarted weeks: ~2.5% per week */
function projectWeight(base: number, weekDelta: number): number {
  if (base <= 0 || weekDelta <= 0) return base;
  return Math.round((base * Math.pow(1.025, weekDelta)) / 2.5) * 2.5;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [skipping, setSkipping] = useState(false);

  // Day & week browser
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [previewWeek, setPreviewWeek] = useState(1);
  const dayScrollRef = useRef<ScrollView>(null);

  // Streak + Steps
  const [streak, setStreak] = useState<StreakInfo>({ current: 0, longest: 0, lastStreakDate: null });
  const [todaySteps, setTodaySteps] = useState<DailyStepsEntry | null>(null);
  const [stepsModalVisible, setStepsModalVisible] = useState(false);
  const [stepsInput, setStepsInput] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);

  const loadPlan = useCallback(async () => {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (planId) {
      const p = await getWorkoutPlan(planId);
      setPlan(p);
      if (p) {
        const idx = (p.currentDay || 1) - 1;
        setSelectedDayIdx(idx);
        setPreviewWeek(p.currentWeek);
        setTimeout(() => {
          dayScrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false });
        }, 50);
      }
    }

    // Load streak + steps
    const uid = await AsyncStorage.getItem("userId");
    if (uid) {
      const [s, steps] = await Promise.all([
        getStreakInfo(uid),
        getTodaySteps(uid),
      ]);
      setStreak(s);
      setTodaySteps(steps);
    }

    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadPlan(); }, [loadPlan]));

  async function onRefresh() {
    setRefreshing(true);
    await loadPlan();
    setRefreshing(false);
  }

  function handleStartWorkout() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/workout");
  }

  function handleSkipSession() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Skip Session", "Are you sure? This will push your targets to next week.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip", style: "destructive",
        onPress: async () => {
          if (!plan) return;
          setSkipping(true);
          try {
            const result = await skipSession(plan.id, plan.currentWeek, plan.currentDay || 1);
            if (result.isMesoComplete) {
              await AsyncStorage.removeItem("activePlanId");
              router.replace("/meso-complete");
            } else {
              await loadPlan();
            }
          } catch (err) { console.error("Skip error:", err); }
          finally { setSkipping(false); }
        },
      },
    ]);
  }

  async function handleChangeRoutine() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuVisible(false);
    await AsyncStorage.removeItem("activePlanId");
    router.replace("/templates");
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // ── No active plan — show quick-start screen ──────────────────────────────
  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <View style={{ paddingTop: 48, alignItems: "center", marginBottom: 40 }}>
            <View style={{ width: 64, height: 64, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
              <Ionicons name="barbell-outline" size={32} color={Colors.primary} />
            </View>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, textAlign: "center", marginBottom: 8 }}>
              No Routine Active
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
              Pick a training template or build your own mesocycle to get started.
            </Text>
          </View>

          {/* Primary CTA */}
          <Pressable
            onPress={() => router.push("/templates")}
            style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 18, alignItems: "center", marginBottom: 10, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 2 }}>
              Browse Workout Templates →
            </Text>
          </Pressable>

          {/* Secondary actions */}
          {[
            { icon: "nutrition-outline" as const, label: "Nutrition & Macro Targets", sub: "View or update your calorie and macro goals", route: "/nutrition" },
            { icon: "scale-outline" as const, label: "Weigh-in Log", sub: "Log your bodyweight and track trends", route: "/(tabs)/progress" },
          ].map((item) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 14,
                borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 10,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ width: 38, height: 38, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={item.icon} size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>{item.label}</Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          ))}

          {/* Restart setup */}
          <View style={{ marginTop: 24, borderWidth: 1, borderColor: Colors.border, padding: 16 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
              First Time or Starting Over?
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 14 }}>
              Run the full onboarding setup again. Your profile, nutrition, and notification preferences can also be updated anytime in{" "}
              <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.textSecondary }}>Settings</Text>.
            </Text>
            <Pressable
              onPress={() => Alert.alert(
                "Restart Setup",
                "This will walk you through setup again. Your existing workout history and logs will be kept, but your profile and nutrition data may be overwritten.\n\nYou can also update individual settings anytime in the Settings tab.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Continue to Setup", onPress: () => router.replace("/onboarding") },
                ]
              )}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Restart Setup
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const mesoWeek = mesoWeekOf(plan.currentWeek);
  const isDeload = mesoWeek === 4;
  const mesoPhase = PHASE_LABEL[mesoWeek];
  const rirTarget = PHASE_RIR[mesoWeek];

  const completedDayNumbers = new Set(
    plan.logs.filter(l => l.weekNumber === plan.currentWeek && l.completedAt).map(l => l.dayNumber)
  );
  const completedDays = completedDayNumbers.size;
  const totalDays = plan.template.days.length;
  const nextDayIndex = (plan.currentDay || 1) - 1;
  const progressPercent = totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0;

  // ── Get all logs for a given day + week ──────────────────────────────────────
  function getLogsForDayWeek(dayNumber: number, weekNum: number): WorkoutLog[] {
    return plan?.logs.filter(l => l.dayNumber === dayNumber && l.weekNumber === weekNum) ?? [];
  }

  function isDayCompleted(dayNumber: number): boolean {
    return plan?.logs.some(l => l.dayNumber === dayNumber && l.weekNumber === plan.currentWeek && l.completedAt) ?? false;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── Header ── */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Hypertrophy Hub
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                {plan.template.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {/* Streak badge */}
              {streak.current > 0 && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  backgroundColor: "#F59E0B22", borderWidth: 1, borderColor: "#F59E0B55",
                  paddingHorizontal: 9, paddingVertical: 5,
                }}>
                  <Text style={{ fontSize: 13 }}>🔥</Text>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: "#F59E0B" }}>
                    {streak.current}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => setMenuVisible(true)}
                hitSlop={10}
                style={{ width: 40, height: 40, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Meso Progress ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Mesocycle Progress
              </Text>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: isDeload ? Colors.warning : Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                {mesoPhase}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 20 }}>
              {[1, 2, 3, 4].map((w) => (
                <View key={w} style={{ alignItems: "center", flex: 1 }}>
                  <View style={{
                    width: 40, height: 40, borderWidth: 1,
                    borderColor: w === mesoWeek ? Colors.primary : Colors.border,
                    backgroundColor: w < mesoWeek ? Colors.primary : w === mesoWeek ? Colors.bgAccent : Colors.bg,
                    justifyContent: "center", alignItems: "center",
                  }}>
                    {w < mesoWeek
                      ? <Ionicons name="checkmark" size={18} color={Colors.text} />
                      : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: w === mesoWeek ? Colors.primary : Colors.textMuted }}>{w}</Text>
                    }
                  </View>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {w === 4 ? "DL" : `W${w}`}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 12 }}>
                <View style={{ marginBottom: 4 }}>
                  <GlossaryTerm
                    text="Target RIR"
                    termKey="RIR"
                    style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}
                  />
                </View>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text }}>
                  {isDeload ? "--" : rirTarget}
                </Text>
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 12 }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Week</Text>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text }}>{plan.currentWeek}</Text>
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 12 }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Sessions</Text>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text }}>
                  {completedDays}
                  <Text style={{ fontSize: 14, color: Colors.textMuted }}>/{totalDays}</Text>
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Day Browser ── */}
        {plan.template.days.length > 0 && (
          <View style={{ marginTop: 16 }}>

            {/* Day tab pills */}
            <View style={{ flexDirection: "row", paddingHorizontal: 24, gap: 6, marginBottom: 10 }}>
              {plan.template.days.map((day, idx) => {
                const done = isDayCompleted(day.dayNumber);
                const isCurrent = idx === nextDayIndex;
                const isSelected = idx === selectedDayIdx;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => {
                      setSelectedDayIdx(idx);
                      dayScrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
                    }}
                    style={({ pressed }) => ({
                      flex: 1, alignItems: "center", paddingVertical: 9,
                      borderWidth: 1,
                      borderColor: isSelected ? Colors.primary : done ? Colors.primary + "55" : Colors.border,
                      backgroundColor: done ? Colors.primary + "15" : isSelected ? Colors.primary + "11" : Colors.bg,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    {done
                      ? <Ionicons name="checkmark" size={13} color={Colors.primary} />
                      : <Text style={{ fontFamily: isSelected ? "Rubik_700Bold" : "Rubik_500Medium", fontSize: 11, color: isSelected ? Colors.primary : Colors.textMuted }}>
                          D{day.dayNumber}
                        </Text>
                    }
                    {isCurrent && !done && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 3 }} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Week selector */}
            <View style={{ flexDirection: "row", paddingHorizontal: 24, gap: 6, marginBottom: 10 }}>
              {[1, 2, 3, 4].map((w) => {
                const absWeek = plan.currentWeek - mesoWeek + w;
                const mw = w;
                const isCurrentW = mw === mesoWeek;
                const isPast = mw < mesoWeek;
                const isSelected = previewWeek === absWeek;
                const phaseColor = mw === 4 ? Colors.warning : Colors.primary;
                const hasLogs = plan.logs.some(l => l.weekNumber === absWeek);
                return (
                  <Pressable
                    key={w}
                    onPress={() => setPreviewWeek(absWeek)}
                    style={({ pressed }) => ({
                      flex: 1, alignItems: "center", paddingVertical: 7,
                      borderWidth: 1,
                      borderColor: isSelected ? phaseColor : Colors.border,
                      backgroundColor: isSelected ? phaseColor + "15" : Colors.bg,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: isSelected ? "Rubik_700Bold" : "Rubik_400Regular", fontSize: 10, color: isSelected ? phaseColor : Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {w === 4 ? "DL" : `W${w}`}
                    </Text>
                    {!hasLogs && !isPast && !isCurrentW && (
                      <Text style={{ fontSize: 7, color: Colors.textMuted, marginTop: 1 }}>est</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Swipeable exercise list */}
            <ScrollView
              ref={dayScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setSelectedDayIdx(page);
              }}
            >
              {plan.template.days.map((day, dayIdx) => {
                const done = isDayCompleted(day.dayNumber);
                const isCurrent = dayIdx === nextDayIndex;
                const previewMesoWeek = mesoWeekOf(previewWeek);
                const previewRIR = PHASE_RIR[previewMesoWeek];
                const previewIsDeload = previewMesoWeek === 4;
                const weekDelta = previewWeek - plan.currentWeek;
                const logsForPreview = getLogsForDayWeek(day.dayNumber, previewWeek);
                const logsForCurrent = getLogsForDayWeek(day.dayNumber, plan.currentWeek);
                const hasPreviewLogs = logsForPreview.length > 0;

                return (
                  <View key={day.id} style={{ width: SCREEN_WIDTH, paddingHorizontal: 24 }}>
                    <View style={{
                      borderWidth: 1,
                      borderColor: done && previewWeek === plan.currentWeek ? Colors.primary + "55" : Colors.border,
                      padding: 16,
                    }}>
                      {/* Card header */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                          Day {day.dayNumber}
                          {previewWeek !== plan.currentWeek
                            ? ` · Week ${previewWeek}`
                            : ""}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {previewIsDeload && (
                            <View style={{ backgroundColor: Colors.warning + "22", paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + "44" }}>
                              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.warning, textTransform: "uppercase", letterSpacing: 1 }}>Deload</Text>
                            </View>
                          )}
                          {!hasPreviewLogs && previewWeek > plan.currentWeek && (
                            <View style={{ backgroundColor: Colors.bgAccent, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border }}>
                              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Estimated</Text>
                            </View>
                          )}
                          {isCurrent && !done && previewWeek === plan.currentWeek && (
                            <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 1 }}>Up Next</Text>
                            </View>
                          )}
                          {done && previewWeek === plan.currentWeek && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Exercise rows */}
                      {day.exercises.map((te, eIdx) => {
                        // Prefer logs for the selected preview week, fall back to current week logs, then template
                        const logEntry = logsForPreview.find(l => l.exerciseId === te.exercise.id)
                          ?? logsForCurrent.find(l => l.exerciseId === te.exercise.id);
                        const isBodyweight = te.exercise.equipment === "BODYWEIGHT";

                        let targetSets = 3;
                        let targetWeight = 0;
                        let targetRIRStr = `${previewRIR} RIR`;

                        if (logEntry) {
                          targetSets = logEntry.targetSets;
                          if (hasPreviewLogs || previewWeek === plan.currentWeek) {
                            targetWeight = logEntry.targetWeight;
                            targetRIRStr = logEntry.targetRIR;
                          } else {
                            // Estimated future week — project from current log
                            targetWeight = projectWeight(logEntry.targetWeight, weekDelta);
                            targetRIRStr = `${previewRIR} RIR`;
                          }
                        }

                        const isLastEx = eIdx === day.exercises.length - 1;
                        return (
                          <View
                            key={te.id}
                            style={{
                              flexDirection: "row", alignItems: "center",
                              paddingVertical: 9,
                              borderBottomWidth: isLastEx ? 0 : 1,
                              borderBottomColor: Colors.border,
                              gap: 10,
                            }}
                          >
                            <View style={{ width: 24, height: 24, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}>
                              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary }}>{eIdx + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.text }} numberOfLines={1}>
                                {te.exercise.name}
                              </Text>
                              {logEntry && !previewIsDeload && (
                                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                                  {targetSets} sets
                                  {!isBodyweight && targetWeight > 0 ? ` · ${targetWeight} ${unit}` : ""}
                                  {` · ${targetRIRStr}`}
                                </Text>
                              )}
                              {previewIsDeload && (
                                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.warning + "CC", marginTop: 2 }}>
                                  Reduced volume & intensity
                                </Text>
                              )}
                            </View>
                            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase" }}>
                              {te.exercise.equipment}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Weekly Progress bar ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
          <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Weekly Progress
              </Text>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text }}>
                {Math.round(progressPercent)}%
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: Colors.bgAccent, width: "100%" }}>
              <View style={{ height: 4, backgroundColor: Colors.primary, width: `${progressPercent}%` }} />
            </View>
          </View>
        </View>

        {/* ── Daily Steps ── */}
        {todaySteps !== null && (
          <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                setStepsInput(todaySteps.steps > 0 ? String(todaySteps.steps) : "");
                setStepsModalVisible(true);
              }}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: Colors.border, padding: 14,
                flexDirection: "row", alignItems: "center", gap: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ width: 36, height: 36, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, justifyContent: "center", alignItems: "center" }}>
                <Ionicons name="footsteps-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Steps Today
                  </Text>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted }}>
                    {todaySteps.steps.toLocaleString()} / {todaySteps.goal.toLocaleString()}
                  </Text>
                </View>
                <View style={{ height: 4, backgroundColor: Colors.bgAccent, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{
                    height: 4,
                    backgroundColor: todaySteps.steps >= todaySteps.goal ? Colors.success : Colors.primary,
                    width: `${Math.min((todaySteps.steps / todaySteps.goal) * 100, 100)}%`,
                  }} />
                </View>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        {/* ── CTA ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Pressable
            onPress={handleStartWorkout}
            style={({ pressed }) => ({
              backgroundColor: isDeload ? Colors.warning : Colors.primary,
              paddingVertical: 22,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12 }}>
              <Ionicons name="flash" size={24} color={Colors.text} />
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text, textTransform: "uppercase", letterSpacing: 3 }}>
                {isDeload ? "Start Deload" : "Start Workout"}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={handleSkipSession}
            disabled={skipping}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, marginTop: 10,
              opacity: pressed || skipping ? 0.5 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }}>
              <Ionicons name="play-skip-forward" size={16} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                {skipping ? "Skipping..." : "Skip Session"}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Steps Log Modal ── */}
      <Modal visible={stepsModalVisible} transparent animationType="slide" onRequestClose={() => setStepsModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, padding: 24, paddingBottom: 36 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Log Today's Steps
              </Text>
              <Pressable onPress={() => setStepsModalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginBottom: 16 }}>
              Goal: {todaySteps?.goal.toLocaleString() ?? 8000} steps per day. Apple Watch / Google Fit sync coming soon.
            </Text>
            <TextInput
              value={stepsInput}
              onChangeText={setStepsInput}
              keyboardType="number-pad"
              placeholder="e.g. 7500"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 28,
                color: Colors.text,
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.bg,
                paddingHorizontal: 16,
                paddingVertical: 12,
                textAlign: "center",
                marginBottom: 20,
              }}
            />
            <Pressable
              onPress={async () => {
                const steps = parseInt(stepsInput);
                if (isNaN(steps) || steps < 0) return;
                const uid = await AsyncStorage.getItem("userId");
                if (!uid) return;
                setSavingSteps(true);
                await updateDailySteps(uid, steps);
                const updated = await getTodaySteps(uid);
                const s = await getStreakInfo(uid);
                setTodaySteps(updated);
                setStreak(s);
                setSavingSteps(false);
                setStepsModalVisible(false);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              disabled={savingSteps}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed || savingSteps ? 0.75 : 1,
              })}
            >
              {savingSteps
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "#FFF", textTransform: "uppercase", letterSpacing: 2 }}>Save Steps</Text>
              }
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Menu modal ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          onPress={() => setMenuVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}
        >
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, paddingVertical: 8 }}>
            {[
              { icon: "swap-horizontal" as const, label: "Change Routine", sub: "Pick a different template or build your own", color: Colors.primary, onPress: handleChangeRoutine },
              { icon: "nutrition-outline" as const, label: "Nutrition Targets", sub: "View or edit your calorie & macro goals", color: Colors.primary, onPress: () => { setMenuVisible(false); router.push("/nutrition"); } },
              { icon: "scale-outline" as const, label: "Weigh-in Log", sub: "Log bodyweight and track trends", color: Colors.primary, onPress: () => { setMenuVisible(false); router.push("/(tabs)/progress"); } },
            ].map((item, i) => (
              <React.Fragment key={item.label}>
                <Pressable
                  onPress={item.onPress}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.7 : 1 })}
                >
                  <Ionicons name={item.icon} size={22} color={item.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>{item.label}</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{item.sub}</Text>
                  </View>
                </Pressable>
                <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 24 }} />
              </React.Fragment>
            ))}
            <Pressable
              onPress={() => {
                setMenuVisible(false);
                Alert.alert(
                  "Restart Setup",
                  "This will walk you through onboarding again. Your workout history is kept, but profile and nutrition data may be overwritten.\n\nYou can also change individual settings anytime in the Settings tab.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Continue", onPress: () => router.replace("/onboarding") },
                  ]
                );
              }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="refresh-outline" size={22} color={Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Restart Setup</Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Re-run onboarding · history is preserved</Text>
              </View>
            </Pressable>
            <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 24 }} />
            <Pressable
              onPress={() => setMenuVisible(false)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 16, opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

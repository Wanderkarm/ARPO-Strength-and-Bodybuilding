import React, { useCallback, useState, useRef, useEffect } from "react";
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
  KeyboardAvoidingView,
  Linking,
  AppState,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import GlossaryTerm from "@/components/GlossaryTerm";
import InfoTip from "@/components/InfoTip";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  getWorkoutPlan, skipSession,
  getStreakInfo, getTodaySteps, updateDailySteps,
  getCalendarData, getTrainingSchedule, hasEverSyncedFromHealthApp,
  type WorkoutPlan, type WorkoutLog, type StreakInfo, type DailyStepsEntry,
  type CalendarData, type CalendarDayData,
} from "@/lib/local-db";
import { syncFromHealth, silentDailySync, syncRecoveryMetrics, getCachedRecoveryMetrics, type RecoveryMetrics } from "@/lib/healthSync";
import { usePurchase, TRIAL_WORKOUTS } from "@/contexts/PurchaseContext";
import { getRecoveryHistory, computeBaseline, classifyRecovery, type RecoveryIntelligence } from "@/utils/recoveryBaseline";
import { refreshReminderIfNeeded } from "@/lib/notifications";
import DayDetailSheet from "@/components/DayDetailSheet";
import RecoveryGuideModal from "@/components/RecoveryGuideModal";
import { weekStartDate, weekEndDate, getOrderedDays, DAY_LETTERS } from "@/utils/weekStart";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<number, string> = {
  1: "ACCUMULATION",
  2: "INTENSIFICATION",
  3: "OVERREACH",
  4: "DELOAD",
};
// Maps meso week → GLOSSARY key for the InfoTip tooltip
const PHASE_GLOSSARY_KEY: Record<number, "Accumulation" | "Intensification" | "Overreach" | "Deload"> = {
  1: "Accumulation",
  2: "Intensification",
  3: "Overreach",
  4: "Deload",
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
  const { isPurchased, isTrialExpired, trialWorkoutsRemaining } = usePurchase();

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
  const [syncingSteps, setSyncingSteps] = useState(false);

  // Recovery metrics
  const [recovery, setRecovery] = useState<RecoveryMetrics | null>(null);
  const [syncingRecovery, setSyncingRecovery] = useState(false);
  const [recoveryIntelligence, setRecoveryIntelligence] = useState<RecoveryIntelligence | null>(null);
  const [recoveryGuideVisible, setRecoveryGuideVisible] = useState(false);

  // Body comp nudge
  const [bodyCompPromptDismissed, setBodyCompPromptDismissed] = useState(true); // start hidden, load below

  // Health permissions nudge (shown to users who predated the onboarding health step)
  const [healthNudgeDismissed, setHealthNudgeDismissed] = useState(true);

  // Calendar strip
  const [weekCalData, setWeekCalData] = useState<CalendarData>({});
  const [trainingDays, setTrainingDays] = useState<number[] | null>(null);
  const [stripSheetDate, setStripSheetDate] = useState<string | null>(null);
  const [stripSheetData, setStripSheetData] = useState<CalendarDayData | null>(null);

  // Collapsible sections
  const [mesoExpanded, setMesoExpanded] = useState(false);
  const [workoutExpanded, setWorkoutExpanded] = useState(false);

  const loadPlan = useCallback(async () => {
    const planId = await AsyncStorage.getItem("activePlanId");
    // Declare p outside the if-block so it's accessible for recovery intelligence below
    let p: WorkoutPlan | null = null;
    if (planId) {
      p = await getWorkoutPlan(planId);
      setPlan(p);
      if (p) {
        const idx = (p.currentDay || 1) - 1;
        setSelectedDayIdx(idx);
        setPreviewWeek(p.currentWeek);
        setTimeout(() => {
          dayScrollRef.current?.scrollTo({ x: idx * (SCREEN_WIDTH - 48), animated: false });
        }, 50);
      }
    }

    // Load streak + steps + recovery
    const uid = await AsyncStorage.getItem("userId");
    if (uid) {
      const [s, steps] = await Promise.all([
        getStreakInfo(uid),
        getTodaySteps(uid),
      ]);
      setStreak(s);
      setTodaySteps(steps);
    }
    // Capture current week from the locally-fetched plan (not stale state closure)
    const currentWeekForRecovery = p?.currentWeek ?? 1;
    getCachedRecoveryMetrics().then(async (cached) => {
      setRecovery(cached);
      if (cached) {
        const history = await getRecoveryHistory();
        const baseline = computeBaseline(history);
        setRecoveryIntelligence(classifyRecovery(cached, baseline, mesoWeekOf(currentWeekForRecovery)));
      }
    }).catch(() => {});

    // Body comp nudge
    AsyncStorage.getItem("bodyCompPromptDismissed").then((val) => {
      setBodyCompPromptDismissed(val === "1");
    }).catch(() => {});

    // Health permissions nudge — show only if they haven't gone through the health screen
    AsyncStorage.getItem("healthPermissionsRequested").then((val) => {
      setHealthNudgeDismissed(val === "1");
    }).catch(() => {});

    // Calendar strip — load current week data + training schedule
    if (uid) {
      const now = new Date();
      const start = weekStartDate(now);
      const end = weekEndDate(now);
      getCalendarData(uid, start, end).then(setWeekCalData).catch(() => {});
    }
    // Re-use the planId already fetched above (planId is in scope from loadPlan)
    if (planId) {
      getTrainingSchedule(planId).then(setTrainingDays).catch(() => {});
    }

    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    if (isTrialExpired) { router.replace("/paywall"); return; }
    loadPlan();
  }, [loadPlan, isTrialExpired]));

  // Silent background sync: refresh steps (and weight if not yet logged today)
  // whenever the app comes to the foreground.
  useEffect(() => {
    async function runSilentSync() {
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;
      const result = await silentDailySync(uid);
      if (result.stepsSynced) {
        const [updated, s] = await Promise.all([getTodaySteps(uid), getStreakInfo(uid)]);
        setTodaySteps(updated);
        setStreak(s);
      }
    }

    // Run once on mount
    runSilentSync();
    refreshReminderIfNeeded(); // replenish rotating notifications if running low

    // Re-run whenever the app returns to the foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runSilentSync();
    });
    return () => sub.remove();
  }, []);

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
              router.replace({ pathname: "/meso-complete", params: { planId: plan.id } });
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
            { icon: "scale-outline" as const, label: "Weigh-in Log", sub: "Log your bodyweight and track trends", route: "/body-weight-log" },
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

  // ── Recovery helpers ─────────────────────────────────────────────────────────
  function recoveryTile(value: number | undefined, thresholds: [number, number], invert = false): "good" | "fair" | "poor" {
    if (value === undefined) return "fair";
    const [lo, hi] = thresholds;
    if (invert) {
      // Lower is better (e.g. RHR)
      if (value <= lo) return "good";
      if (value <= hi) return "fair";
      return "poor";
    }
    // Higher is better (e.g. HRV, sleep)
    if (value >= hi) return "good";
    if (value >= lo) return "fair";
    return "poor";
  }

  const rhrStatus   = recoveryTile(recovery?.rhr,        [55, 75], true);   // ≤55 good, 55-75 fair, >75 poor
  const hrvStatus   = recoveryTile(recovery?.hrv,        [30, 60], false);  // ≥60 good, 30-60 fair, <30 poor
  const sleepStatus = recoveryTile(recovery?.sleepHours, [6,  7],  false);  // ≥7h good, 6-7h fair, <6h poor

  const statusOrder: Record<string, number> = { poor: 0, fair: 1, good: 2 };
  const hasRecovery = recovery !== null && (recovery.rhr !== undefined || recovery.hrv !== undefined || recovery.sleepHours !== undefined);
  const overallStatus: "good" | "fair" | "poor" = hasRecovery
    ? (["rhrStatus", "hrvStatus", "sleepStatus"] as const).reduce<"good" | "fair" | "poor">((worst, key) => {
        const s = key === "rhrStatus" ? rhrStatus : key === "hrvStatus" ? hrvStatus : sleepStatus;
        return statusOrder[s] < statusOrder[worst] ? s : worst;
      }, "good")
    : "fair";

  const STATUS_COLOR = { good: "#43A047", fair: "#F59E0B", poor: "#E53935" };
  const STATUS_LABEL = { good: "Good", fair: "Moderate", poor: "Low" };

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
  const todayComplete = isDayCompleted(plan.currentDay || 1);
  const todayExerciseCount = plan.template.days.find(d => d.dayNumber === (plan.currentDay || 1))?.exercises.length ?? 0;

  // ── Inline week strip data ────────────────────────────────────────────────
  const TODAY_STR = new Date().toISOString().slice(0, 10);
  const _weekStart = weekStartDate(new Date());
  const _orderedDays = getOrderedDays();
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(_weekStart + "T12:00:00");
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = _orderedDays[i];
    return {
      dateStr,
      dayLetter: DAY_LETTERS[dayOfWeek],
      dateNum: d.getDate(),
      dayOfWeek,
      isToday: dateStr === TODAY_STR,
      isPast: dateStr < TODAY_STR,
      workoutDone: weekCalData[dateStr]?.workoutDone ?? false,
      weighInDone: weekCalData[dateStr]?.weighInDone ?? false,
      stepsGoalHit: weekCalData[dateStr]?.stepsGoalHit ?? false,
      isScheduled: trainingDays?.includes(dayOfWeek) ?? false,
    };
  });

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
                POWR Hub
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                  {plan.template.name}
                </Text>
                <Pressable onPress={() => router.push("/my-plans")} hitSlop={8}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    MY PROGRAM →
                  </Text>
                </Pressable>
              </View>
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

        {/* ── Inline Week Strip ── */}
        <View style={{ flexDirection: "row", marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderTopColor: Colors.border, borderBottomColor: Colors.border }}>
          {weekDates.map(({ dateStr, dayLetter, dateNum, isToday, isPast, workoutDone, isScheduled }, idx) => (
            <Pressable
              key={dateStr}
              onPress={() => {
                if (isPast || isToday) {
                  setStripSheetDate(dateStr);
                  setStripSheetData(weekCalData[dateStr] ?? null);
                }
              }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                backgroundColor: workoutDone ? Colors.primary + "18" : "transparent",
                borderRightWidth: idx < 6 ? 1 : 0,
                borderRightColor: Colors.border,
                borderBottomWidth: 2,
                borderBottomColor: isToday ? Colors.primary : "transparent",
                opacity: pressed && (isPast || isToday) ? 0.7 : 1,
              })}
            >
              <Text style={{
                fontFamily: isToday ? "Rubik_700Bold" : "Rubik_400Regular",
                fontSize: 9,
                color: isToday ? Colors.text : Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                marginBottom: 5,
              }}>
                {dayLetter}
              </Text>
              {workoutDone ? (
                <View style={{ width: 26, height: 26, justifyContent: "center", alignItems: "center", backgroundColor: Colors.primary + "30", borderWidth: 1, borderColor: Colors.primary + "55" }}>
                  <Ionicons name="checkmark" size={13} color={Colors.primary} />
                </View>
              ) : (
                <View style={{
                  width: 26, height: 26, justifyContent: "center", alignItems: "center",
                  borderWidth: isToday ? 1 : 0,
                  borderColor: Colors.primary,
                  backgroundColor: isToday ? Colors.primary + "15" : "transparent",
                }}>
                  <Text style={{
                    fontFamily: isToday ? "Rubik_700Bold" : "Rubik_400Regular",
                    fontSize: 13,
                    color: isToday ? Colors.primary : Colors.textMuted,
                  }}>
                    {dateNum}
                  </Text>
                </View>
              )}
              {/* Dot for future scheduled training days */}
              <View style={{ height: 7, justifyContent: "center" }}>
                {isScheduled && !workoutDone && !isToday && (
                  <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.primary + "80" }} />
                )}
              </View>
            </Pressable>
          ))}
        </View>


        {/* Schedule prompt — only when no schedule set */}
        {(!trainingDays || trainingDays.length === 0) && (
          <Pressable
            onPress={() => {
              const planId = plan?.id;
              if (!planId) { router.push("/templates"); return; }
              router.push({
                pathname: "/schedule-picker",
                params: { planId, daysPerWeek: String(plan.template.days.length), destination: "tabs" },
              });
            }}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingVertical: 6, opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Set training schedule →
            </Text>
          </Pressable>
        )}

        {/* ── Hero Workout Card ── */}
        {plan.template.days.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            {/* Card border tints green when today is complete */}
            <View style={{ borderWidth: 1, borderColor: todayComplete ? Colors.primary + "55" : Colors.border }}>

              {/* ── Context tag: Week · Phase · Sessions (tappable → meso detail) ── */}
              <Pressable
                onPress={() => setMesoExpanded(v => !v)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: Colors.border,
                  opacity: pressed ? 0.8 : 1, gap: 6,
                })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: isDeload ? Colors.warning : Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                  Week {plan.currentWeek}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>·</Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {mesoPhase}
                </Text>
                <InfoTip term={PHASE_GLOSSARY_KEY[mesoWeek]} size={11} />
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
                  {completedDays}/{totalDays} sessions
                </Text>
                <Ionicons name={mesoExpanded ? "chevron-up" : "chevron-down"} size={12} color={Colors.textMuted} />
              </Pressable>

              {/* ── Collapsible meso detail ── */}
              {mesoExpanded && (
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                    {[1, 2, 3, 4].map((w) => (
                      <View key={w} style={{ alignItems: "center", flex: 1 }}>
                        <View style={{
                          width: 36, height: 36, borderWidth: 1,
                          borderColor: w === mesoWeek ? Colors.primary : Colors.border,
                          backgroundColor: w < mesoWeek ? Colors.primary : w === mesoWeek ? Colors.bgAccent : Colors.bg,
                          justifyContent: "center", alignItems: "center",
                        }}>
                          {w < mesoWeek
                            ? <Ionicons name="checkmark" size={16} color={Colors.text} />
                            : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: w === mesoWeek ? Colors.primary : Colors.textMuted }}>{w}</Text>
                          }
                        </View>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {w === 4 ? "DL" : `W${w}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 9 }}>
                      <GlossaryTerm
                        text="Target RIR"
                        termKey="RIR"
                        style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}
                      />
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text }}>
                        {isDeload ? "--" : rirTarget}
                      </Text>
                    </View>
                    <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 9 }}>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Week</Text>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text }}>{plan.currentWeek}</Text>
                    </View>
                    <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 9 }}>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Sessions</Text>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text }}>
                        {completedDays}<Text style={{ fontSize: 11, color: Colors.textMuted }}>/{totalDays}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Day header ── */}
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 17, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    Day {plan.currentDay}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                    {todayExerciseCount} exercise{todayExerciseCount !== 1 ? "s" : ""}
                    {isDeload ? "  ·  Deload" : ""}
                  </Text>
                </View>
                {todayComplete ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 8, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>Up Next</Text>
                  </View>
                )}
              </View>

              {/* ── Exercise list ── */}
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {plan.template.days[nextDayIndex]?.exercises.map((te, i) => {
                  const logsToday = getLogsForDayWeek(plan.currentDay || 1, plan.currentWeek);
                  const logEntry = logsToday.find(l => l.exerciseId === te.exercise.id);
                  const isBodyweight = te.exercise.equipment === "BODYWEIGHT";
                  const targetSets = logEntry?.targetSets ?? 3;
                  const targetWeight = logEntry?.targetWeight ?? 0;
                  const isLastEx = i === (plan.template.days[nextDayIndex]?.exercises.length ?? 0) - 1;
                  return (
                    <View key={te.id} style={{
                      flexDirection: "row", alignItems: "center",
                      paddingVertical: 10,
                      borderBottomWidth: isLastEx ? 0 : 1, borderBottomColor: Colors.border,
                      gap: 10,
                    }}>
                      <View style={{ width: 22, height: 22, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}>
                        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.primary }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.text }} numberOfLines={1}>
                          {te.exercise.name}
                        </Text>
                        {logEntry && !isDeload && (
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 1 }}>
                            {targetSets} sets{!isBodyweight && targetWeight > 0 ? ` · ${targetWeight} ${unit}` : ""}
                          </Text>
                        )}
                        {isDeload && (
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.warning + "BB", marginTop: 1 }}>
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

              {/* ── Recovery context strip ── */}
              {hasRecovery && !todayComplete && recoveryIntelligence && recoveryIntelligence.status !== "insufficient_data" && (
                <View style={{
                  flexDirection: "row", alignItems: "flex-start", gap: 8,
                  paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4,
                  borderTopWidth: (recoveryIntelligence.status === "fatigued" || recoveryIntelligence.status === "accumulating") ? 1 : 0,
                  borderTopColor: recoveryIntelligence.statusColor + "33",
                }}>
                  <View style={{ width: 4, borderRadius: 2, alignSelf: "stretch", backgroundColor: recoveryIntelligence.statusColor + "80", marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: recoveryIntelligence.statusColor, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 1 }}>
                      {recoveryIntelligence.statusLabel}
                      {recoveryIntelligence.overallDeviationPct !== undefined
                        ? `  ${recoveryIntelligence.overallDeviationPct >= 0 ? "+" : ""}${recoveryIntelligence.overallDeviationPct}% vs baseline`
                        : ""}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textSecondary, lineHeight: 14 }}>
                      {recoveryIntelligence.actionCopy}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Trial countdown banner ── */}
              {!isPurchased && trialWorkoutsRemaining > 0 && !todayComplete && (
                <Pressable
                  onPress={() => router.push("/paywall")}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 6,
                    paddingVertical: 7,
                    borderTopWidth: 1,
                    borderTopColor: trialWorkoutsRemaining === 1 ? "#F59E0B44" : Colors.border,
                    backgroundColor: trialWorkoutsRemaining === 1 ? "#F59E0B0A" : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name={trialWorkoutsRemaining === 1 ? "lock-closed-outline" : "information-circle-outline"}
                    size={11}
                    color={trialWorkoutsRemaining === 1 ? "#F59E0B" : Colors.textMuted}
                  />
                  <Text style={{
                    fontFamily: trialWorkoutsRemaining === 1 ? "Rubik_600SemiBold" : "Rubik_400Regular",
                    fontSize: 10,
                    color: trialWorkoutsRemaining === 1 ? "#F59E0B" : Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}>
                    {trialWorkoutsRemaining === 1
                      ? "Last free session — unlock to keep going"
                      : `${trialWorkoutsRemaining} of ${TRIAL_WORKOUTS} free sessions remaining · Unlock →`}
                  </Text>
                </Pressable>
              )}

              {/* ── CTA ── */}
              {todayComplete ? (
                <View style={{
                  borderTopWidth: 1, borderTopColor: Colors.primary + "44",
                  backgroundColor: Colors.primary + "0D",
                  paddingVertical: 18,
                  flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
                }}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  <View>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.primary, textTransform: "uppercase", letterSpacing: 2 }}>
                      Session Complete
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                      Next: Day {((plan.currentDay || 1) % totalDays) + 1}
                    </Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={handleStartWorkout}
                  style={({ pressed }) => ({
                    borderTopWidth: 1,
                    borderTopColor: isDeload ? Colors.warning : Colors.primary,
                    backgroundColor: isDeload ? Colors.warning : Colors.primary,
                    paddingVertical: 18,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 }}>
                    <Ionicons name="flash" size={20} color={Colors.text} />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 3 }}>
                      {isDeload ? "Start Deload" : "Start Workout"}
                    </Text>
                  </View>
                </Pressable>
              )}

              {/* Skip link */}
              {!todayComplete && (
                <Pressable
                  onPress={handleSkipSession}
                  disabled={skipping}
                  style={({ pressed }) => ({ alignItems: "center", paddingVertical: 10, opacity: pressed || skipping ? 0.4 : 1 })}
                >
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    {skipping ? "Skipping..." : "Skip Session"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* ── Browse full plan toggle ── */}
            <Pressable
              onPress={() => setWorkoutExpanded(v => !v)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center",
                paddingVertical: 10, gap: 4, opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                {workoutExpanded ? "Hide Plan Browser" : "Browse Full Plan"}
              </Text>
              <Ionicons name={workoutExpanded ? "chevron-up" : "chevron-down"} size={12} color={Colors.textMuted} />
            </Pressable>

            {/* ── Full plan browser (expanded) ── */}
            {workoutExpanded && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
                {/* Day tab pills */}
                <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingTop: 12, gap: 6, marginBottom: 10 }}>
                  {plan.template.days.map((day, idx) => {
                    const done = isDayCompleted(day.dayNumber);
                    const isCurrent = idx === nextDayIndex;
                    const isSelected = idx === selectedDayIdx;
                    return (
                      <Pressable
                        key={day.id}
                        onPress={() => {
                          setSelectedDayIdx(idx);
                          dayScrollRef.current?.scrollTo({ x: idx * (SCREEN_WIDTH - 48), animated: true });
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
                <View style={{ flexDirection: "row", paddingHorizontal: 14, gap: 6, marginBottom: 10 }}>
                  {[1, 2, 3, 4].map((w) => {
                    const absWeek = plan.currentWeek - mesoWeek + w;
                    const mw = w;
                    const isCurrentW = mw === mesoWeek;
                    const isPastW = mw < mesoWeek;
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
                        {!hasLogs && !isPastW && !isCurrentW && (
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
                    const page = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 48));
                    setSelectedDayIdx(page);
                  }}
                >
                  {plan.template.days.map((day, dayIdx) => {
                    const done = isDayCompleted(day.dayNumber);
                    const isCurrent = dayIdx === nextDayIndex;
                    const previewMesoWeek = mesoWeekOf(previewWeek);
                    const previewRIR = PHASE_RIR[previewMesoWeek];
                    const previewIsDeload = previewMesoWeek === 4;
                    const weekDeltaBrowse = previewWeek - plan.currentWeek;
                    const logsForPreview = getLogsForDayWeek(day.dayNumber, previewWeek);
                    const logsForCurrent = getLogsForDayWeek(day.dayNumber, plan.currentWeek);
                    const hasPreviewLogs = logsForPreview.length > 0;
                    return (
                      <View key={day.id} style={{ width: SCREEN_WIDTH - 48, paddingHorizontal: 14, paddingBottom: 14 }}>
                        <View style={{ borderWidth: 1, borderColor: done && previewWeek === plan.currentWeek ? Colors.primary + "55" : Colors.border, padding: 14 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                              Day {day.dayNumber}{previewWeek !== plan.currentWeek ? ` · Week ${previewWeek}` : ""}
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
                          {day.exercises.map((te, eIdx) => {
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
                                targetWeight = projectWeight(logEntry.targetWeight, weekDeltaBrowse);
                                targetRIRStr = `${previewRIR} RIR`;
                              }
                            }
                            const isLastEx = eIdx === day.exercises.length - 1;
                            return (
                              <View key={te.id} style={{
                                flexDirection: "row", alignItems: "center",
                                paddingVertical: 9,
                                borderBottomWidth: isLastEx ? 0 : 1, borderBottomColor: Colors.border,
                                gap: 10,
                              }}>
                                <View style={{ width: 24, height: 24, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}>
                                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary }}>{eIdx + 1}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.text }} numberOfLines={1}>
                                    {te.exercise.name}
                                  </Text>
                                  {logEntry && !previewIsDeload && (
                                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                                      {targetSets} sets{!isBodyweight && targetWeight > 0 ? ` · ${targetWeight} ${unit}` : ""}{` · ${targetRIRStr}`}
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
          </View>
        )}

        {/* ── Steps + Recovery Row ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 16, flexDirection: "row", gap: 8 }}>

          {/* Steps tile */}
          {todaySteps !== null && (
            <Pressable
              onPress={() => {
                setStepsInput(todaySteps.steps > 0 ? String(todaySteps.steps) : "");
                setStepsModalVisible(true);
              }}
              style={({ pressed }) => ({
                flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Ionicons name="footsteps-outline" size={13} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Steps
                  </Text>
                </View>
                {(todaySteps.source === "apple_health" || todaySteps.source === "google_fit") && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Ionicons
                      name={todaySteps.source === "apple_health" ? "heart-circle-outline" : "fitness-outline"}
                      size={9}
                      color={Colors.primary}
                    />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 8, color: Colors.primary }}>
                      {todaySteps.source === "apple_health" ? "Health" : "Fit"}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 26, color: Colors.text, marginBottom: 2 }}>
                {todaySteps.steps >= 1000
                  ? `${(todaySteps.steps / 1000).toFixed(1)}k`
                  : todaySteps.steps.toLocaleString()}
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 8 }}>
                / {(todaySteps.goal / 1000).toFixed(0)}k goal
              </Text>
              <View style={{ height: 3, backgroundColor: Colors.bgAccent }}>
                <View style={{
                  height: 3,
                  backgroundColor: todaySteps.steps >= todaySteps.goal ? Colors.success : Colors.primary,
                  width: `${Math.min((todaySteps.steps / todaySteps.goal) * 100, 100)}%`,
                }} />
              </View>
            </Pressable>
          )}

          {/* Recovery tile */}
          {(Platform.OS === "ios" || Platform.OS === "android") && (
            <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hasRecovery ? STATUS_COLOR[overallStatus] : Colors.textMuted }} />
                  <GlossaryTerm
                    text="Recovery"
                    termKey="Recovery"
                    style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}
                  />
                </View>
                <Pressable
                  onPress={async () => {
                    setSyncingRecovery(true);
                    const result = await syncRecoveryMetrics();
                    setRecovery(result);
                    // Recompute intelligence with updated history
                    const history = await getRecoveryHistory();
                    const baseline = computeBaseline(history);
                    setRecoveryIntelligence(classifyRecovery(result, baseline, mesoWeek));
                    setSyncingRecovery(false);
                    const gotData = result.rhr !== undefined || result.hrv !== undefined || result.sleepHours !== undefined;
                    if (Platform.OS !== "web") {
                      Haptics.notificationAsync(gotData ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
                    }
                    if (!gotData) {
                      const uid = await AsyncStorage.getItem("userId");
                      const hasTracker = uid ? await hasEverSyncedFromHealthApp(uid) : false;
                      if (hasTracker) {
                        const platform = Platform.OS === "ios" ? "Apple Health" : "Health Connect";
                        Alert.alert("No recovery data found", `No sleep, RHR, or HRV data was found in ${platform} for today. Make sure your wearable or fitness tracker has recently synced.`);
                      }
                    }
                  }}
                  disabled={syncingRecovery}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed || syncingRecovery ? 0.5 : 1 })}
                >
                  {syncingRecovery
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name={Platform.OS === "ios" ? "heart-circle-outline" : "fitness-outline"} size={13} color={Colors.primary} />
                  }
                </Pressable>
              </View>

              {hasRecovery ? (
                <>
                  {/* Status label + deviation badge */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{
                      fontFamily: "Rubik_700Bold", fontSize: 13,
                      color: recoveryIntelligence?.statusColor ?? STATUS_COLOR[overallStatus],
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      {recoveryIntelligence?.statusLabel ?? STATUS_LABEL[overallStatus]}
                    </Text>
                    {recoveryIntelligence?.hasBaseline && recoveryIntelligence.overallDeviationPct !== undefined && (
                      <View style={{
                        backgroundColor: (recoveryIntelligence.overallDeviationPct >= 0 ? "#43A047" : "#E53935") + "22",
                        borderWidth: 1,
                        borderColor: (recoveryIntelligence.overallDeviationPct >= 0 ? "#43A047" : "#E53935") + "55",
                        paddingHorizontal: 5, paddingVertical: 1,
                      }}>
                        <Text style={{
                          fontFamily: "Rubik_700Bold", fontSize: 9,
                          color: recoveryIntelligence.overallDeviationPct >= 0 ? "#43A047" : "#E53935",
                        }}>
                          {recoveryIntelligence.overallDeviationPct >= 0 ? "+" : ""}{recoveryIntelligence.overallDeviationPct}%
                        </Text>
                      </View>
                    )}
                    {recoveryIntelligence && !recoveryIntelligence.hasBaseline && (
                      <View style={{
                        backgroundColor: Colors.bgAccent,
                        borderWidth: 1, borderColor: Colors.border,
                        paddingHorizontal: 5, paddingVertical: 1,
                      }}>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted }}>
                          {recoveryIntelligence.snapshotCount}/3
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Absolute values row */}
                  <View style={{ gap: 5 }}>
                    {recovery?.sleepHours !== undefined && (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="moon-outline" size={10} color={STATUS_COLOR[sleepStatus]} />
                          <GlossaryTerm text="Sleep" termKey="Sleep" style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }} />
                        </View>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: STATUS_COLOR[sleepStatus] }}>{recovery.sleepHours}h</Text>
                      </View>
                    )}
                    {recovery?.rhr !== undefined && (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="heart-outline" size={10} color={STATUS_COLOR[rhrStatus]} />
                          <GlossaryTerm text="RHR" termKey="RHR" style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }} />
                        </View>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: STATUS_COLOR[rhrStatus] }}>{recovery.rhr} bpm</Text>
                      </View>
                    )}
                    {recovery?.hrv !== undefined && (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="pulse-outline" size={10} color={STATUS_COLOR[hrvStatus]} />
                          <GlossaryTerm text="HRV" termKey="HRV" style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }} />
                        </View>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: STATUS_COLOR[hrvStatus] }}>{recovery.hrv} ms</Text>
                      </View>
                    )}
                  </View>
                  {/* Learn More link */}
                  <Pressable
                    onPress={() => setRecoveryGuideVisible(true)}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 8 })}
                  >
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                      How is this calculated? →
                    </Text>
                  </Pressable>
                </>
              ) : (
                <View>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 8 }}>
                    Tap sync to pull sleep, RHR & HRV.
                  </Text>
                  <Pressable
                    onPress={() => {
                      // Android: open Health Connect via intent URI (not content:// which is invalid for Linking)
                      const url = Platform.OS === "ios"
                        ? "x-apple-health://"
                        : "market://details?id=com.google.android.apps.healthdata";
                      Linking.openURL(url).catch(() => {});
                    }}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                      Open {Platform.OS === "ios" ? "Health" : "Health Connect"} →
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Body Composition Nudge ── */}
        {!healthNudgeDismissed && (
          <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
            <View style={{
              borderWidth: 1, borderColor: Colors.border,
              borderLeftWidth: 3, borderLeftColor: "#e91e8c",
              backgroundColor: "#e91e8c08",
              padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10,
            }}>
              <Ionicons name="heart-outline" size={18} color="#e91e8c" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 4 }}>
                  Connect {Platform.OS === "ios" ? "Apple Health" : "Health Connect"}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  Auto-sync steps, body weight, sleep, RHR and HRV to power your Recovery score and activity tracking.
                </Text>
                <Pressable
                  onPress={() => router.push("/health-permissions" as any)}
                  style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: "#e91e8c", textTransform: "uppercase", letterSpacing: 1 }}>
                    Connect Now →
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={async () => {
                  await AsyncStorage.setItem("healthPermissionsRequested", "1");
                  setHealthNudgeDismissed(true);
                }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: 1 })}
              >
                <Ionicons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>
        )}

        {!bodyCompPromptDismissed && (
          <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
            <View style={{
              borderWidth: 1, borderColor: Colors.border,
              borderLeftWidth: 3, borderLeftColor: Colors.primary,
              backgroundColor: Colors.primary + "08",
              padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10,
            }}>
              <Ionicons name="body-outline" size={18} color={Colors.primary} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 4 }}>
                  Track Body Composition
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                  Log waist + neck measurements to unlock body fat % and FFMI tracking using the Navy formula.
                </Text>
                <Pressable
                  onPress={() => router.push("/(tabs)/body" as any)}
                  style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                    Log Measurements →
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={async () => {
                  await AsyncStorage.setItem("bodyCompPromptDismissed", "1");
                  setBodyCompPromptDismissed(true);
                }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: 1 })}
              >
                <Ionicons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Recovery Guide Modal ── */}
      <RecoveryGuideModal
        visible={recoveryGuideVisible}
        onClose={() => setRecoveryGuideVisible(false)}
      />

      {/* ── Calendar Strip Day Detail Sheet ── */}
      <DayDetailSheet
        visible={stripSheetDate !== null}
        dateStr={stripSheetDate}
        data={stripSheetData}
        weightUnit={unit}
        onClose={() => { setStripSheetDate(null); setStripSheetData(null); }}
      />

      {/* ── Steps Log Modal ── */}
      <Modal visible={stepsModalVisible} transparent animationType="slide" onRequestClose={() => setStepsModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setStepsModalVisible(false)} />
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
              Daily goal: {todaySteps?.goal.toLocaleString() ?? 8000} steps.
            </Text>

            {/* Apple Health (iOS) / Health Connect (Android) sync button */}
            {(Platform.OS === "ios" || Platform.OS === "android") && (
              <Pressable
                onPress={async () => {
                  const uid = await AsyncStorage.getItem("userId");
                  if (!uid) return;
                  setSyncingSteps(true);
                  const result = await syncFromHealth(uid);
                  setSyncingSteps(false);
                  if (result.stepsSynced && result.stepsCount != null) {
                    const updated = await getTodaySteps(uid);
                    const s = await getStreakInfo(uid);
                    setTodaySteps(updated);
                    setStreak(s);
                    setStepsModalVisible(false);
                    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } else {
                    Alert.alert("Sync failed", result.error ?? "No step data found in Health.");
                  }
                }}
                disabled={syncingSteps}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderWidth: 1,
                  borderColor: Colors.primary,
                  paddingVertical: 13,
                  marginBottom: 14,
                  opacity: pressed || syncingSteps ? 0.7 : 1,
                })}
              >
                {syncingSteps
                  ? <ActivityIndicator color={Colors.primary} size="small" />
                  : <>
                      <Ionicons
                        name={Platform.OS === "ios" ? "heart-circle-outline" : "fitness-outline"}
                        size={17}
                        color={Colors.primary}
                      />
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                        {Platform.OS === "ios" ? "Sync from Apple Health" : "Sync from Health Connect"}
                      </Text>
                    </>
                }
              </Pressable>
            )}

            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
              Or enter manually
            </Text>
            <TextInput
              value={stepsInput}
              onChangeText={setStepsInput}
              keyboardType="numeric"
              placeholder="e.g. 7500"
              placeholderTextColor={Colors.textMuted}
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
                marginBottom: 14,
              }}
            />
            <Pressable
              onPress={async () => {
                const steps = parseInt(stepsInput);
                if (isNaN(steps) || steps < 0) return;
                const uid = await AsyncStorage.getItem("userId");
                if (!uid) return;
                setSavingSteps(true);
                await updateDailySteps(uid, steps, "manual");
                const updated = await getTodaySteps(uid);
                const s = await getStreakInfo(uid);
                setTodaySteps(updated);
                setStreak(s);
                setSavingSteps(false);
                setStepsModalVisible(false);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              disabled={savingSteps || !stepsInput.trim()}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed || savingSteps || !stepsInput.trim() ? 0.65 : 1,
              })}
            >
              {savingSteps
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "#FFF", textTransform: "uppercase", letterSpacing: 2 }}>Save Steps</Text>
              }
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Menu modal ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          onPress={() => setMenuVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}
        >
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, paddingVertical: 8 }}>
            {[
              { icon: "albums-outline" as const, label: "My Program", sub: "Mesocycle details, phase guide & plan switching", color: Colors.primary, onPress: () => { setMenuVisible(false); router.push("/my-plans"); } },
              { icon: "swap-horizontal" as const, label: "Change Routine", sub: "Pick a different template or build your own", color: Colors.primary, onPress: handleChangeRoutine },
              { icon: "nutrition-outline" as const, label: "Nutrition Targets", sub: "View or edit your calorie & macro goals", color: Colors.primary, onPress: () => { setMenuVisible(false); router.push("/nutrition"); } },
              { icon: "scale-outline" as const, label: "Weigh-in Log", sub: "Log bodyweight and track trends", color: Colors.primary, onPress: () => { setMenuVisible(false); router.push("/body-weight-log"); } },
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

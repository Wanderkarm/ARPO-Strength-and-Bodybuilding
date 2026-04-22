import React, { useCallback, useState } from "react";
import {
  View, Text, Pressable, ScrollView, Platform,
  ActivityIndicator, Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  getUserPlanSummaries, abandonPlan, getPlanWeeklyProgress,
  type PlanSummary,
} from "@/lib/local-db";

const GOAL_LABEL: Record<string, string> = {
  strength: "Strength",
  powerbuilding: "Powerbuilding",
  hypertrophy: "Hypertrophy",
};

const PHASE_LABEL: Record<number, string> = {
  1: "Accumulation",
  2: "Intensification",
  3: "Overreach",
  4: "Deload",
};

const PHASE_RIR: Record<number, number | null> = { 1: 3, 2: 2, 3: 1, 4: null };

const PHASE_COLOR: Record<number, string> = {
  1: Colors.primary,
  2: Colors.primary,
  3: "#E53935",
  4: Colors.warning,
};

function mesoWeekOf(week: number) { return ((week - 1) % 4) + 1; }

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "Not started";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MyPlansScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [weeklyProgress, setWeeklyProgress] = useState<Record<string, Record<number, { completed: number; total: number }>>>({});
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    try {
      const uid = await AsyncStorage.getItem("userId");
      const pid = await AsyncStorage.getItem("activePlanId");
      setActivePlanId(pid);
      if (uid) {
        const summaries = await getUserPlanSummaries(uid);
        setPlans(summaries);
        setLoading(false);
        // Load weekly progress separately — never block showing the plans
        try {
          const progEntries = await Promise.all(
            summaries.map(async (p) => [p.id, await getPlanWeeklyProgress(p.id)] as const)
          );
          setWeeklyProgress(Object.fromEntries(progEntries));
        } catch (e) {
          console.warn("Weekly progress load failed:", e);
        }
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error("My Plans load error:", e);
      setLoading(false);
    }
  }

  async function handleSetActive(plan: PlanSummary) {
    setSwitching(plan.id);
    try {
      await AsyncStorage.setItem("activePlanId", plan.id);
      setActivePlanId(plan.id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } finally {
      setSwitching(null);
    }
  }

  function handleAbandon(plan: PlanSummary) {
    Alert.alert(
      "Abandon Plan",
      `Remove "${plan.templateName}" from your active plans? Your workout history is kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Abandon",
          style: "destructive",
          onPress: async () => {
            try {
              await abandonPlan(plan.id);
              if (plan.id === activePlanId) {
                await AsyncStorage.removeItem("activePlanId");
              }
              await load();
            } catch (err) {
              console.error(err);
            }
          },
        },
      ]
    );
  }

  // ── Active plan — full program view ─────────────────────────────────────────
  function ActivePlanCard({ plan }: { plan: PlanSummary }) {
    const mw = mesoWeekOf(plan.currentWeek);
    const prog = weeklyProgress[plan.id] ?? {};

    // Build the 4-meso-week grid anchored at the meso start of current week
    const mesoStartWeek = plan.currentWeek - mw + 1;
    const weeks = [1, 2, 3, 4].map((offset) => {
      const absWeek = mesoStartWeek + offset - 1;
      const p = prog[absWeek];
      const isCurrent = offset === mw;
      const isPast = offset < mw;
      const phase = PHASE_LABEL[offset];
      const phaseColor = PHASE_COLOR[offset];
      const rir = PHASE_RIR[offset];
      return { offset, absWeek, p, isCurrent, isPast, phase, phaseColor, rir };
    });

    // Volume progression bar: use completed sessions across the whole plan
    const allCompleted = Object.values(prog).reduce((s, v) => s + v.completed, 0);
    const totalPossible = Object.values(prog).reduce((s, v) => s + v.total, 0) || 1;

    return (
      <View style={{ borderWidth: 1, borderColor: Colors.primary, marginBottom: 16 }}>
        {/* Plan header */}
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5 }}>
                {plan.templateName}
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 3 }}>
                {GOAL_LABEL[plan.goalType] ?? plan.goalType} · {plan.gymType === "HOME" ? "Home" : "Gym"}
              </Text>
            </View>
            <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Active
              </Text>
            </View>
          </View>

          {/* Key stats row */}
          <View style={{ flexDirection: "row", gap: 20, marginTop: 14 }}>
            <View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Week
              </Text>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: Colors.text, marginTop: 1 }}>
                {plan.currentWeek}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Phase
              </Text>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: PHASE_COLOR[mw], marginTop: 1, textTransform: "uppercase" }}>
                {PHASE_LABEL[mw]}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Target RIR
              </Text>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: Colors.text, marginTop: 1 }}>
                {PHASE_RIR[mw] ?? "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Mesocycle Timeline ── */}
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
            Current Mesocycle
          </Text>

          {/* Week blocks */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
            {weeks.map(({ offset, absWeek, p, isCurrent, isPast, phase, phaseColor, rir }) => {
              const sessionsText = p ? `${p.completed}/${p.total}` : `0/${plan.totalDays}`;
              return (
                <View
                  key={offset}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: isCurrent ? phaseColor : isPast ? Colors.border : Colors.border,
                    backgroundColor: isCurrent ? phaseColor + "0F" : Colors.bg,
                    padding: 10,
                  }}
                >
                  {/* Week label */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: isCurrent ? phaseColor : isPast ? Colors.textMuted : Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {offset === 4 ? "DL" : `W${offset}`}
                    </Text>
                    {isPast && (
                      <Ionicons name="checkmark" size={11} color={Colors.primary} />
                    )}
                    {isCurrent && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: phaseColor }} />
                    )}
                  </View>

                  {/* Phase name */}
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 9, color: isCurrent ? phaseColor : Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }} numberOfLines={1}>
                    {phase}
                  </Text>

                  {/* Sessions pip bar */}
                  <View style={{ flexDirection: "row", gap: 2, marginBottom: 5 }}>
                    {Array.from({ length: p?.total ?? plan.totalDays }).map((_, i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1, height: 3,
                          backgroundColor: i < (p?.completed ?? 0)
                            ? (isPast ? Colors.primary + "88" : phaseColor)
                            : Colors.border,
                        }}
                      />
                    ))}
                  </View>

                  {/* Sessions + RIR */}
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 8, color: Colors.textMuted }}>
                    {sessionsText}{rir != null ? ` · ${rir} RIR` : ""}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Overall progress bar */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Plan Progress
              </Text>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted }}>
                {allCompleted} sessions · Day {plan.currentDay} of {plan.totalDays}
              </Text>
            </View>
            <View style={{ height: 3, backgroundColor: Colors.border }}>
              <View style={{
                height: 3, backgroundColor: Colors.primary,
                width: `${Math.min((allCompleted / totalPossible) * 100, 100)}%`,
              }} />
            </View>
          </View>
        </View>

        {/* ── Phase guide ── */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
            Phase Guide
          </Text>
          <View style={{ gap: 8 }}>
            {[1, 2, 3, 4].map((w) => (
              <View key={w} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 3, height: 32, backgroundColor: w === mw ? PHASE_COLOR[w] : Colors.border }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: w === mw ? PHASE_COLOR[w] : Colors.textMuted }}>
                    {w === 4 ? "Deload" : `Week ${w} — ${PHASE_LABEL[w]}`}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                    {w === 1 && "Higher volume, moderate intensity. Build work capacity."}
                    {w === 2 && "Volume tapers, weights climb. Push closer to failure."}
                    {w === 3 && "Peak effort. Max intensity, minimum RIR."}
                    {w === 4 && "Reduced volume & load. Let the adaptation set in."}
                  </Text>
                </View>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: w === mw ? PHASE_COLOR[w] : Colors.textMuted }}>
                  {PHASE_RIR[w] != null ? `${PHASE_RIR[w]} RIR` : "Deload"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Last session + Go to workout */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                Last: {formatRelativeDate(plan.lastSessionAt)}
              </Text>
            </View>
          </View>
          <View style={{ width: 1, height: "100%", backgroundColor: Colors.border }} />
          <Pressable
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => ({
              paddingVertical: 14, paddingHorizontal: 20, alignItems: "center",
              flexDirection: "row", gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="flash" size={14} color={Colors.primary} />
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Go to Workout
            </Text>
          </Pressable>
          <View style={{ width: 1, height: "100%", backgroundColor: Colors.border }} />
          <Pressable
            onPress={() => handleAbandon(plan)}
            style={({ pressed }) => ({
              paddingVertical: 14, paddingHorizontal: 16, alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Inactive plan — compact card ─────────────────────────────────────────────
  function InactivePlanCard({ plan }: { plan: PlanSummary }) {
    const mw = mesoWeekOf(plan.currentWeek);
    const prog = weeklyProgress[plan.id] ?? {};
    const allCompleted = Object.values(prog).reduce((s, v) => s + v.completed, 0);

    return (
      <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 10 }}>
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                {plan.templateName}
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                {GOAL_LABEL[plan.goalType] ?? plan.goalType} · {plan.gymType === "HOME" ? "Home" : "Gym"}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                Week {plan.currentWeek} · {PHASE_LABEL[mw]}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="checkmark-circle-outline" size={11} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                {allCompleted} sessions done
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                {formatRelativeDate(plan.lastSessionAt)}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border }}>
          <Pressable
            onPress={() => handleSetActive(plan)}
            disabled={switching === plan.id}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 11, alignItems: "center",
              opacity: pressed || switching === plan.id ? 0.7 : 1,
              flexDirection: "row", justifyContent: "center", gap: 6,
            })}
          >
            {switching === plan.id
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <>
                  <Ionicons name="swap-horizontal" size={13} color={Colors.primary} />
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    Switch to This
                  </Text>
                </>
            }
          </Pressable>
          <View style={{ width: 1, backgroundColor: Colors.border }} />
          <Pressable
            onPress={() => handleAbandon(plan)}
            style={({ pressed }) => ({
              paddingVertical: 11, paddingHorizontal: 16, alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  const activePlan = plans.find(p => p.id === activePlanId);
  const otherPlans = plans.filter(p => p.id !== activePlanId);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            My Program
          </Text>
        </View>
        <Pressable onPress={() => router.push("/templates")} hitSlop={12}>
          <Ionicons name="add" size={24} color={Colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : plans.length === 0 ? (
        <Pressable
          onPress={() => router.push("/templates")}
          style={({ pressed }) => ({ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginTop: 16 }}>
            No active plans.
          </Text>
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.primary, textAlign: "center", marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>
            Tap to start one →
          </Text>
        </Pressable>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>

          {/* Active plan — full program view */}
          {activePlan && <ActivePlanCard plan={activePlan} />}

          {/* Other plans */}
          {otherPlans.length > 0 && (
            <>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: activePlan ? 4 : 0 }}>
                Other Plans
              </Text>
              {otherPlans.map(p => <InactivePlanCard key={p.id} plan={p} />)}
            </>
          )}

          {/* Start new plan */}
          <Pressable
            onPress={() => router.push("/templates")}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
              paddingVertical: 18, alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 8,
              opacity: pressed ? 0.7 : 1, marginTop: 4,
            })}
          >
            <Ionicons name="add" size={18} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Start a New Plan
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

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
import { getUserPlanSummaries, abandonPlan, type PlanSummary } from "@/lib/local-db";

const GOAL_LABEL: Record<string, string> = {
  strength: "Strength",
  powerbuilding: "Powerbuilding",
  hypertrophy: "Hypertrophy",
};

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
        setPlans(await getUserPlanSummaries(uid));
      }
    } finally {
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
      `Remove "${plan.templateName}" from your active plans? Your workout history is kept but the plan will no longer appear here.`,
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

  const mesoWeek = (week: number) => ((week - 1) % 4) + 1;
  const mesoPhase = (week: number) => {
    const w = mesoWeek(week);
    return ["Accumulation", "Intensification", "Overreach", "Deload"][w - 1] ?? "";
  };

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
            My Plans
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
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginTop: 16 }}>
            No active plans. Tap + to start one.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginBottom: 4 }}>
            Switch between plans any time — your progress on each is saved exactly where you left off.
          </Text>

          {plans.map((plan) => {
            const isActive = plan.id === activePlanId;
            const mesoW = mesoWeek(plan.currentWeek);
            const phase = mesoPhase(plan.currentWeek);
            const progressPct = Math.min(mesoW / 4, 1);

            return (
              <View
                key={plan.id}
                style={{
                  borderWidth: 1,
                  borderColor: isActive ? Colors.primary : Colors.border,
                  backgroundColor: isActive ? Colors.primary + "08" : Colors.bg,
                }}
              >
                {/* Plan header */}
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                        {plan.templateName}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 3 }}>
                        {GOAL_LABEL[plan.goalType] ?? plan.goalType} · {plan.gymType === "HOME" ? "Home" : "Gym"}
                      </Text>
                    </View>
                    {isActive && (
                      <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5 }}>
                          Active
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Progress row */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <View style={{ flex: 1, height: 3, backgroundColor: Colors.border }}>
                      <View style={{ width: `${progressPct * 100}%`, height: 3, backgroundColor: isActive ? Colors.primary : Colors.textMuted }} />
                    </View>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, minWidth: 80, textAlign: "right" }}>
                      W{plan.currentWeek} · {phase}
                    </Text>
                  </View>

                  {/* Meta row */}
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                        Day {plan.currentDay} of {plan.totalDays}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                        Last: {formatRelativeDate(plan.lastSessionAt)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border }}>
                  {isActive ? (
                    <Pressable
                      onPress={() => router.replace("/(tabs)")}
                      style={({ pressed }) => ({
                        flex: 1, paddingVertical: 12, alignItems: "center",
                        opacity: pressed ? 0.7 : 1,
                        flexDirection: "row", justifyContent: "center", gap: 6,
                      })}
                    >
                      <Ionicons name="flash" size={14} color={Colors.primary} />
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                        Go to Workout
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => handleSetActive(plan)}
                      disabled={switching === plan.id}
                      style={({ pressed }) => ({
                        flex: 1, paddingVertical: 12, alignItems: "center",
                        opacity: pressed || switching === plan.id ? 0.7 : 1,
                        flexDirection: "row", justifyContent: "center", gap: 6,
                      })}
                    >
                      {switching === plan.id
                        ? <ActivityIndicator size="small" color={Colors.primary} />
                        : <>
                            <Ionicons name="swap-horizontal" size={14} color={Colors.primary} />
                            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                              Switch to This Plan
                            </Text>
                          </>
                      }
                    </Pressable>
                  )}

                  <View style={{ width: 1, backgroundColor: Colors.border }} />

                  <Pressable
                    onPress={() => handleAbandon(plan)}
                    style={({ pressed }) => ({
                      paddingVertical: 12, paddingHorizontal: 16, alignItems: "center",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            );
          })}

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

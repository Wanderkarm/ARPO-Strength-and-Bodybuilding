import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  Switch,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import GlossaryTerm from "@/components/GlossaryTerm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  scheduleWorkoutReminder,
  scheduleWeighInReminder,
  requestNotificationPermission,
  formatTime,
} from "@/lib/notifications";
import { getCompletedWorkoutHistory } from "@/lib/local-db";
import SessionEditSheet from "@/components/SessionEditSheet";
import { getCachedRecoveryMetrics } from "@/lib/healthSync";
import { getRecoveryHistory, computeBaseline, classifyRecovery, type RecoveryIntelligence } from "@/utils/recoveryBaseline";
import RecoveryGuideModal from "@/components/RecoveryGuideModal";

interface NextWeekTarget {
  exerciseId: string;
  weekNumber: number;
  targetSets: number;
  targetWeight: number;
  targetReps: number;
  targetRIR: string;
  exerciseName?: string;
  thisWeekWeight?: number;
  thisWeekSets?: number;
  thisWeekReps?: number;
  thisWeekRIR?: string;
}

interface PRResult {
  exerciseId: string;
  exerciseName: string;
  newBest: number;
  previousBest: number;
}

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { unit } = useUnit();

  const params = useLocalSearchParams<{
    planId: string;
    totalVolume: string;
    weekNumber: string;
    dayNumber: string;
    exerciseCount: string;
    nextWeekTargets: string;
    currentRIR: string;
    prs: string;
    completedAt: string;
  }>();

  const planId        = params.planId || "";
  const totalVolume   = parseFloat(params.totalVolume || "0");
  const weekNumber    = parseInt(params.weekNumber || "1");
  const dayNumber     = parseInt(params.dayNumber || "1");
  const exerciseCount = parseInt(params.exerciseCount || "0");
  const currentRIR    = params.currentRIR || "";
  const completedAt   = params.completedAt || new Date().toISOString();

  const mesoWeekSummary = ((weekNumber - 1) % 4) + 1;

  // ── Notifications prompt (shown after first ever workout) ──────────────────
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [workoutEnabled, setWorkoutEnabled] = useState(false);
  const [workoutHour, setWorkoutHour] = useState(8);
  const [workoutMinute, setWorkoutMinute] = useState(0);
  const [weighinEnabled, setWeighinEnabled] = useState(false);
  const [weighinHour, setWeighinHour] = useState(7);
  const [weighinMinute, setWeighinMinute] = useState(0);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showWeighinPicker, setShowWeighinPicker] = useState(false);
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [recoveryIntelligence, setRecoveryIntelligence] = useState<RecoveryIntelligence | null>(null);
  const [recoveryGuideVisible, setRecoveryGuideVisible] = useState(false);

  useEffect(() => {
    checkFirstWorkout();
    loadRecoveryIntelligence();
  }, []);

  async function loadRecoveryIntelligence() {
    try {
      const cached = await getCachedRecoveryMetrics();
      if (!cached) return;
      const history = await getRecoveryHistory();
      const baseline = computeBaseline(history);
      setRecoveryIntelligence(classifyRecovery(cached, baseline, mesoWeekSummary));
    } catch { /* silent */ }
  }

  async function checkFirstWorkout() {
    // Only show if notifications prompt hasn't been dismissed before
    const dismissed = await AsyncStorage.getItem("notifPromptDismissed");
    if (dismissed) return;
    // Check if this is the first completed workout (exactly 1 entry in history)
    try {
      const history = await getCompletedWorkoutHistory();
      const completedSessions = history.filter(h => !h.isSkipped);
      if (completedSessions.length === 1) {
        // Small delay so the summary screen renders first
        setTimeout(() => setShowNotifPrompt(true), 800);
      }
    } catch { /* silent */ }
  }

  async function handleSaveNotifs() {
    try {
      if (workoutEnabled) await scheduleWorkoutReminder(workoutHour, workoutMinute);
      if (weighinEnabled) await scheduleWeighInReminder(weighinHour, weighinMinute);
    } catch { /* silent */ }
    await AsyncStorage.setItem("notifPromptDismissed", "1");
    setShowNotifPrompt(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const workoutPickerDate = new Date();
  workoutPickerDate.setHours(workoutHour, workoutMinute, 0, 0);
  const weighinPickerDate = new Date();
  weighinPickerDate.setHours(weighinHour, weighinMinute, 0, 0);

  let nextWeekTargets: NextWeekTarget[] = [];
  try { nextWeekTargets = JSON.parse(params.nextWeekTargets || "[]"); } catch {}

  let prs: PRResult[] = [];
  try { prs = JSON.parse(params.prs || "[]"); } catch {}

  function formatVolume(vol: number): string {
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return String(Math.round(vol));
  }

  function handleReturnToDashboard() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace("/(tabs)");
  }

  function getWeightArrow(thisWeek: number | undefined, nextWeek: number): { symbol: string; color: string } {
    if (thisWeek === undefined) return { symbol: "→", color: Colors.textSecondary };
    if (nextWeek > thisWeek)   return { symbol: "↑", color: Colors.primary };
    if (nextWeek < thisWeek)   return { symbol: "↓", color: Colors.textSecondary };
    return { symbol: "→", color: Colors.textSecondary };
  }

  // ─── Stat card ────────────────────────────────────────────────────────────
  function StatCard({
    label, value, sub, valueColor,
  }: { label: string; value: string; sub: string; valueColor?: string }) {
    return (
      <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 10, alignItems: "center" }}>
        <Text style={{
          fontFamily: "Rubik_500Medium",
          fontSize: 9,
          color: Colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}>
          {label}
        </Text>
        <Text style={{
          fontFamily: "Rubik_700Bold",
          fontSize: 24,
          color: valueColor ?? Colors.text,
          lineHeight: 28,
        }}>
          {value}
        </Text>
        <Text style={{
          fontFamily: "Rubik_400Regular",
          fontSize: 9,
          color: Colors.textSecondary,
          marginTop: 3,
        }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, paddingBottom: bottomInset }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* ── Hero ── */}
        <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 24 }}>
          <View style={{
            width: 64, height: 64,
            backgroundColor: Colors.primary,
            justifyContent: "center", alignItems: "center",
            marginBottom: 20,
          }}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>

          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 28,
            color: "#FFFFFF",
            textTransform: "uppercase",
            letterSpacing: 1,
            textAlign: "center",
          }}>
            Workout Complete
          </Text>

          <Text style={{
            fontFamily: "Rubik_500Medium",
            fontSize: 13,
            color: Colors.textSecondary,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}>
            Week {weekNumber} — Day {dayNumber}
          </Text>

          <View style={{
            marginTop: 20,
            borderLeftWidth: 3, borderLeftColor: Colors.primary,
            paddingLeft: 14, paddingVertical: 4,
          }}>
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 13,
              color: "#CCCCCC",
              lineHeight: 20,
            }}>
              Session logged. Recover well — your next targets are ready.
            </Text>
          </View>
        </View>

        {/* ── Stat cards ── */}
        <View style={{ flexDirection: "row", paddingHorizontal: 24, marginTop: 28, gap: 6 }}>
          <StatCard
            label="Volume"
            value={formatVolume(totalVolume)}
            sub={`${unit} moved`}
            valueColor={Colors.primary}
          />
          <StatCard
            label="Exercises"
            value={String(exerciseCount)}
            sub="done"
          />
          <StatCard
            label="Week"
            value={String(weekNumber)}
            sub="of 4"
          />
          <StatCard
            label="RIR"
            value={currentRIR ? currentRIR.replace(" RIR", "") : "—"}
            sub="this wk"
          />
        </View>

        {/* ── PR celebration ── */}
        {prs.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 16 }}>🏆</Text>
              <Text style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 12,
                color: "#FFFFFF",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}>
                Personal Records
              </Text>
            </View>
            {prs.map((pr) => {
              const gain = pr.previousBest > 0
                ? ` (+${Math.round((pr.newBest - pr.previousBest) * 10) / 10} ${unit})`
                : " (first logged max)";
              return (
                <View key={pr.exerciseId} style={{
                  borderWidth: 1,
                  borderColor: "#FFD700" + "44",
                  borderLeftWidth: 3,
                  borderLeftColor: "#FFD700",
                  backgroundColor: "#FFD700" + "0A",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 13,
                      color: "#FFFFFF",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }} numberOfLines={1}>
                      {pr.exerciseName}
                    </Text>
                    <Text style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 11,
                      color: "#FFD700",
                      marginTop: 2,
                    }}>
                      {pr.newBest} {unit}{gain}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 20, marginLeft: 12 }}>🥇</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Recovery Intelligence feedback sandwich ── */}
        {recoveryIntelligence && Platform.OS !== "web" && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View style={{
              borderWidth: 1,
              borderColor: recoveryIntelligence.statusColor + "44",
              borderLeftWidth: 3,
              borderLeftColor: recoveryIntelligence.statusColor,
              backgroundColor: recoveryIntelligence.statusColor + "0A",
            }}>
              {/* Header */}
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
                borderBottomWidth: 1, borderBottomColor: recoveryIntelligence.statusColor + "22",
              }}>
                <Ionicons name="pulse-outline" size={14} color={recoveryIntelligence.statusColor} />
                <Text style={{
                  fontFamily: "Rubik_700Bold", fontSize: 10,
                  color: recoveryIntelligence.statusColor,
                  textTransform: "uppercase", letterSpacing: 1.5, flex: 1,
                }}>
                  Recovery Intelligence
                </Text>
                <View style={{
                  backgroundColor: recoveryIntelligence.statusColor + "22",
                  borderWidth: 1, borderColor: recoveryIntelligence.statusColor + "55",
                  paddingHorizontal: 7, paddingVertical: 2,
                  flexDirection: "row", alignItems: "center", gap: 4,
                }}>
                  <GlossaryTerm
                    text={recoveryIntelligence.statusLabel + (recoveryIntelligence.overallDeviationPct !== undefined ? `  ${recoveryIntelligence.overallDeviationPct >= 0 ? "+" : ""}${recoveryIntelligence.overallDeviationPct}%` : "")}
                    termKey={recoveryIntelligence.status === "primed" ? "Primed" : recoveryIntelligence.status === "fatigued" ? "Fatigued" : recoveryIntelligence.status === "accumulating" ? "Accumulating" : "Recovery"}
                    style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: recoveryIntelligence.statusColor, textTransform: "uppercase", letterSpacing: 0.8 }}
                  />
                </View>
              </View>

              {/* Trend — the data signal */}
              <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                <Text style={{
                  fontFamily: "Rubik_600SemiBold", fontSize: 12, color: "#FFFFFF", marginBottom: 3,
                }}>
                  {recoveryIntelligence.trendCopy}
                </Text>

                {/* Context — mesocycle framing */}
                <Text style={{
                  fontFamily: "Rubik_400Regular", fontSize: 11,
                  color: Colors.textSecondary, lineHeight: 16, marginBottom: 10,
                }}>
                  {recoveryIntelligence.contextCopy}
                </Text>
              </View>

              {/* Action — single prioritised recommendation + Learn More */}
              <View style={{
                borderTopWidth: 1, borderTopColor: recoveryIntelligence.statusColor + "22",
                flexDirection: "row", alignItems: "flex-start", gap: 8,
                paddingHorizontal: 14, paddingVertical: 10,
              }}>
                <Ionicons name="flash-outline" size={13} color={recoveryIntelligence.statusColor} style={{ marginTop: 1 }} />
                <Text style={{
                  fontFamily: "Rubik_500Medium", fontSize: 11,
                  color: Colors.textSecondary, lineHeight: 16, flex: 1,
                }}>
                  {recoveryIntelligence.actionCopy}
                </Text>
              </View>

              {/* Learn More footer */}
              <Pressable
                onPress={() => setRecoveryGuideVisible(true)}
                style={({ pressed }) => ({
                  borderTopWidth: 1, borderTopColor: recoveryIntelligence.statusColor + "22",
                  paddingHorizontal: 14, paddingVertical: 9,
                  flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{
                  fontFamily: "Rubik_500Medium", fontSize: 10,
                  color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1,
                }}>
                  How is this calculated?
                </Text>
                <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Next Week Preview ── */}
        {nextWeekTargets.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="trending-up" size={16} color={Colors.primary} />
                <Text style={{
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 12,
                  color: "#FFFFFF",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}>
                  Next Week Preview
                </Text>
              </View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 }}>
                sets × reps @ weight
              </Text>
            </View>

            {nextWeekTargets.map((target, i) => {
              const arrow = getWeightArrow(target.thisWeekWeight, target.targetWeight);
              const thisWeekStr = (
                target.thisWeekSets !== undefined &&
                target.thisWeekReps !== undefined &&
                target.thisWeekWeight !== undefined
              )
                ? `${target.thisWeekSets}×${target.thisWeekReps} @ ${target.thisWeekWeight} ${unit}`
                : "—";
              const nextWeekStr = `${target.targetSets}×${target.targetReps ?? "—"} @ ${target.targetWeight} ${unit}`;

              return (
                <View key={target.exerciseId} style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
                  {/* Exercise name header */}
                  <View style={{
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: Colors.border,
                    backgroundColor: Colors.bgAccent,
                  }}>
                    <Text style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 11,
                      color: "#FFFFFF",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }} numberOfLines={1}>
                      {target.exerciseName ?? `Exercise ${i + 1}`}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row" }}>
                    {/* This week */}
                    <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: Colors.border }}>
                      <Text style={{
                        fontFamily: "Rubik_500Medium",
                        fontSize: 9,
                        color: Colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 6,
                      }}>
                        This Week
                      </Text>
                      <Text style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 13,
                        color: "#FFFFFF",
                        marginBottom: 4,
                      }}>
                        {thisWeekStr}
                      </Text>
                      {target.thisWeekRIR ? (
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                          {target.thisWeekRIR}
                        </Text>
                      ) : null}
                    </View>

                    {/* Next week */}
                    <View style={{ flex: 1, padding: 12 }}>
                      <Text style={{
                        fontFamily: "Rubik_500Medium",
                        fontSize: 9,
                        color: Colors.textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 6,
                      }}>
                        Next Week →
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: "#FFFFFF" }}>
                          {nextWeekStr}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: arrow.color }}>
                          {arrow.symbol}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                        {target.targetRIR}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Actions ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 10 }}>
          <Pressable
            onPress={handleReturnToDashboard}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: 20,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 15,
              color: "#FFFFFF",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: 2,
            }}>
              Return to Dashboard
            </Text>
          </Pressable>

          {planId ? (
            <Pressable
              onPress={() => setEditSheetVisible(true)}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: Colors.border,
                paddingVertical: 14,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Edit Sets
              </Text>
            </Pressable>
          ) : null}
        </View>

      </ScrollView>

      {/* ── Recovery Guide Modal ── */}
      <RecoveryGuideModal
        visible={recoveryGuideVisible}
        onClose={() => setRecoveryGuideVisible(false)}
      />

      {/* ── Edit session sheet ── */}
      {planId ? (
        <SessionEditSheet
          visible={editSheetVisible}
          onClose={() => setEditSheetVisible(false)}
          onSaved={() => { /* stats on this screen are param-based; changes flow to next session */ }}
          planId={planId}
          weekNumber={weekNumber}
          dayNumber={dayNumber}
          completedAt={completedAt}
          unit={unit}
        />
      ) : null}

      {/* ── First-workout notifications prompt ── */}
      <Modal visible={showNotifPrompt} transparent animationType="slide" onRequestClose={() => { AsyncStorage.setItem("notifPromptDismissed", "1"); setShowNotifPrompt(false); }}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, padding: 24, paddingBottom: bottomInset + 24 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Stay Consistent
              </Text>
              <Pressable onPress={async () => { await AsyncStorage.setItem("notifPromptDismissed", "1"); setShowNotifPrompt(false); }} hitSlop={12}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 20 }}>
              Great first session. The athletes who make the best progress show up consistently — want POWRLOG to remind you?
            </Text>

            {/* Workout reminder toggle */}
            <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="barbell-outline" size={18} color={Colors.primary} />
                  <View>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Workout Reminder</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                      {workoutEnabled ? `Daily at ${formatTime(workoutHour, workoutMinute)}` : "Off"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={workoutEnabled}
                  onValueChange={async (val) => { if (val) { const g = await requestNotificationPermission(); if (g) setWorkoutEnabled(true); } else setWorkoutEnabled(false); }}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.text}
                />
              </View>
              {workoutEnabled && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                  <Pressable onPress={() => setShowWorkoutPicker(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + "11", paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.75 : 1 })}>
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.primary, flex: 1 }}>{formatTime(workoutHour, workoutMinute)}</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>Tap to change</Text>
                  </Pressable>
                  {Platform.OS === "android" && showWorkoutPicker && (
                    <DateTimePicker value={workoutPickerDate} mode="time" display="default" onChange={(_e: DateTimePickerEvent, d?: Date) => { setShowWorkoutPicker(false); if (d) { setWorkoutHour(d.getHours()); setWorkoutMinute(d.getMinutes()); } }} />
                  )}
                  {/* iOS time picker rendered as sibling Modal outside this sheet — see below */}
                </View>
              )}
            </View>

            {/* Weigh-in reminder toggle */}
            <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="scale-outline" size={18} color={Colors.primary} />
                  <View>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Weigh-in Reminder</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                      {weighinEnabled ? `Daily at ${formatTime(weighinHour, weighinMinute)}` : "Off"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={weighinEnabled}
                  onValueChange={async (val) => { if (val) { const g = await requestNotificationPermission(); if (g) setWeighinEnabled(true); } else setWeighinEnabled(false); }}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.text}
                />
              </View>
              {weighinEnabled && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                  <Pressable onPress={() => setShowWeighinPicker(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primary + "11", paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.75 : 1 })}>
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.primary, flex: 1 }}>{formatTime(weighinHour, weighinMinute)}</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>Tap to change</Text>
                  </Pressable>
                  {Platform.OS === "android" && showWeighinPicker && (
                    <DateTimePicker value={weighinPickerDate} mode="time" display="default" onChange={(_e: DateTimePickerEvent, d?: Date) => { setShowWeighinPicker(false); if (d) { setWeighinHour(d.getHours()); setWeighinMinute(d.getMinutes()); } }} />
                  )}
                  {/* iOS time picker rendered as sibling Modal outside this sheet — see below */}
                </View>
              )}
            </View>

            <Pressable onPress={handleSaveNotifs} style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 15, alignItems: "center", marginBottom: 10, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                {workoutEnabled || weighinEnabled ? "Set Reminders →" : "Continue →"}
              </Text>
            </Pressable>
            <Pressable onPress={async () => { await AsyncStorage.setItem("notifPromptDismissed", "1"); setShowNotifPrompt(false); }} style={({ pressed }) => ({ alignItems: "center", opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── iOS time pickers: rendered as siblings to avoid nested-Modal issues ── */}
      {Platform.OS === "ios" && showWorkoutPicker && (
        <Modal visible transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
            <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Pressable onPress={() => setShowWorkoutPicker(false)} hitSlop={12}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker value={workoutPickerDate} mode="time" display="spinner" textColor="#FFFFFF" onChange={(_e: DateTimePickerEvent, d?: Date) => { if (d) { setWorkoutHour(d.getHours()); setWorkoutMinute(d.getMinutes()); } }} style={{ height: 180 }} />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === "ios" && showWeighinPicker && (
        <Modal visible transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
            <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Pressable onPress={() => setShowWeighinPicker(false)} hitSlop={12}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker value={weighinPickerDate} mode="time" display="spinner" textColor="#FFFFFF" onChange={(_e: DateTimePickerEvent, d?: Date) => { if (d) { setWeighinHour(d.getHours()); setWeighinMinute(d.getMinutes()); } }} style={{ height: 180 }} />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

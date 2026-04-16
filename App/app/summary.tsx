import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";

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
    totalVolume: string;
    weekNumber: string;
    dayNumber: string;
    exerciseCount: string;
    nextWeekTargets: string;
    currentRIR: string;
    prs: string;
  }>();

  const totalVolume  = parseFloat(params.totalVolume || "0");
  const weekNumber   = parseInt(params.weekNumber || "1");
  const dayNumber    = parseInt(params.dayNumber || "1");
  const exerciseCount = parseInt(params.exerciseCount || "0");
  const currentRIR   = params.currentRIR || "";

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

        {/* ── Next Week Preview ── */}
        {nextWeekTargets.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
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

        {/* ── Return button ── */}
        <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
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
        </View>

      </ScrollView>
    </View>
  );
}

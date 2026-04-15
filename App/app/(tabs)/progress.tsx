import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import InfoTip from "@/components/InfoTip";
import { useUnit } from "@/contexts/UnitContext";
import {
  getProgressData,
  type ExerciseWeightHistory,
  type MuscleVolumeData,
} from "@/lib/local-db";
import { getVolumeLandmarks, GOAL_META, GLOSSARY, type GoalType } from "@/utils/volumeLandmarks";

// ─── Tiny line chart ────────────────────────────────────────────────────────

function WeightChart({
  data,
  unit,
}: {
  data: { weekNumber: number; maxWeight: number }[];
  unit: string;
}) {
  const W = 220;
  const H = 72;
  const PAD = { top: 8, right: 8, bottom: 20, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (data.length < 2) {
    return (
      <View style={{ width: W, height: H, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
          More data next week
        </Text>
      </View>
    );
  }

  const weeks = data.map((d) => d.weekNumber);
  const weights = data.map((d) => d.maxWeight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const wRange = maxW - minW || 1;
  const minWeek = Math.min(...weeks);
  const maxWeek = Math.max(...weeks) || minWeek + 1;
  const weekRange = maxWeek - minWeek || 1;

  const toX = (week: number) => PAD.left + ((week - minWeek) / weekRange) * chartW;
  const toY = (w: number) => PAD.top + chartH - ((w - minW) / wRange) * chartH;

  const pts = data.map((d) => `${toX(d.weekNumber)},${toY(d.maxWeight)}`).join(" ");

  return (
    <Svg width={W} height={H}>
      {/* Y gridline at max */}
      <Line x1={PAD.left} y1={PAD.top} x2={W - PAD.right} y2={PAD.top} stroke={Colors.border} strokeWidth={0.5} />
      {/* Y label top */}
      <SvgText
        x={PAD.left - 4}
        y={PAD.top + 4}
        fill={Colors.textMuted}
        fontSize={8}
        textAnchor="end"
        fontFamily="Rubik_400Regular"
      >
        {Math.round(maxW)}
      </SvgText>
      {/* Y label bottom */}
      <SvgText
        x={PAD.left - 4}
        y={H - PAD.bottom}
        fill={Colors.textMuted}
        fontSize={8}
        textAnchor="end"
        fontFamily="Rubik_400Regular"
      >
        {Math.round(minW)}
      </SvgText>
      {/* Line */}
      <Polyline points={pts} fill="none" stroke={Colors.primary} strokeWidth={1.5} />
      {/* Dots + x labels */}
      {data.map((d, i) => (
        <React.Fragment key={i}>
          <Circle
            cx={toX(d.weekNumber)}
            cy={toY(d.maxWeight)}
            r={3}
            fill={i === data.length - 1 ? Colors.primary : Colors.bgAccent}
            stroke={Colors.primary}
            strokeWidth={1.5}
          />
          <SvgText
            x={toX(d.weekNumber)}
            y={H - 4}
            fill={Colors.textMuted}
            fontSize={8}
            textAnchor="middle"
            fontFamily="Rubik_400Regular"
          >
            W{d.weekNumber}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

// ─── Volume bar ─────────────────────────────────────────────────────────────

function VolumeBar({
  sets,
  mev,
  mav,
  mrv,
}: {
  sets: number;
  mev: number;
  mav: [number, number];
  mrv: number;
}) {
  const BAR_W = 180;
  const BAR_H = 8;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const pct = clamp(sets / mrv, 0, 1.15);
  const fillW = Math.min(pct * BAR_W, BAR_W);

  let fillColor = Colors.textMuted; // below MEV
  if (sets >= mav[0] && sets <= mav[1]) fillColor = Colors.success;
  else if (sets >= mev && sets < mav[0]) fillColor = Colors.warning;
  else if (sets > mav[1] && sets <= mrv) fillColor = Colors.warning;
  else if (sets > mrv) fillColor = Colors.danger;

  const mevX = (mev / mrv) * BAR_W;
  const mavX0 = (mav[0] / mrv) * BAR_W;
  const mavX1 = Math.min((mav[1] / mrv) * BAR_W, BAR_W);

  return (
    <Svg width={BAR_W} height={BAR_H + 2}>
      {/* Background */}
      <Line x1={0} y1={BAR_H / 2 + 1} x2={BAR_W} y2={BAR_H / 2 + 1} stroke={Colors.border} strokeWidth={BAR_H} strokeLinecap="square" />
      {/* MAV zone (green tint) */}
      <Line x1={mavX0} y1={BAR_H / 2 + 1} x2={mavX1} y2={BAR_H / 2 + 1} stroke="#1a3a1a" strokeWidth={BAR_H} strokeLinecap="square" />
      {/* Fill */}
      <Line x1={0} y1={BAR_H / 2 + 1} x2={fillW} y2={BAR_H / 2 + 1} stroke={fillColor} strokeWidth={BAR_H} strokeLinecap="square" />
      {/* MEV tick */}
      <Line x1={mevX} y1={0} x2={mevX} y2={BAR_H + 2} stroke={Colors.textMuted} strokeWidth={1} />
    </Svg>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [loading, setLoading] = useState(true);
  const [noPlan, setNoPlan] = useState(false);
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseWeightHistory[]>([]);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeData[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [goalType, setGoalType] = useState<GoalType>("hypertrophy");
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) {
      setNoPlan(true);
      setLoading(false);
      return;
    }
    try {
      const data = await getProgressData(planId);
      setExerciseHistory(data.exerciseHistory);
      setMuscleVolume(data.muscleVolume);
      setCurrentWeek(data.currentWeek);
      setGoalType(data.goalType);
      setNoPlan(false);
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

  if (noPlan) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
        <Ionicons name="trending-up-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginTop: 16, textAlign: "center" }}>
          No Active Plan
        </Text>
        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
          Start a workout plan to see your progress charts here.
        </Text>
      </View>
    );
  }

  const mesoWeek = ((currentWeek - 1) % 4) + 1;
  const landmarks = getVolumeLandmarks(goalType);
  const goalMeta = GOAL_META.find(g => g.key === goalType)!;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 22,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 3,
          }}>
            Progress
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
              Week {currentWeek} · Meso Week {mesoWeek}
            </Text>
            <View style={{
              borderWidth: 1,
              borderColor: goalMeta.accentColor,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}>
              <Text style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 9,
                color: goalMeta.accentColor,
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}>
                {goalMeta.label}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Exercise Weight Charts ── */}
        {exerciseHistory.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="trending-up" size={16} color={Colors.primary} />
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Strength Progress
              </Text>
            </View>

            {exerciseHistory.map((ex) => {
              const isExpanded = expandedExercise === ex.exerciseId;
              const latest = ex.dataPoints[ex.dataPoints.length - 1];
              const first = ex.dataPoints[0];
              const gain = latest.maxWeight - first.maxWeight;

              return (
                <Pressable
                  key={ex.exerciseId}
                  onPress={() => setExpandedExercise(isExpanded ? null : ex.exerciseId)}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginBottom: 8,
                  }}
                >
                  {/* Row header */}
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 12,
                    paddingBottom: isExpanded ? 8 : 12,
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }} numberOfLines={1}>
                        {ex.exerciseName}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                        {ex.category}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", marginRight: 8 }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text }}>
                        {latest.maxWeight} {unit}
                      </Text>
                      {gain !== 0 && (
                        <Text style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 11,
                          color: gain > 0 ? Colors.success : Colors.danger,
                        }}>
                          {gain > 0 ? "+" : ""}{gain} {unit}
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={Colors.textMuted}
                    />
                  </View>

                  {/* Chart (expanded) */}
                  {isExpanded && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                      <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: 12 }} />
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <WeightChart data={ex.dataPoints} unit={unit} />
                      </ScrollView>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Volume Tracker (MEV/MAV/MRV) ── */}
        {muscleVolume.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Volume Tracker
              </Text>
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 10 }}>
              Ranges calibrated for <Text style={{ color: goalMeta.accentColor }}>{goalMeta.label}</Text> · {goalMeta.setsPerWeek} per muscle
            </Text>

            {/* Legend row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14, marginTop: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <InfoTip term="MEV" size={12} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>MEV</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <InfoTip term="MAV" size={12} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>MAV</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <InfoTip term="MRV" size={12} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>MRV</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 10, height: 4, backgroundColor: Colors.success }} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>In MAV</Text>
              </View>
            </View>

            {muscleVolume.map((muscle) => {
              const ml = landmarks[muscle.category];
              if (!ml) return null;
              // shadow the outer `landmarks` for this muscle row
              const muscleLandmarks = ml;

              let statusLabel = "";
              let statusColor = Colors.textMuted;
              if (muscle.setsThisWeek === 0) {
                statusLabel = "Rest";
                statusColor = Colors.textMuted;
              } else if (muscle.setsThisWeek < muscleLandmarks.mev) {
                statusLabel = "Below MEV";
                statusColor = Colors.textMuted;
              } else if (muscle.setsThisWeek >= muscleLandmarks.mav[0] && muscle.setsThisWeek <= muscleLandmarks.mav[1]) {
                statusLabel = "In MAV ✓";
                statusColor = Colors.success;
              } else if (muscle.setsThisWeek > muscleLandmarks.mrv) {
                statusLabel = "Above MRV";
                statusColor = Colors.danger;
              } else if (muscle.setsThisWeek >= muscleLandmarks.mev && muscle.setsThisWeek < muscleLandmarks.mav[0]) {
                statusLabel = "Building";
                statusColor = Colors.warning;
              } else {
                statusLabel = "Near MRV";
                statusColor = Colors.warning;
              }

              return (
                <View
                  key={muscle.category}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginBottom: 8,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                      {muscleLandmarks.displayName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text }}>
                        {muscle.setsThisWeek}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>
                        / wk
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: statusColor }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  <VolumeBar
                    sets={muscle.setsThisWeek}
                    mev={muscleLandmarks.mev}
                    mav={muscleLandmarks.mav}
                    mrv={muscleLandmarks.mrv}
                  />

                  {/* MEV / MAV / MRV labels */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted }}>
                      MEV {muscleLandmarks.mev}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.success }}>
                      MAV {muscleLandmarks.mav[0]}–{muscleLandmarks.mav[1]}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.danger }}>
                      MRV {muscleLandmarks.mrv}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Glossary Cards ── */}
        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Ionicons name="library-outline" size={16} color={Colors.primary} />
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
              The Science
            </Text>
          </View>

          {(
            [
              { term: "MEV",       color: Colors.textMuted },
              { term: "MAV",       color: Colors.success },
              { term: "MRV",       color: Colors.danger },
              { term: "RIR",       color: Colors.primary },
              { term: "Pump",      color: Colors.warning },
              { term: "Mesocycle", color: Colors.text },
              { term: "Deload",    color: Colors.textSecondary },
            ] as { term: keyof typeof GLOSSARY; color: string }[]
          ).map(({ term, color }) => (
            <View key={term} style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderLeftWidth: 3,
              borderLeftColor: color,
              marginBottom: 8,
              padding: 12,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}>
              <InfoTip term={term} size={16} color={color} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  {term}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 17 }} numberOfLines={3}>
                  {GLOSSARY[term].explanation}
                </Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

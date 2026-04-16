import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  logBodyWeight,
  getBodyWeightHistory,
  deleteBodyWeightEntry,
  type BodyWeightEntry,
} from "@/lib/local-db";
import { kgToLbs, lbsToKg } from "@/utils/nutritionCalculator";

// ─── Bodyweight trend chart ───────────────────────────────────────────────────

function BodyWeightChart({ data, unit }: { data: BodyWeightEntry[]; unit: string }) {
  const W = 340;
  const H = 120;
  const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (data.length < 2) return null;

  const displayWeights = data.map(d => unit === "lbs" ? kgToLbs(d.weightKg) : d.weightKg);
  const minW = Math.min(...displayWeights);
  const maxW = Math.max(...displayWeights);
  const wRange = maxW - minW || 1;

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (w: number) => PAD.top + chartH - ((w - minW) / wRange) * chartH;

  const pts = displayWeights.map((w, i) => `${toX(i)},${toY(w)}`).join(" ");

  // 7-day rolling average
  const rolling: { x: number; y: number }[] = [];
  for (let i = 0; i < displayWeights.length; i++) {
    const window = displayWeights.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    rolling.push({ x: toX(i), y: toY(avg) });
  }
  const rollingPts = rolling.map(p => `${p.x},${p.y}`).join(" ");

  // X axis labels — show first, middle, last
  const labelIndices = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <Svg width={W} height={H}>
      {/* Grid */}
      <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke={Colors.border} strokeWidth={0.5} />
      <Line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke={Colors.border} strokeWidth={0.5} />
      {/* Y labels */}
      <SvgText x={PAD.left - 4} y={PAD.top + 4} fill={Colors.textMuted} fontSize={9} textAnchor="end" fontFamily="Rubik_400Regular">
        {Math.round(maxW)}
      </SvgText>
      <SvgText x={PAD.left - 4} y={H - PAD.bottom} fill={Colors.textMuted} fontSize={9} textAnchor="end" fontFamily="Rubik_400Regular">
        {Math.round(minW)}
      </SvgText>
      {/* Raw line (faint) */}
      <Polyline points={pts} fill="none" stroke={Colors.border} strokeWidth={1} />
      {/* Rolling average (bold) */}
      <Polyline points={rollingPts} fill="none" stroke={Colors.primary} strokeWidth={2} />
      {/* Dots for raw data */}
      {displayWeights.map((w, i) => (
        <Circle key={i} cx={toX(i)} cy={toY(w)} r={2.5} fill={Colors.bgAccent} stroke={Colors.textMuted} strokeWidth={0.8} />
      ))}
      {/* Latest dot */}
      <Circle
        cx={toX(displayWeights.length - 1)}
        cy={toY(displayWeights[displayWeights.length - 1])}
        r={4}
        fill={Colors.primary}
      />
      {/* X labels */}
      {labelIndices.map(i => {
        const date = new Date(data[i].loggedAt);
        const label = `${date.getMonth() + 1}/${date.getDate()}`;
        return (
          <SvgText key={i} x={toX(i)} y={H - 4} fill={Colors.textMuted} fontSize={8} textAnchor="middle" fontFamily="Rubik_400Regular">
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BodyWeightLogScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { unit } = useUnit();

  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<BodyWeightEntry[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const uid = await AsyncStorage.getItem("userId");
    setUserId(uid);
    if (uid) {
      const entries = await getBodyWeightHistory(uid, 90);
      setHistory(entries);
    }
    setLoading(false);
  }

  async function handleLog() {
    if (!userId) return;
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      const kg = unit === "lbs" ? lbsToKg(val) : val;
      await logBodyWeight(userId, kg);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWeightInput("");
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert("Delete Entry", "Remove this weigh-in?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteBodyWeightEntry(id);
          await load();
        },
      },
    ]);
  }

  const displayHistory = [...history].reverse(); // newest first for list

  // Stats
  const latest = history[history.length - 1];
  const oldest = history[0];
  const change = latest && oldest && history.length > 1
    ? (unit === "lbs" ? kgToLbs(latest.weightKg) - kgToLbs(oldest.weightKg) : latest.weightKg - oldest.weightKg)
    : null;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/body")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            Bodyweight Log
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

          {/* Chart */}
          {history.length >= 2 && (
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                  90-Day Trend
                </Text>
                {change !== null && (
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: change < 0 ? Colors.success : change > 0 ? Colors.warning : Colors.textMuted }}>
                    {change > 0 ? "+" : ""}{change.toFixed(1)} {unit}
                  </Text>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <BodyWeightChart data={history} unit={unit} />
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: Colors.primary }} />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted }}>7-day average</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 1, backgroundColor: Colors.border }} />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted }}>Daily</Text>
                </View>
              </View>
            </View>
          )}

          {/* Stats row */}
          {latest && (
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: "center" }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Latest</Text>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: Colors.text }}>
                  {unit === "lbs" ? kgToLbs(latest.weightKg).toFixed(1) : latest.weightKg.toFixed(1)}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>{unit}</Text>
              </View>
              {history.length > 1 && (
                <View style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                    {history.length} Entries
                  </Text>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 20, color: change !== null && change < 0 ? Colors.success : change !== null && change > 0 ? Colors.warning : Colors.text }}>
                    {change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(1)}` : "—"}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>{unit} total</Text>
                </View>
              )}
            </View>
          )}

          {/* Log entry */}
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
            Log Today's Weight
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
            <TextInput
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder={unit === "lbs" ? "e.g. 185.0" : "e.g. 84.0"}
              placeholderTextColor={Colors.textMuted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.bgAccent,
                paddingHorizontal: 14,
                paddingVertical: 14,
                fontFamily: "Rubik_700Bold",
                fontSize: 22,
                color: Colors.text,
                textAlign: "center",
              }}
            />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, alignSelf: "center", width: 30 }}>
              {unit}
            </Text>
            <Pressable
              onPress={handleLog}
              disabled={saving || !weightInput.trim()}
              style={({ pressed }) => ({
                backgroundColor: weightInput.trim() ? Colors.primary : Colors.bgAccent,
                paddingHorizontal: 20,
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {saving
                ? <ActivityIndicator color={Colors.text} size="small" />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: weightInput.trim() ? Colors.text : Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Log</Text>
              }
            </Pressable>
          </View>

          {/* History list */}
          {displayHistory.length > 0 && (
            <>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
                History
              </Text>
              <View style={{ borderWidth: 1, borderColor: Colors.border }}>
                {displayHistory.map((entry, i) => {
                  const date = new Date(entry.loggedAt);
                  const displayW = unit === "lbs" ? kgToLbs(entry.weightKg).toFixed(1) : entry.weightKg.toFixed(1);
                  return (
                    <View
                      key={entry.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 14,
                        borderTopWidth: i > 0 ? 1 : 0,
                        borderTopColor: Colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                          {displayW} {unit}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                          {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleDelete(entry.id)}
                        hitSlop={12}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {displayHistory.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 32 }}>
              <Ionicons name="scale-outline" size={48} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 12, textAlign: "center" }}>
                Log your first weigh-in above.{"\n"}The 7-day average filters out daily fluctuations.
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

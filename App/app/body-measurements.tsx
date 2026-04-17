import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  logBodyMeasurements,
  getBodyMeasurementHistory,
  type BodyMeasurement,
} from "@/lib/local-db";

// ─── Measurement fields config ────────────────────────────────────────────────

type MeasurementKey = "chestCm" | "waistCm" | "hipsCm" | "leftArmCm" | "rightArmCm" | "leftThighCm" | "neckCm";

const FIELDS: { key: MeasurementKey; label: string; icon: string }[] = [
  { key: "chestCm",      label: "Chest",       icon: "body-outline" },
  { key: "waistCm",      label: "Waist",       icon: "body-outline" },
  { key: "hipsCm",       label: "Hips",        icon: "body-outline" },
  { key: "leftArmCm",    label: "Left Arm",    icon: "barbell-outline" },
  { key: "rightArmCm",   label: "Right Arm",   icon: "barbell-outline" },
  { key: "leftThighCm",  label: "Left Thigh",  icon: "body-outline" },
  { key: "neckCm",       label: "Neck",        icon: "body-outline" },
];

// ─── Unit conversion helpers ──────────────────────────────────────────────────

function cmToIn(cm: number): string {
  const totalIn = cm / 2.54;
  return totalIn.toFixed(1);
}

function inToCm(inches: string): number | null {
  const val = parseFloat(inches);
  return isNaN(val) ? null : val * 2.54;
}

function displayMeasurement(cm: number | null, unit: string): string {
  if (cm === null) return "—";
  return unit === "lbs" ? `${cmToIn(cm)}"` : `${cm.toFixed(1)} cm`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BodyMeasurementsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Form state
  const [inputs, setInputs] = useState<Record<MeasurementKey, string>>({
    chestCm: "", waistCm: "", hipsCm: "",
    leftArmCm: "", rightArmCm: "", leftThighCm: "", neckCm: "",
  });
  const [notes, setNotes] = useState("");

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const uid = await AsyncStorage.getItem("userId");
    setUserId(uid);
    if (uid) {
      const entries = await getBodyMeasurementHistory(uid, 20);
      setHistory(entries);
      if (entries.length === 0) setShowForm(true);
    }
    setLoading(false);
  }

  function setInput(key: MeasurementKey, value: string) {
    setInputs(prev => ({ ...prev, [key]: value }));
  }

  function parseCm(key: MeasurementKey): number | null {
    const raw = inputs[key].trim();
    if (!raw) return null;
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return null;
    return unit === "lbs" ? (val * 2.54) : val;
  }

  async function handleSave() {
    if (!userId) return;
    const hasAnyValue = FIELDS.some(f => inputs[f.key].trim() !== "");
    if (!hasAnyValue) return;

    setSaving(true);
    try {
      await logBodyMeasurements(userId, {
        chestCm:     parseCm("chestCm"),
        waistCm:     parseCm("waistCm"),
        hipsCm:      parseCm("hipsCm"),
        leftArmCm:   parseCm("leftArmCm"),
        rightArmCm:  parseCm("rightArmCm"),
        leftThighCm: parseCm("leftThighCm"),
        neckCm:      parseCm("neckCm"),
        notes:       notes.trim() || null,
        bodyFatPct:  null,
        source:      "manual",
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInputs({ chestCm: "", waistCm: "", hipsCm: "", leftArmCm: "", rightArmCm: "", leftThighCm: "", neckCm: "" });
      setNotes("");
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // For each field, compute change vs previous entry
  function getChange(current: BodyMeasurement, previous: BodyMeasurement | undefined, key: MeasurementKey): string | null {
    const curr = current[key] as number | null;
    const prev = previous ? (previous[key] as number | null) : null;
    if (curr === null || prev === null) return null;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.05) return null;
    const displayDiff = unit === "lbs" ? (diff / 2.54) : diff;
    return `${diff > 0 ? "+" : ""}${displayDiff.toFixed(1)}${unit === "lbs" ? '"' : " cm"}`;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const measureUnit = unit === "lbs" ? "inches" : "cm";

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
            Body Measurements
          </Text>
        </View>
        <Pressable
          onPress={() => setShowForm(!showForm)}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name={showForm ? "chevron-up" : "add"} size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

          {/* Log form */}
          {showForm && (
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
                New Measurement ({measureUnit})
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {FIELDS.map(field => (
                  <View key={field.key} style={{ width: "47%" }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
                      {field.label}
                    </Text>
                    <TextInput
                      value={inputs[field.key]}
                      onChangeText={v => setInput(field.key, v)}
                      keyboardType="decimal-pad"
                      placeholder={unit === "lbs" ? "e.g. 14.5" : "e.g. 37"}
                      placeholderTextColor={Colors.textMuted}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        backgroundColor: Colors.bgAccent,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        fontFamily: "Rubik_600SemiBold",
                        fontSize: 16,
                        color: Colors.text,
                        textAlign: "center",
                      }}
                    />
                  </View>
                ))}
              </View>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={Colors.textMuted}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontFamily: "Rubik_400Regular",
                  fontSize: 13,
                  color: Colors.text,
                  marginTop: 10,
                  minHeight: 48,
                }}
              />

              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => ({
                  backgroundColor: Colors.primary,
                  marginTop: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                {saving
                  ? <ActivityIndicator color={Colors.text} />
                  : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                      Save Measurements
                    </Text>
                }
              </Pressable>
            </View>
          )}

          {/* History */}
          {history.length > 0 && (
            <>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
                History
              </Text>

              {history.map((entry, i) => {
                const isExpanded = expandedEntry === entry.id;
                const prev = history[i + 1]; // history is newest-first
                const date = new Date(entry.loggedAt);
                const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    style={({pressed}) => ({
                      borderWidth: 1,
                      borderColor: Colors.border,
                      marginBottom: 8,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    {/* Row header */}
                    <View style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>
                          {dateStr}
                        </Text>
                        {/* Quick summary: waist + chest + body fat */}
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 3 }}>
                          {[
                            entry.chestCm ? `Chest ${displayMeasurement(entry.chestCm, unit)}` : null,
                            entry.waistCm ? `Waist ${displayMeasurement(entry.waistCm, unit)}` : null,
                            (!entry.chestCm && !entry.waistCm && entry.bodyFatPct != null) ? `Body Fat ${entry.bodyFatPct}%` : null,
                          ].filter(Boolean).join(" · ") || "Tap to view"}
                        </Text>
                      </View>
                      {i === 0 && (
                        <View style={{ borderWidth: 1, borderColor: Colors.primary + "55", backgroundColor: Colors.primary + "11", paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
                          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Latest</Text>
                        </View>
                      )}
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={Colors.textMuted} />
                    </View>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, padding: 14 }}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                          {/* Body fat % — shown first if present */}
                          {entry.bodyFatPct != null && (
                            <View style={{ width: "47%", marginBottom: 4 }}>
                              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                                Body Fat
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text }}>
                                  {entry.bodyFatPct}%
                                </Text>
                                {prev?.bodyFatPct != null && Math.abs(entry.bodyFatPct - prev.bodyFatPct) >= 0.05 && (
                                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: entry.bodyFatPct > prev.bodyFatPct ? Colors.warning : Colors.success }}>
                                    {entry.bodyFatPct > prev.bodyFatPct ? "+" : ""}{(entry.bodyFatPct - prev.bodyFatPct).toFixed(1)}%
                                  </Text>
                                )}
                              </View>
                              {entry.source && entry.source !== "manual" && (
                                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 }}>
                                  via {entry.source === "apple_health" ? "Apple Health" : "Google Fit"}
                                </Text>
                              )}
                            </View>
                          )}
                          {FIELDS.map(field => {
                            const val = entry[field.key] as number | null;
                            if (val === null) return null;
                            const change = getChange(entry, prev, field.key);
                            return (
                              <View key={field.key} style={{ width: "47%", marginBottom: 4 }}>
                                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                                  {field.label}
                                </Text>
                                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text }}>
                                    {displayMeasurement(val, unit)}
                                  </Text>
                                  {change && (
                                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: change.startsWith("+") ? Colors.warning : Colors.success }}>
                                      {change}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                        {entry.notes && (
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 10, fontStyle: "italic" }}>
                            "{entry.notes}"
                          </Text>
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </>
          )}

          {history.length === 0 && !showForm && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Ionicons name="body-outline" size={48} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 12, textAlign: "center" }}>
                Track your measurements over time to see changes beyond the scale.
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

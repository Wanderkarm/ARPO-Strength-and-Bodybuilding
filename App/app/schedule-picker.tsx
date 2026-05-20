import React, { useState } from "react";
import { View, Text, Pressable, Platform, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { saveTrainingSchedule } from "@/lib/local-db";
import { getWeekStartDay, getOrderedDays, DAY_FULL } from "@/utils/weekStart";

/**
 * Schedule Picker — called after template creation.
 *
 * Params:
 *   planId:      string — the newly created plan ID
 *   daysPerWeek: string — how many workout days the template has (template.mesoType)
 *   destination: "post-onboarding" | "tabs" | "back"
 */
export default function SchedulePickerScreen() {
  const insets = useSafeAreaInsets();
  const { planId, daysPerWeek: daysParam, destination } = useLocalSearchParams<{
    planId: string;
    daysPerWeek: string;
    destination: string;
  }>();

  const daysPerWeek = parseInt(daysParam ?? "3", 10);
  // ≤4 workout days → pick training days; ≥5 → pick rest days
  const pickingRestDays = daysPerWeek >= 5;
  const requiredCount = pickingRestDays ? 7 - daysPerWeek : daysPerWeek;

  const orderedDays = getOrderedDays(); // day-of-week indices in locale order
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(dow: number) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) {
        next.delete(dow);
      } else {
        if (next.size < requiredCount) next.add(dow);
      }
      return next;
    });
  }

  function navigate() {
    if (destination === "post-onboarding") router.replace("/post-onboarding");
    else if (destination === "back") router.back();
    else router.replace("/(tabs)");
  }

  /** Generates a default evenly-spread training schedule when the user skips picking days */
  function defaultTrainingDays(count: number): number[] {
    // Spread evenly Mon-Sun (DOW 1-7, where 0 = Sun). Prefer weekdays first.
    const candidates = [1, 3, 5, 2, 4, 6, 0]; // Mon,Wed,Fri,Tue,Thu,Sat,Sun
    return candidates.slice(0, count);
  }

  async function handleSkip() {
    if (!planId) { navigate(); return; }
    setSaving(true);
    try {
      const trainingDays = pickingRestDays
        ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !defaultTrainingDays(daysPerWeek).includes(d))
        : defaultTrainingDays(daysPerWeek);
      await saveTrainingSchedule(planId, trainingDays);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      navigate();
    }
  }

  async function handleSave() {
    if (selected.size !== requiredCount) return;
    if (!planId) { navigate(); return; }
    setSaving(true);
    try {
      // If picking rest days, training days = all 7 minus selected rest days
      const trainingDays = pickingRestDays
        ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !selected.has(d))
        : [...selected];
      await saveTrainingSchedule(planId, trainingDays);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      navigate();
    }
  }

  // Preview: show what the other side will be
  const trainingPreview = pickingRestDays
    ? orderedDays.filter((d) => !selected.has(d))
    : [...selected].sort();
  const restPreview = pickingRestDays
    ? [...selected].sort()
    : orderedDays.filter((d) => !selected.has(d));

  const selectionComplete = selected.size === requiredCount;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: Platform.OS === "web" ? 67 : insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ paddingTop: 24, paddingBottom: 28 }}>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
            Almost done
          </Text>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            {pickingRestDays ? "Choose Rest Days" : "Choose Training Days"}
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20 }}>
            {pickingRestDays
              ? `Select ${requiredCount} rest day${requiredCount !== 1 ? "s" : ""}. Your remaining ${daysPerWeek} days will be your training days.`
              : `Select ${requiredCount} day${requiredCount !== 1 ? "s" : ""} when you plan to train each week.`
            }
          </Text>
        </View>

        {/* Selection counter */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>
            {pickingRestDays ? "Rest days" : "Training days"}
          </Text>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: selectionComplete ? Colors.success : Colors.primary }}>
            {selected.size} / {requiredCount}
          </Text>
        </View>

        {/* Day buttons */}
        <View style={{ gap: 8, marginBottom: 28 }}>
          {orderedDays.map((dow) => {
            const isSelected = selected.has(dow);
            const isDisabled = !isSelected && selected.size >= requiredCount;
            return (
              <Pressable
                key={dow}
                onPress={() => !isDisabled && toggle(dow)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: isSelected ? Colors.primary : Colors.border,
                  backgroundColor: isSelected ? Colors.primary + "14" : Colors.bg,
                  opacity: pressed ? 0.8 : isDisabled ? 0.35 : 1,
                })}
              >
                <Text style={{
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 14,
                  color: isSelected ? Colors.text : Colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}>
                  {DAY_FULL[dow]}
                </Text>
                {isSelected && (
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text }}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Preview — shows the "other side" */}
        {selected.size > 0 && (
          <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.primary, padding: 14, marginBottom: 28 }}>
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
              Schedule preview
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Train</Text>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text }}>
                  {trainingPreview.length > 0 ? trainingPreview.map((d) => DAY_FULL[d].slice(0, 3)).join(", ") : "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Rest</Text>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textSecondary }}>
                  {restPreview.length > 0 ? restPreview.map((d) => DAY_FULL[d].slice(0, 3)).join(", ") : "—"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={!selectionComplete || saving}
          style={({ pressed }) => ({
            backgroundColor: selectionComplete ? Colors.primary : Colors.bgAccent,
            paddingVertical: 20,
            alignItems: "center",
            marginBottom: 12,
            opacity: pressed || saving ? 0.8 : 1,
          })}
        >
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 14,
            color: selectionComplete ? Colors.text : Colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}>
            {saving ? "Saving..." : "Set Schedule"}
          </Text>
        </Pressable>

        {/* Skip */}
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignItems: "center", paddingVertical: 10 })}
        >
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Skip for now
          </Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

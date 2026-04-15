import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  getAllExercises,
  createCustomTemplate,
  type Exercise,
  type GymType,
} from "@/lib/local-db";
import {
  autoGenerateTemplate,
  getDefaultPriorities,
  MUSCLE_GROUPS,
  type Priority,
  type MusclePriorities,
  type GeneratedDay,
} from "@/utils/autoGenerateTemplate";

const DAYS_OPTIONS = [3, 4, 5, 6];

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: "skip",     label: "Skip",     color: Colors.textMuted },
  { value: "maintain", label: "Maintain", color: Colors.textSecondary },
  { value: "medium",   label: "Medium",   color: Colors.primary },
  { value: "high",     label: "High",     color: "#E53935" },
];

export default function AutoBuilderScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [routineName, setRoutineName] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [priorities, setPriorities] = useState<MusclePriorities>(getDefaultPriorities());
  const [generatedDays, setGeneratedDays] = useState<GeneratedDay[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [gymType, setGymType] = useState<GymType>("GYM");
  const [saving, setSaving] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  useEffect(() => {
    getAllExercises().then(setAllExercises);
    AsyncStorage.getItem("gymType").then((v) => {
      if (v === "HOME" || v === "GYM") setGymType(v);
    });
  }, []);

  function handlePriorityChange(muscleKey: string, priority: Priority) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPriorities((prev) => ({ ...prev, [muscleKey]: priority }));
  }

  function handleGenerate() {
    if (!allExercises.length) return;
    const days = autoGenerateTemplate(daysPerWeek, priorities, allExercises, gymType);
    setGeneratedDays(days);
    setExpandedDay(0);
    setStep(3);
  }

  function handleRegenerate() {
    if (!allExercises.length) return;
    const days = autoGenerateTemplate(daysPerWeek, priorities, allExercises, gymType);
    setGeneratedDays(days);
    setExpandedDay(0);
  }

  async function handleSave() {
    if (!routineName.trim() || !generatedDays.length) return;
    setSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;
      await createCustomTemplate(
        uid,
        routineName.trim(),
        generatedDays.map((d) => ({
          dayNumber: d.dayNumber,
          exerciseIds: d.exerciseIds,
        }))
      );
      router.replace("/templates");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (step === 1) {
      router.canGoBack() ? router.back() : router.replace("/templates");
    } else if (step === 2) {
      setStep(1);
    } else {
      setStep(2);
    }
  }

  const stepLabels = ["Basics", "Muscle Focus", "Preview"];

  // ── Exercise lookup helper ─────────────────────────────────────────────────
  function getExerciseById(id: string): Exercise | undefined {
    return allExercises.find((e) => e.id === id);
  }

  // ─────────────────────────────────────────────────────────────────────────
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
        <Pressable onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 13,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}>
            Generate Routine
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Step indicator */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 6 }}>
        {stepLabels.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <View key={label} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{
                height: 2,
                width: "100%",
                backgroundColor: isActive || isDone ? Colors.primary : Colors.border,
              }} />
              <Text style={{
                fontFamily: isActive ? "Rubik_600SemiBold" : "Rubik_400Regular",
                fontSize: 9,
                color: isActive ? Colors.primary : isDone ? Colors.textSecondary : Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Step 1: Name + Days ── */}
      {step === 1 && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 24 }}>
              ARPO will build a science-based programme around your muscle priorities using MEV/MAV volume targets.
            </Text>

            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Routine Name
            </Text>
            <TextInput
              value={routineName}
              onChangeText={setRoutineName}
              placeholder="e.g. MY PPL PROGRAMME"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 15,
                color: Colors.text,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingHorizontal: 14,
                paddingVertical: 14,
                backgroundColor: Colors.bgAccent,
                marginBottom: 28,
              }}
            />

            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
              Training Days Per Week
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {DAYS_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDaysPerWeek(d);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderWidth: 1,
                    borderColor: daysPerWeek === d ? Colors.primary : Colors.border,
                    backgroundColor: daysPerWeek === d ? Colors.primary + "22" : Colors.bg,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 22,
                    color: daysPerWeek === d ? Colors.primary : Colors.textMuted,
                  }}>
                    {d}
                  </Text>
                  <Text style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 9,
                    color: daysPerWeek === d ? Colors.primary : Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginTop: 2,
                  }}>
                    {d === 3 ? "Full Body" : d === 4 ? "Upper/Lower" : d === 5 ? "PPL+2" : "PPL×2"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
              {daysPerWeek === 3 && "Three balanced full-body sessions. Best for beginners or busy schedules."}
              {daysPerWeek === 4 && "Two upper and two lower days. High frequency, good recovery balance."}
              {daysPerWeek === 5 && "Push / Pull / Legs with two extra upper/lower days for added volume."}
              {daysPerWeek === 6 && "Push / Pull / Legs twice per week. Maximum frequency for advanced lifters."}
            </Text>
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={() => routineName.trim() && setStep(2)}
              disabled={!routineName.trim()}
              style={({ pressed }) => ({
                backgroundColor: routineName.trim() ? Colors.primary : Colors.bgAccent,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 14,
                color: routineName.trim() ? Colors.text : Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}>
                Set Muscle Focus →
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── Step 2: Muscle Priorities ── */}
      {step === 2 && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 20 }}>
              Set the priority for each muscle group. <Text style={{ color: Colors.text, fontFamily: "Rubik_500Medium" }}>High</Text> = train near MRV for maximum growth. <Text style={{ color: Colors.text, fontFamily: "Rubik_500Medium" }}>Maintain</Text> = MEV only. <Text style={{ color: Colors.text, fontFamily: "Rubik_500Medium" }}>Skip</Text> = omit entirely.
            </Text>

            {/* Priority legend */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 20 }}>
              {PRIORITY_OPTIONS.map((opt) => (
                <View
                  key={opt.value}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: opt.color,
                    paddingVertical: 6,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: opt.color, textTransform: "uppercase", letterSpacing: 1 }}>
                    {opt.label}
                  </Text>
                </View>
              ))}
            </View>

            {MUSCLE_GROUPS.map((group) => {
              const current = priorities[group.key] ?? group.defaultPriority;
              return (
                <View
                  key={group.key}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginBottom: 8,
                    padding: 12,
                  }}
                >
                  <Text style={{
                    fontFamily: "Rubik_600SemiBold",
                    fontSize: 12,
                    color: Colors.text,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}>
                    {group.label}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {PRIORITY_OPTIONS.map((opt) => {
                      const isSelected = current === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => handlePriorityChange(group.key, opt.value)}
                          style={({ pressed }) => ({
                            flex: 1,
                            borderWidth: 1,
                            borderColor: isSelected ? opt.color : Colors.border,
                            backgroundColor: isSelected ? opt.color + "22" : "transparent",
                            paddingVertical: 8,
                            alignItems: "center",
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{
                            fontFamily: isSelected ? "Rubik_700Bold" : "Rubik_400Regular",
                            fontSize: 11,
                            color: isSelected ? opt.color : Colors.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={handleGenerate}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 14,
                color: Colors.text,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}>
                Generate Routine →
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── Step 3: Preview + Save ── */}
      {step === 3 && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <View>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  {routineName}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  {daysPerWeek} days · {generatedDays.reduce((n, d) => n + d.exerciseIds.length, 0)} exercises total
                </Text>
              </View>
              <Pressable
                onPress={handleRegenerate}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Shuffle
                </Text>
              </Pressable>
            </View>

            {generatedDays.map((day, idx) => {
              const isExpanded = expandedDay === idx;
              return (
                <Pressable
                  key={day.dayNumber}
                  onPress={() => setExpandedDay(isExpanded ? null : idx)}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginBottom: 8,
                  }}
                >
                  {/* Day header */}
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: isExpanded ? Colors.bgAccent : Colors.bg,
                    borderBottomWidth: isExpanded ? 1 : 0,
                    borderBottomColor: Colors.border,
                  }}>
                    <View>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                        {day.name}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                        {day.exerciseIds.length} exercise{day.exerciseIds.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={Colors.textMuted}
                    />
                  </View>

                  {/* Exercise list */}
                  {isExpanded && (
                    <View style={{ paddingVertical: 4 }}>
                      {day.exerciseIds.map((id, exIdx) => {
                        const ex = getExerciseById(id);
                        if (!ex) return null;
                        return (
                          <View
                            key={id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 14,
                              paddingVertical: 10,
                              borderBottomWidth: exIdx < day.exerciseIds.length - 1 ? 1 : 0,
                              borderBottomColor: Colors.border,
                            }}
                          >
                            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.primary, width: 20 }}>
                              {exIdx + 1}
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.text }}>
                                {ex.name}
                              </Text>
                              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 1, textTransform: "uppercase", letterSpacing: 1 }}>
                                {ex.category} · {ex.equipment}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                      {day.exerciseIds.length === 0 && (
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, paddingHorizontal: 14, paddingVertical: 12 }}>
                          All muscles set to Skip for this day.
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 + bottomInset }}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed || saving ? 0.85 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Save Routine
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

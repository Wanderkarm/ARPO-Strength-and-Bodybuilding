import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, Modal, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getSessionForEdit, updateSessionSets, type EditableExercise } from "@/lib/local-db";

const EDIT_WINDOW_HOURS = 24;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  planId: string;
  weekNumber: number;
  dayNumber: number;
  /** ISO string of when the session was completed — used for the 24hr gate. */
  completedAt: string;
  unit: string;
}

interface DraftSet {
  setNumber: number;
  weight: string;
  reps: string;
}

interface DraftExercise {
  logId: string;
  exerciseName: string;
  sets: DraftSet[];
}

function isWithinEditWindow(completedAt: string): boolean {
  const elapsed = Date.now() - new Date(completedAt).getTime();
  return elapsed < EDIT_WINDOW_HOURS * 60 * 60 * 1000;
}

export default function SessionEditSheet({
  visible, onClose, onSaved,
  planId, weekNumber, dayNumber, completedAt, unit,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const locked = !isWithinEditWindow(completedAt);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const data: EditableExercise[] = await getSessionForEdit(planId, weekNumber, dayNumber);
      setExercises(
        data.map((ex) => ({
          logId: ex.logId,
          exerciseName: ex.exerciseName,
          sets: ex.sets.map((s) => ({
            setNumber: s.setNumber,
            weight: s.weight > 0 ? String(s.weight) : "",
            reps: s.reps > 0 ? String(s.reps) : "",
          })),
        }))
      );
    } catch (err) {
      console.error("[SessionEditSheet] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [visible, planId, weekNumber, dayNumber]);

  useEffect(() => { load(); }, [load]);

  function updateWeight(exIdx: number, setIdx: number, val: string) {
    setExercises((prev) => {
      const next = prev.map((e, ei) =>
        ei !== exIdx ? e : {
          ...e,
          sets: e.sets.map((s, si) => si !== setIdx ? s : { ...s, weight: val }),
        }
      );
      return next;
    });
  }

  function updateReps(exIdx: number, setIdx: number, val: string) {
    setExercises((prev) => {
      const next = prev.map((e, ei) =>
        ei !== exIdx ? e : {
          ...e,
          sets: e.sets.map((s, si) => si !== setIdx ? s : { ...s, reps: val }),
        }
      );
      return next;
    });
  }

  async function handleSave() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const edits: { workoutLogId: string; setNumber: number; weight: number; reps: number }[] = [];
      for (const ex of exercises) {
        for (const s of ex.sets) {
          const w = parseFloat(s.weight);
          const r = parseInt(s.reps);
          edits.push({
            workoutLogId: ex.logId,
            setNumber: s.setNumber,
            weight: isNaN(w) ? 0 : w,
            reps: isNaN(r) ? 0 : r,
          });
        }
      }
      await updateSessionSets(edits);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
    } catch (err) {
      console.error("[SessionEditSheet] save error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{
            backgroundColor: Colors.bgAccent,
            borderTopWidth: 1, borderTopColor: Colors.border,
            maxHeight: "88%",
          }}>

            {/* Header */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name={locked ? "lock-closed-outline" : "create-outline"} size={18} color={Colors.primary} />
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5 }}>
                  {locked ? "Session Log" : "Edit Session"}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Lock notice */}
            {locked && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                paddingHorizontal: 20, paddingVertical: 10,
                backgroundColor: Colors.border + "66",
                borderBottomWidth: 1, borderBottomColor: Colors.border,
              }}>
                <Ionicons name="lock-closed" size={13} color={Colors.textSecondary} />
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                  Edit window closed — sessions lock 24 hours after completion.
                </Text>
              </View>
            )}

            {loading ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {exercises.map((ex, exIdx) => (
                  <View key={ex.logId} style={{ marginBottom: 20 }}>
                    {/* Exercise name */}
                    <Text style={{
                      fontFamily: "Rubik_600SemiBold", fontSize: 13,
                      color: Colors.text, marginBottom: 8,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      {ex.exerciseName}
                    </Text>

                    {/* Column headers */}
                    <View style={{ flexDirection: "row", marginBottom: 4, paddingHorizontal: 2 }}>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, width: 32 }}>
                        Set
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, flex: 1, textAlign: "center" }}>
                        Weight ({unit})
                      </Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, flex: 1, textAlign: "center" }}>
                        Reps
                      </Text>
                    </View>

                    {/* Set rows */}
                    {ex.sets.map((s, setIdx) => (
                      <View key={s.setNumber} style={{
                        flexDirection: "row", alignItems: "center",
                        borderTopWidth: 1, borderTopColor: Colors.border,
                        paddingVertical: 6, paddingHorizontal: 2,
                      }}>
                        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textSecondary, width: 32 }}>
                          {s.setNumber}
                        </Text>
                        {locked ? (
                          <>
                            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "center" }}>
                              {s.weight || "—"}
                            </Text>
                            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "center" }}>
                              {s.reps || "—"}
                            </Text>
                          </>
                        ) : (
                          <>
                            <TextInput
                              value={s.weight}
                              onChangeText={(v) => updateWeight(exIdx, setIdx, v)}
                              keyboardType="decimal-pad"
                              placeholder="—"
                              placeholderTextColor={Colors.textMuted}
                              style={{
                                flex: 1, textAlign: "center",
                                fontFamily: "Rubik_600SemiBold", fontSize: 15,
                                color: Colors.text,
                                borderWidth: 1, borderColor: Colors.border,
                                paddingVertical: 7, marginHorizontal: 4,
                                backgroundColor: Colors.bgInput,
                              }}
                            />
                            <TextInput
                              value={s.reps}
                              onChangeText={(v) => updateReps(exIdx, setIdx, v)}
                              keyboardType="number-pad"
                              placeholder="—"
                              placeholderTextColor={Colors.textMuted}
                              style={{
                                flex: 1, textAlign: "center",
                                fontFamily: "Rubik_600SemiBold", fontSize: 15,
                                color: Colors.text,
                                borderWidth: 1, borderColor: Colors.border,
                                paddingVertical: 7, marginHorizontal: 4,
                                backgroundColor: Colors.bgInput,
                              }}
                            />
                          </>
                        )}
                      </View>
                    ))}
                  </View>
                ))}

                {!locked && (
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.primary,
                      paddingVertical: 15,
                      alignItems: "center",
                      marginTop: 8,
                      opacity: pressed || saving ? 0.8 : 1,
                    })}
                  >
                    {saving
                      ? <ActivityIndicator color={Colors.text} />
                      : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                          Save Changes
                        </Text>
                    }
                  </Pressable>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

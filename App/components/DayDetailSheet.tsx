import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type CalendarDayData } from "@/lib/local-db";

interface Props {
  visible: boolean;
  dateStr: string | null;      // "YYYY-MM-DD"
  data: CalendarDayData | null;
  weightUnit: string;
  onClose: () => void;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][date.getDay()];
  return `${dayName}, ${MONTH_SHORT[m - 1]} ${d}`;
}

export default function DayDetailSheet({ visible, dateStr, data, weightUnit, onClose }: Props) {
  if (!dateStr) return null;

  const hasWorkout = data?.workoutDone;
  const hasWeighIn = data?.weighInDone;
  const hasSteps   = data?.stepsGoalHit;
  const hasAnything = hasWorkout || hasWeighIn || hasSteps;

  function handleViewSession() {
    onClose();
    // Navigate to History tab — list view will show the session
    router.push("/(tabs)/history");
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border }}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 3, backgroundColor: Colors.border, borderRadius: 2 }} />
          </View>

          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 36 }}>
            {/* Date header */}
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 20 }}>
              {formatDateStr(dateStr)}
            </Text>

            {!hasAnything ? (
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>
                No activity recorded on this day.
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                {/* Workout row */}
                {hasWorkout && (
                  <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.primary, padding: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                          {data?.workoutLabel ?? "Workout"}
                        </Text>
                        {data?.exerciseCount != null && (
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 3 }}>
                            {data.exerciseCount} exercise{data.exerciseCount !== 1 ? "s" : ""}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={handleViewSession} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                          View session →
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Weigh-in row */}
                {hasWeighIn && data?.weightKg != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: hasWorkout ? 1 : 0, borderTopColor: Colors.border }}>
                    <Ionicons name="scale-outline" size={16} color={Colors.textSecondary} />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary }}>
                      {weightUnit === "lbs"
                        ? `${(data.weightKg * 2.20462).toFixed(1)} lbs`
                        : `${data.weightKg.toFixed(1)} kg`
                      }
                    </Text>
                  </View>
                )}

                {/* Steps row */}
                {hasSteps && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: (hasWorkout || hasWeighIn) ? 1 : 0, borderTopColor: Colors.border }}>
                    <Ionicons name="footsteps-outline" size={16} color={Colors.success} />
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary }}>
                      Step goal reached
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

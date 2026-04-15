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
import GlossaryTerm from "@/components/GlossaryTerm";
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
  }>();

  const totalVolume = parseFloat(params.totalVolume || "0");
  const weekNumber = parseInt(params.weekNumber || "1");
  const dayNumber = parseInt(params.dayNumber || "1");
  const exerciseCount = parseInt(params.exerciseCount || "0");
  const currentRIR = params.currentRIR || "";

  let nextWeekTargets: NextWeekTarget[] = [];
  try {
    nextWeekTargets = JSON.parse(params.nextWeekTargets || "[]");
  } catch {}

  function formatVolume(vol: number): string {
    if (vol >= 1000) {
      return `${(vol / 1000).toFixed(1)}K`;
    }
    return String(Math.round(vol));
  }

  function handleReturnToDashboard() {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace("/(tabs)");
  }

  function getWeightArrow(thisWeek: number | undefined, nextWeek: number): { symbol: string; color: string } {
    if (thisWeek === undefined) return { symbol: "→", color: Colors.textMuted };
    if (nextWeek > thisWeek) return { symbol: "↑", color: Colors.primary };
    if (nextWeek < thisWeek) return { symbol: "↓", color: Colors.textMuted };
    return { symbol: "→", color: Colors.textMuted };
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: topInset,
        paddingBottom: bottomInset,
      }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View
          style={{
            alignItems: "center",
            paddingTop: 40,
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              backgroundColor: Colors.primary,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons name="checkmark" size={36} color={Colors.text} />
          </View>

          <Text
            style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 26,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
              textAlign: "center",
            }}
          >
            Workout Complete
          </Text>

          <Text
            style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 13,
              color: Colors.textSecondary,
              marginTop: 8,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Week {weekNumber} — Day {dayNumber}
          </Text>

          <View
            style={{
              marginTop: 20,
              borderLeftWidth: 3,
              borderLeftColor: Colors.primary,
              paddingLeft: 14,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_500Medium",
                fontSize: 13,
                color: Colors.textSecondary,
                fontStyle: "italic",
                lineHeight: 20,
              }}
            >
              Session logged. Recover. Your next targets have been calculated.
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 24,
            marginTop: 32,
            gap: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Volume
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 26,
                color: Colors.primary,
              }}
            >
              {formatVolume(totalVolume)}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 9,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {unit} moved
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Exercises
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 26,
                color: Colors.text,
              }}
            >
              {exerciseCount}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 9,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              completed
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Week
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 26,
                color: Colors.text,
              }}
            >
              {weekNumber}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 9,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              of 4
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              RIR
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 20,
                color: Colors.text,
                textAlign: "center",
              }}
            >
              {currentRIR ? currentRIR.replace(" RIR", "") : "—"}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 9,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              this week
            </Text>
          </View>
        </View>

        {nextWeekTargets.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Ionicons
                name="trending-up"
                size={16}
                color={Colors.primary}
              />
              <Text
                style={{
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 12,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Next Week Preview
              </Text>
            </View>

            {nextWeekTargets.map((target, i) => {
              const arrow = getWeightArrow(target.thisWeekWeight, target.targetWeight);
              const thisWeekStr = target.thisWeekSets !== undefined && target.thisWeekReps !== undefined && target.thisWeekWeight !== undefined
                ? `${target.thisWeekSets}×${target.thisWeekReps} @ ${target.thisWeekWeight} ${unit}`
                : "—";
              const nextWeekStr = `${target.targetSets}×${target.targetReps ?? "—"} @ ${target.targetWeight} ${unit}`;

              return (
                <View
                  key={target.exerciseId}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      backgroundColor: Colors.bgAccent,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 11,
                        color: Colors.text,
                        textTransform: "uppercase",
                        letterSpacing: 2,
                      }}
                      numberOfLines={1}
                    >
                      {target.exerciseName ?? `Exercise ${i + 1}`}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row" }}>
                    <View
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRightWidth: 1,
                        borderRightColor: Colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 9,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        This Week
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Rubik_700Bold",
                          fontSize: 14,
                          color: Colors.text,
                          marginBottom: 4,
                        }}
                      >
                        {thisWeekStr}
                      </Text>
                      {target.thisWeekRIR ? (
                        <Text
                          style={{
                            fontFamily: "Rubik_400Regular",
                            fontSize: 11,
                            color: Colors.textSecondary,
                          }}
                        >
                          {target.thisWeekRIR}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ flex: 1, padding: 12 }}>
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 9,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        Next Week →
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <Text
                          style={{
                            fontFamily: "Rubik_700Bold",
                            fontSize: 14,
                            color: Colors.text,
                          }}
                        >
                          {nextWeekStr}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Rubik_700Bold",
                            fontSize: 14,
                            color: arrow.color,
                          }}
                        >
                          {arrow.symbol}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: "Rubik_400Regular",
                          fontSize: 11,
                          color: Colors.textSecondary,
                        }}
                      >
                        {target.targetRIR}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
          <Pressable
            onPress={handleReturnToDashboard}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: 20,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 16,
                color: Colors.text,
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              Return to Dashboard
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

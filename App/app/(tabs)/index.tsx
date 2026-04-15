import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import GlossaryTerm from "@/components/GlossaryTerm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getWorkoutPlan, skipSession, type WorkoutPlan } from "@/lib/local-db";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const loadPlan = useCallback(async () => {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (planId) {
      const p = await getWorkoutPlan(planId);
      setPlan(p);
    }
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
    }, [loadPlan])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadPlan();
    setRefreshing(false);
  }

  function handleStartWorkout() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/workout");
  }

  function handleSkipSession() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Skip Session",
      "Are you sure? This will push your targets to next week.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: async () => {
            if (!plan) return;
            setSkipping(true);
            try {
              const currentDay = plan.currentDay || 1;
              const result = await skipSession(plan.id, plan.currentWeek, currentDay);
              if (result.isMesoComplete) {
                await AsyncStorage.removeItem("activePlanId");
                router.replace("/meso-complete");
              } else {
                await loadPlan();
              }
            } catch (err) {
              console.error("Skip error:", err);
            } finally {
              setSkipping(false);
            }
          },
        },
      ]
    );
  }

  async function handleChangeRoutine() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuVisible(false);
    await AsyncStorage.removeItem("activePlanId");
    router.replace("/templates");
  }

  if (isLoading || !plan) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const mesoWeek = ((plan.currentWeek - 1) % 4) + 1;
  const isDeload = mesoWeek === 4;
  const mesoPhase =
    mesoWeek === 1
      ? "ACCUMULATION"
      : mesoWeek === 2
        ? "INTENSIFICATION"
        : mesoWeek === 3
          ? "OVERREACH"
          : "DELOAD";
  const rirTarget = mesoWeek === 1 ? 3 : mesoWeek === 2 ? 2 : mesoWeek === 3 ? 1 : 4;

  const completedDayNumbers = new Set(
    plan.logs
      .filter(
        (l) => l.weekNumber === plan.currentWeek && l.completedAt
      )
      .map((l) => l.dayNumber)
  );
  const completedDays = completedDayNumbers.size;
  const totalDays = plan.template.days.length;
  const currentDayNumber = plan.currentDay || 1;
  const nextDayIndex = currentDayNumber - 1;
  const nextDay = plan.template.days[nextDayIndex] || plan.template.days[0];
  const progressPercent =
    totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0;

  // Use actual workout logs for next session preview so home gym swaps are reflected
  // Logs are inserted in template order, so the filter preserves correct exercise sequence
  const nextDayLogs = plan.logs.filter(
    (l) =>
      l.weekNumber === plan.currentWeek &&
      l.dayNumber === currentDayNumber &&
      !l.completedAt
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: topInset,
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 22,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Hypertrophy Hub
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 12,
                  color: Colors.textSecondary,
                  marginTop: 2,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {plan.template.name}
              </Text>
            </View>
            <Pressable
              testID="menu-btn"
              onPress={() => setMenuVisible(true)}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                backgroundColor: Colors.bgAccent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 11,
                  color: Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Mesocycle Progress
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 11,
                  color: isDeload ? Colors.warning : Colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {mesoPhase}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              {[1, 2, 3, 4].map((w) => (
                <View key={w} style={{ alignItems: "center", flex: 1 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderWidth: 1,
                      borderColor:
                        w === mesoWeek ? Colors.primary : Colors.border,
                      backgroundColor:
                        w < mesoWeek
                          ? Colors.primary
                          : w === mesoWeek
                            ? Colors.bgAccent
                            : Colors.bg,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {w < mesoWeek ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={Colors.text}
                      />
                    ) : (
                      <Text
                        style={{
                          fontFamily: "Rubik_700Bold",
                          fontSize: 16,
                          color:
                            w === mesoWeek ? Colors.primary : Colors.textMuted,
                        }}
                      >
                        {w}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 9,
                      color: Colors.textMuted,
                      marginTop: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {w === 4 ? "DL" : `W${w}`}
                  </Text>
                </View>
              ))}
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 16,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                }}
              >
                <View style={{ marginBottom: 4 }}>
                  <GlossaryTerm
                    text="Target RIR"
                    termKey="RIR"
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 10,
                      color: Colors.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 24,
                    color: Colors.text,
                  }}
                >
                  {isDeload ? "--" : rirTarget}
                </Text>
              </View>

              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 10,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  Week
                </Text>
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 24,
                    color: Colors.text,
                  }}
                >
                  {plan.currentWeek}
                </Text>
              </View>

              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 10,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  Sessions
                </Text>
                <Text
                  style={{
                    fontFamily: "Rubik_700Bold",
                    fontSize: 24,
                    color: Colors.text,
                  }}
                >
                  {completedDays}
                  <Text
                    style={{
                      fontSize: 14,
                      color: Colors.textMuted,
                    }}
                  >
                    /{totalDays}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        </View>

        {nextDay && (
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 11,
                  color: Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  marginBottom: 12,
                }}
              >
                Next Session — Day {nextDay.dayNumber}
              </Text>

              {(nextDayLogs.length > 0 ? nextDayLogs : nextDay.exercises).map((item, idx) => {
                const exercise = "exercise" in item ? item.exercise : (item as any).exercise;
                return (
                  <View
                    key={"id" in item ? item.id : idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: Colors.bgAccent,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 10,
                          color: Colors.primary,
                        }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: "Rubik_400Regular",
                        fontSize: 13,
                        color: Colors.text,
                        flex: 1,
                      }}
                    >
                      {exercise.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Rubik_400Regular",
                        fontSize: 10,
                        color: Colors.textMuted,
                        textTransform: "uppercase",
                      }}
                    >
                      {exercise.equipment}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 10,
                  color: Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Weekly Progress
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 12,
                  color: Colors.text,
                }}
              >
                {Math.round(progressPercent)}%
              </Text>
            </View>
            <View
              style={{
                height: 4,
                backgroundColor: Colors.bgAccent,
                width: "100%",
              }}
            >
              <View
                style={{
                  height: 4,
                  backgroundColor: Colors.primary,
                  width: `${progressPercent}%`,
                }}
              />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Pressable
            testID="start-workout-btn"
            onPress={handleStartWorkout}
            style={({ pressed }) => ({
              backgroundColor: isDeload ? Colors.warning : Colors.primary,
              paddingVertical: 22,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Ionicons
                name="flash"
                size={24}
                color={Colors.text}
              />
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 18,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 3,
                }}
              >
                {isDeload ? "Start Deload" : "Start Workout"}
              </Text>
            </View>
          </Pressable>

          <Pressable
            testID="skip-session-btn"
            onPress={handleSkipSession}
            disabled={skipping}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: 14,
              marginTop: 10,
              opacity: pressed || skipping ? 0.5 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="play-skip-forward" size={16} color={Colors.textMuted} />
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 13,
                  color: Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                {skipping ? "Skipping..." : "Skip Session"}
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          onPress={() => setMenuVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}
        >
          <View
            style={{
              backgroundColor: Colors.bgAccent,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingBottom: 16,
              paddingTop: 16,
            }}
          >

            <Pressable
              testID="change-routine-btn"
              onPress={handleChangeRoutine}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 24,
                paddingVertical: 16,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="swap-horizontal" size={22} color={Colors.primary} />
              <View>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                  Change Routine
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Pick a different template or build your own
                </Text>
              </View>
            </Pressable>

            <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 24 }} />

            <Pressable
              onPress={() => setMenuVisible(false)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 24,
                paddingVertical: 16,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 15, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

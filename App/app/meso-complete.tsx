import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  getMesoStats,
  createWorkoutPlanFromPrevious,
  type MesoStats,
} from "@/lib/local-db";

export default function MesoCompleteScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const params = useLocalSearchParams<{ planId: string }>();
  const planId = params.planId || "";

  const [stats, setStats] = useState<MesoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBack, setRunningBack] = useState(false);

  useEffect(() => {
    if (planId) {
      getMesoStats(planId).then((s) => {
        setStats(s);
        setLoading(false);
      });
    }
  }, [planId]);

  function formatVolume(vol: number): string {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return String(Math.round(vol));
  }

  async function handleRunItBack() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRunningBack(true);
    try {
      const newPlan = await createWorkoutPlanFromPrevious(planId);
      await AsyncStorage.setItem("activePlanId", newPlan.id);
      router.replace("/(tabs)");
    } catch (err) {
      console.error(err);
      setRunningBack(false);
    }
  }

  function handleSelectNew() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AsyncStorage.removeItem("activePlanId");
    router.replace("/templates");
  }

  if (loading || !stats) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
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
        <View style={{ alignItems: "center", paddingTop: 48, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 72,
              height: 72,
              backgroundColor: Colors.primary,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <Ionicons name="trophy" size={40} color={Colors.text} />
          </View>

          <Text
            style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 24,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 3,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Mesocycle Complete
          </Text>

          <View
            style={{
              borderLeftWidth: 3,
              borderLeftColor: Colors.primary,
              paddingLeft: 14,
              paddingVertical: 4,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "Rubik_500Medium",
                fontSize: 14,
                color: Colors.textSecondary,
                fontStyle: "italic",
                lineHeight: 22,
              }}
            >
              Fatigue dissipated. Tissue adapted.
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 24,
            marginTop: 36,
            gap: 12,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 16,
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
              Total Volume
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 32,
                color: Colors.primary,
              }}
            >
              {formatVolume(stats.totalVolume)}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              lbs moved
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 16,
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
              Sessions
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 32,
                color: Colors.text,
              }}
            >
              {stats.totalSessions}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              completed
            </Text>
          </View>
        </View>

        {stats.exerciseProgress.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View style={{ borderWidth: 1, borderColor: Colors.border }}>
              <View
                style={{
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="trending-up" size={16} color={Colors.success} />
                  <Text
                    style={{
                      fontFamily: "Rubik_600SemiBold",
                      fontSize: 12,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}
                  >
                    Strength Gains
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ flex: 2, fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Exercise
                </Text>
                <Text style={{ flex: 1, fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  Wk 1
                </Text>
                <Text style={{ flex: 1, fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  Peak
                </Text>
                <Text style={{ flex: 1, fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  +Gain
                </Text>
              </View>

              {stats.exerciseProgress.map((ex, i) => (
                <View
                  key={ex.exerciseId}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderBottomWidth: i < stats.exerciseProgress.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.border,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      flex: 2,
                      fontFamily: "Rubik_400Regular",
                      fontSize: 12,
                      color: Colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {ex.exerciseName}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>
                    {ex.week1Weight}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "center" }}>
                    {ex.peakWeight}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.success, textAlign: "center" }}>
                    +{ex.weightGain}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 24, marginTop: 32, gap: 12 }}>
          <Pressable
            testID="run-it-back-btn"
            onPress={handleRunItBack}
            disabled={runningBack}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: 20,
              opacity: pressed || runningBack ? 0.7 : 1,
            })}
          >
            {runningBack ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 }}>
                <Ionicons name="refresh" size={20} color={Colors.text} />
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
                  Run It Back
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            testID="select-new-btn"
            onPress={handleSelectNew}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: Colors.primary,
              paddingVertical: 20,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 }}>
              <Ionicons name="grid-outline" size={20} color={Colors.primary} />
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 16,
                  color: Colors.primary,
                  textAlign: "center",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Select New Routine
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

import React, { useEffect } from "react";
import { View, Text, Pressable, Platform, Image } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getWorkoutPlan, getActivePlanForUser } from "@/lib/local-db";
import { usePurchase } from "@/contexts/PurchaseContext";

const CRIMSON = "#C62828";

const FEATURES: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  detail: string;
}[] = [
  {
    icon: "brain",
    label: "ARPO — Auto-Regulated Overload",
    detail: "Pump & soreness signals adjust your volume every session. No guesswork.",
  },
  {
    icon: "repeat-variant",
    label: "Double Progression",
    detail: "Chase reps to your ceiling, then increase load and reset. Proven for strength.",
  },
  {
    icon: "timer-outline",
    label: "Smart Rest Periods",
    detail: "3–4 min for heavy compounds, 2 min secondary, 90 s isolation — calibrated per set.",
  },
  {
    icon: "lightning-bolt",
    label: "Myo-Reps",
    detail: "Activation set + 15 s rest clusters. More effective reps, less time.",
  },
  {
    icon: "chart-timeline-variant",
    label: "Mesocycle Periodization",
    detail: "4-week blocks with a built-in deload. Fatigue managed so you peak, not plateau.",
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { isPurchased, isTrialExpired, isLoading: purchaseLoading } = usePurchase();

  useEffect(() => {
    if (!purchaseLoading) checkExistingUser();
  }, [purchaseLoading]);

  async function checkExistingUser() {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) return; // New user — stay on landing page

      // Trial gate: existing user whose trial has expired and hasn't purchased
      if (isTrialExpired && !isPurchased) {
        router.replace("/paywall");
        return;
      }

      let planId = await AsyncStorage.getItem("activePlanId");

      if (planId) {
        const plan = await getWorkoutPlan(planId);
        if (plan && plan.isActive) {
          router.replace("/(tabs)");
          return;
        }
        // Stored planId is stale — clear it and try to recover
        await AsyncStorage.removeItem("activePlanId");
        planId = null;
      }

      // Recovery: activePlanId was missing or stale — search the DB directly.
      // This handles cases where the key was cleared (meso complete, reinstall, etc.)
      const recoveredId = await getActivePlanForUser(userId);
      if (recoveredId) {
        await AsyncStorage.setItem("activePlanId", recoveredId);
        router.replace("/(tabs)");
        return;
      }

      // No active plan anywhere — send to template picker
      router.replace("/templates");
    } catch {}
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
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Image
          source={require("@/assets/images/logo-hero.png")}
          style={{ width: "92%", aspectRatio: 1, marginBottom: 8 }}
          resizeMode="contain"
        />

        <View
          style={{
            width: 40,
            height: 2,
            backgroundColor: Colors.primary,
            marginBottom: 14,
          }}
        />

        <Text
          style={{
            fontFamily: "Rubik_400Regular",
            fontSize: 11,
            color: Colors.textMuted,
            textAlign: "center",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          The Science of Hypertrophy &amp; Strength
        </Text>

        <View style={{ marginTop: 32, width: "100%", gap: 8 }}>
          {FEATURES.map(({ icon, label, detail }) => (
            <View
              key={label}
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderLeftWidth: 3,
                borderLeftColor: CRIMSON,
                paddingVertical: 11,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: Colors.bgAccent,
              }}
            >
              <MaterialCommunityIcons name={icon} size={20} color={CRIMSON} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Rubik_600SemiBold",
                    fontSize: 11,
                    color: Colors.text,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 11,
                    color: Colors.textSecondary,
                    marginTop: 2,
                    lineHeight: 15,
                  }}
                >
                  {detail}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        <Pressable
          onPress={() => router.push("/onboarding")}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            paddingVertical: 18,
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
            Begin Setup
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

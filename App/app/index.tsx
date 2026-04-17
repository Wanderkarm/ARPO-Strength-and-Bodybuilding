import React, { useEffect } from "react";
import { View, Text, Pressable, Platform, Image } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getWorkoutPlan, getActivePlanForUser } from "@/lib/local-db";

const CRIMSON = "#C62828";

const FEATURES = [
  {
    icon: "dumbbell" as const,
    text: "EVIDENCE-BASED HYPERTROPHY",
  },
  {
    icon: "arm-flex" as const,
    text: "STRENGTH & MUSCLE PERIODIZATION",
  },
  {
    icon: "timer-sand" as const,
    text: "OPTIMAL VOLUME & REST PERIODS",
  },
];

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    checkExistingUser();
  }, []);

  async function checkExistingUser() {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) return; // New user — stay on landing page

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
          source={require("@/assets/images/arpo-logo.png")}
          style={{ width: 100, height: 100, marginBottom: 32 }}
          resizeMode="contain"
        />

        <Text
          style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 36,
            color: Colors.text,
            textAlign: "center",
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          ARPO
        </Text>

        <View
          style={{
            width: 40,
            height: 2,
            backgroundColor: Colors.primary,
            marginTop: 16,
            marginBottom: 16,
          }}
        />

        <Text
          style={{
            fontFamily: "Rubik_500Medium",
            fontSize: 12,
            color: Colors.textSecondary,
            textAlign: "center",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Auto-Regulated Progressive Overload
        </Text>

        <Text
          style={{
            fontFamily: "Rubik_400Regular",
            fontSize: 11,
            color: Colors.textMuted,
            textAlign: "center",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          The Science of Hypertrophy &amp; Strength
        </Text>

        <View style={{ marginTop: 40, width: "100%", gap: 10 }}>
          {FEATURES.map(({ icon, text }) => (
            <View
              key={text}
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                paddingVertical: 14,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
              }}
            >
              <MaterialCommunityIcons name={icon} size={22} color={CRIMSON} />
              <Text
                style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 12,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  flex: 1,
                }}
              >
                {text}
              </Text>
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

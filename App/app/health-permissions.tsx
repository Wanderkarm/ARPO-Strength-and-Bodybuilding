import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const IOS_PERMISSIONS = [
  {
    icon: "footsteps-outline" as const,
    label: "Steps",
    description: "Daily step count toward your activity goal",
  },
  {
    icon: "scale-outline" as const,
    label: "Body Weight",
    description: "Auto-log weigh-ins from your smart scale",
  },
  {
    icon: "body-outline" as const,
    label: "Body Fat %",
    description: "Track composition changes alongside weight",
  },
  {
    icon: "heart-outline" as const,
    label: "Resting Heart Rate",
    description: "Used to calculate your daily Recovery score",
  },
  {
    icon: "pulse-outline" as const,
    label: "Heart Rate Variability",
    description: "Key signal for nervous system recovery",
  },
  {
    icon: "moon-outline" as const,
    label: "Sleep",
    description: "Sleep duration feeds directly into Recovery",
  },
];

const ANDROID_PERMISSIONS = [
  {
    icon: "footsteps-outline" as const,
    label: "Steps",
    description: "Daily step count toward your activity goal",
  },
  {
    icon: "scale-outline" as const,
    label: "Body Weight",
    description: "Auto-log weigh-ins from your smart scale",
  },
  {
    icon: "heart-outline" as const,
    label: "Resting Heart Rate",
    description: "Used to calculate your daily Recovery score",
  },
  {
    icon: "pulse-outline" as const,
    label: "Heart Rate Variability",
    description: "Key signal for nervous system recovery",
  },
  {
    icon: "moon-outline" as const,
    label: "Sleep",
    description: "Sleep duration feeds directly into Recovery",
  },
];

export default function HealthPermissions() {
  const insets = useSafeAreaInsets();
  const [requesting, setRequesting] = useState(false);

  const permissions = Platform.OS === "android" ? ANDROID_PERMISSIONS : IOS_PERMISSIONS;

  async function requestAndContinue() {
    setRequesting(true);
    try {
      if (Platform.OS === "ios") {
        const _hkModule = require("@kingstinct/react-native-healthkit");
        const HealthKit = _hkModule.default ?? _hkModule;
        // Split into two calls so a failure on one group (e.g. sleep category type)
        // doesn't silently prevent the other types from being requested.
        try {
          await HealthKit.requestAuthorization({
            toRead: [
              "HKQuantityTypeIdentifierBodyMass",
              "HKQuantityTypeIdentifierBodyFatPercentage",
              "HKQuantityTypeIdentifierStepCount",
            ],
            toShare: [],
          });
        } catch { /* non-fatal */ }
        try {
          await HealthKit.requestAuthorization({
            toRead: [
              "HKQuantityTypeIdentifierRestingHeartRate",
              "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
              "HKCategoryTypeIdentifierSleepAnalysis",
            ],
            toShare: [],
          });
        } catch { /* non-fatal */ }
      } else if (Platform.OS === "android") {
        const _hcModule = require("react-native-health-connect");
        const { initialize, requestPermission } = _hcModule.default ?? _hcModule;
        const available = await initialize();
        if (available) {
          await requestPermission([
            { accessType: "read", recordType: "Steps" },
            { accessType: "read", recordType: "Weight" },
            { accessType: "read", recordType: "RestingHeartRate" },
            { accessType: "read", recordType: "HeartRateVariabilitySdnn" },
            { accessType: "read", recordType: "SleepSession" },
          ]);
        }
      }
    } catch {
      // Permission errors are non-fatal — user can grant later in settings
    } finally {
      setRequesting(false);
      await AsyncStorage.setItem("healthPermissionsRequested", "1");
      router.replace("/(tabs)");
    }
  }

  async function skipAndContinue() {
    await AsyncStorage.setItem("healthPermissionsRequested", "1");
    router.replace("/(tabs)");
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginTop: 40, marginBottom: 36, gap: 14 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 18,
            backgroundColor: Colors.primary + "22",
            borderWidth: 1, borderColor: Colors.primary + "44",
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="heart" size={36} color={Colors.primary} />
          </View>
          <Text style={{
            fontFamily: "Rubik_700Bold", fontSize: 24,
            color: Colors.text, textAlign: "center",
          }}>
            Connect Health Data
          </Text>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 14,
            color: Colors.textSecondary, textAlign: "center", lineHeight: 22,
          }}>
            POWRLOG reads the following from{" "}
            <Text style={{ color: Colors.text, fontFamily: "Rubik_500Medium" }}>
              {Platform.OS === "ios" ? "Apple Health" : "Health Connect"}
            </Text>{" "}
            to automate your progress tracking. We never write or share your data.
          </Text>
        </View>

        {/* Permission list */}
        <View style={{ gap: 10, marginBottom: 36 }}>
          {permissions.map((p) => (
            <View
              key={p.label}
              style={{
                flexDirection: "row", alignItems: "center", gap: 14,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1, borderColor: Colors.border,
                paddingHorizontal: 16, paddingVertical: 14,
              }}
            >
              <View style={{
                width: 38, height: 38, borderRadius: 10,
                backgroundColor: Colors.primary + "18",
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name={p.icon} size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2,
                }}>
                  {p.label}
                </Text>
                <Text style={{
                  fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16,
                }}>
                  {p.description}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary + "99"} />
            </View>
          ))}
        </View>

        {/* Privacy note */}
        <View style={{
          flexDirection: "row", gap: 10, alignItems: "flex-start",
          backgroundColor: Colors.bgAccent,
          borderWidth: 1, borderColor: Colors.border,
          padding: 14, marginBottom: 32,
        }}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={{
            flex: 1, fontFamily: "Rubik_400Regular", fontSize: 11,
            color: Colors.textMuted, lineHeight: 17,
          }}>
            All health data stays on your device and in{" "}
            {Platform.OS === "ios" ? "Apple Health" : "Health Connect"}.
            POWRLOG only reads — it never uploads or shares your health data.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTAs */}
      <View style={{ paddingHorizontal: 28, gap: 12, paddingBottom: Math.max(insets.bottom, 20) }}>
        <Pressable
          onPress={requestAndContinue}
          disabled={requesting}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            paddingVertical: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {requesting ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Ionicons name="heart" size={18} color="white" />
              <Text style={{
                fontFamily: "Rubik_700Bold", fontSize: 15,
                color: "white", textTransform: "uppercase", letterSpacing: 1.5,
              }}>
                Connect {Platform.OS === "ios" ? "Apple Health" : "Health Connect"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={skipAndContinue} hitSlop={8}>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 13,
            color: Colors.textMuted, textAlign: "center",
          }}>
            Skip for now — connect later in Settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
    impact: "Activity",
  },
  {
    icon: "scale-outline" as const,
    label: "Body Weight",
    description: "Auto-logs weigh-ins from your smart scale — no manual entry",
    impact: "Composition",
  },
  {
    icon: "body-outline" as const,
    label: "Body Fat %",
    description: "Tracks composition changes alongside weight over time",
    impact: "Composition",
  },
  {
    icon: "heart-outline" as const,
    label: "Resting Heart Rate",
    description: "Powers your daily Recovery score",
    impact: "Recovery",
  },
  {
    icon: "pulse-outline" as const,
    label: "Heart Rate Variability",
    description: "The strongest signal for nervous system readiness",
    impact: "Recovery",
  },
  {
    icon: "moon-outline" as const,
    label: "Sleep",
    description: "Sleep quality directly determines your Recovery score",
    impact: "Recovery",
  },
];

const ANDROID_PERMISSIONS = [
  {
    icon: "footsteps-outline" as const,
    label: "Steps",
    description: "Daily step count toward your activity goal",
    impact: "Activity",
  },
  {
    icon: "scale-outline" as const,
    label: "Body Weight",
    description: "Auto-logs weigh-ins from your smart scale — no manual entry",
    impact: "Composition",
  },
  {
    icon: "heart-outline" as const,
    label: "Resting Heart Rate",
    description: "Powers your daily Recovery score",
    impact: "Recovery",
  },
  {
    icon: "pulse-outline" as const,
    label: "Heart Rate Variability",
    description: "The strongest signal for nervous system readiness",
    impact: "Recovery",
  },
  {
    icon: "moon-outline" as const,
    label: "Sleep",
    description: "Sleep quality directly determines your Recovery score",
    impact: "Recovery",
  },
];

export default function HealthPermissions() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [requesting, setRequesting] = useState(false);

  const permissions = Platform.OS === "android" ? ANDROID_PERMISSIONS : IOS_PERMISSIONS;

  async function requestAndContinue() {
    setRequesting(true);
    try {
      if (Platform.OS === "ios") {
        const _hkModule = require("@kingstinct/react-native-healthkit");
        const HealthKit = _hkModule.default ?? _hkModule;
        // Single call — all 6 types in one iOS permission dialog.
        // silentDailySync is guarded so it won't fire before this screen,
        // which was the original reason this dialog only showed 2 types.
        await HealthKit.requestAuthorization({
          toRead: [
            "HKQuantityTypeIdentifierBodyMass",
            "HKQuantityTypeIdentifierBodyFatPercentage",
            "HKQuantityTypeIdentifierStepCount",
            "HKQuantityTypeIdentifierRestingHeartRate",
            "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
            "HKCategoryTypeIdentifierSleepAnalysis",
          ],
          toShare: [],
        });
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
      // Non-fatal — user can grant permissions later in Settings
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
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginTop: 36, marginBottom: 20, gap: 12 }}>
          <View style={{
            width: 68, height: 68, borderRadius: 16,
            backgroundColor: Colors.primary + "22",
            borderWidth: 1, borderColor: Colors.primary + "44",
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="heart" size={34} color={Colors.primary} />
          </View>
          <Text style={{
            fontFamily: "Rubik_700Bold", fontSize: 22,
            color: Colors.text, textAlign: "center",
          }}>
            {t('healthPermissions.title')}
          </Text>
        </View>

        {/* Privacy guarantee — up top before the ask */}
        <View style={{
          flexDirection: "row", gap: 10, alignItems: "flex-start",
          backgroundColor: Colors.bgAccent,
          borderWidth: 1, borderColor: Colors.border,
          padding: 12, marginBottom: 20,
        }}>
          <Ionicons name="lock-closed" size={15} color={Colors.primary} style={{ marginTop: 1 }} />
          <Text style={{
            flex: 1, fontFamily: "Rubik_400Regular", fontSize: 11,
            color: Colors.textMuted, lineHeight: 16,
          }}>
            <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>
              {t('healthPermissions.privacyNote')}{" "}
            </Text>
            POWRLOG reads from {Platform.OS === "ios" ? "Apple Health" : "Health Connect"} locally.
            Nothing is uploaded, sold, or shared — ever.
          </Text>
        </View>

        {/* What you unlock — positive framing before the detail list */}
        <View style={{
          borderWidth: 1, borderColor: Colors.primary + "44",
          borderLeftWidth: 3, borderLeftColor: Colors.primary,
          backgroundColor: Colors.primary + "0A",
          padding: 14, marginBottom: 20,
        }}>
          <Text style={{
            fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.textMuted,
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
          }}>
            What this unlocks
          </Text>
          <View style={{ gap: 6 }}>
            {[
              "Automatic weigh-in logging from your smart scale",
              "Daily Recovery score (HRV + sleep + RHR)",
              "Step tracking toward your activity goal",
            ].map((item) => (
              <View key={item} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginTop: 1 }} />
                <Text style={{
                  flex: 1, fontFamily: "Rubik_400Regular", fontSize: 12,
                  color: Colors.textSecondary, lineHeight: 17,
                }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Permission detail list */}
        <Text style={{
          fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted,
          textTransform: "uppercase", letterSpacing: 2, marginBottom: 10,
        }}>
          Data we read
        </Text>
        <View style={{ gap: 8, marginBottom: 20 }}>
          {permissions.map((p) => (
            <View
              key={p.label}
              style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1, borderColor: Colors.border,
                paddingHorizontal: 14, paddingVertical: 12,
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 9,
                backgroundColor: Colors.primary + "18",
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name={p.icon} size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 1,
                }}>
                  {p.label}
                </Text>
                <Text style={{
                  fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 15,
                }}>
                  {p.description}
                </Text>
              </View>
              <View style={{
                backgroundColor: Colors.primary + "44",
                borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
              }}>
                <Text style={{
                  fontFamily: "Rubik_600SemiBold", fontSize: 9,
                  color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {p.impact}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom CTAs — fixed so they're always visible */}
      <View style={{
        paddingHorizontal: 24, gap: 10,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 20),
        borderTopWidth: 1, borderTopColor: Colors.border,
        backgroundColor: Colors.bg,
      }}>
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
                {t('healthPermissions.continueButton')}
              </Text>
            </>
          )}
        </Pressable>

        {/* Skip is only shown on Android — Apple guideline 5.1.1(iv) requires that
            iOS users always proceed to the native HealthKit permission dialog.
            They can deny within that dialog; bypassing it entirely is not allowed. */}
        {Platform.OS === "android" && (
          <Pressable onPress={skipAndContinue} hitSlop={8} disabled={requesting}>
            <Text style={{
              fontFamily: "Rubik_400Regular", fontSize: 12,
              color: Colors.textMuted, textAlign: "center",
            }}>
              {t('healthPermissions.skipButton')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from "react-native";
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { usePurchase, UNLOCK_PRICE_LABEL, REGULAR_PRICE_LABEL, FOUNDING_TIER_COUNT, TRIAL_WORKOUTS } from "@/contexts/PurchaseContext";

const FEATURE_KEYS = [
  { icon: "trending-up",        tKey: "arpo" },
  { icon: "repeat-variant",     tKey: "doubleProgression" },
  { icon: "lightning-bolt",     tKey: "myoreps" },
  { icon: "timer-outline",      tKey: "restTimer" },
  { icon: "restaurant-outline", tKey: "calories" },
  { icon: "body-outline",       tKey: "bodyComp" },
  { icon: "heart-outline",      tKey: "recovery" },
  { icon: "bar-chart-outline",  tKey: "volume" },
];

const DEV_TAP_TARGET = 7;
const DEV_UNLOCK_EMAIL = "andrewmarklatham@gmail.com"; // owner's Apple ID

export default function PaywallScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { purchaseUnlock, restorePurchases, isPurchased, devUnlock } = usePurchase();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring,  setRestoring]  = useState(false);
  const [devTaps,    setDevTaps]    = useState(0);

  // Redirect once purchased (inside useEffect — never during render)
  useEffect(() => {
    if (isPurchased) router.replace("/(tabs)");
  }, [isPurchased]);

  async function handlePurchase() {
    setPurchasing(true);
    const result = await purchaseUnlock();
    setPurchasing(false);
    if (result.success) {
      router.replace("/(tabs)");
    } else if (result.error) {
      Alert.alert(t('paywall.alerts.purchaseFailedTitle'), result.error, [{ text: t('paywall.alerts.button') }]);
    }
  }

  async function handleDevTap() {
    const next = devTaps + 1;
    setDevTaps(next);
    if (next >= DEV_TAP_TARGET) {
      setDevTaps(0);
      await devUnlock();
      router.replace("/(tabs)"); // navigate directly — don't rely on useEffect timing
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.success) {
      router.replace("/(tabs)");
    } else {
      Alert.alert(t('paywall.alerts.noPurchaseFoundTitle'), result.error ?? t('paywall.alerts.noPurchaseFoundDefault'), [{ text: t('paywall.alerts.button') }]);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
      {/* Fixed header — always visible, tap 7× for dev unlock */}
      <Pressable onPress={handleDevTap} hitSlop={12} style={{ alignSelf: "center", paddingVertical: 10 }}>
        <Text style={{
          fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.textMuted,
          textTransform: "uppercase", letterSpacing: 4, textAlign: "center",
        }}>
          POWRLOG
        </Text>
        {devTaps >= 3 && devTaps < DEV_TAP_TARGET && (
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 2 }}>
            {DEV_TAP_TARGET - devTaps} more...
          </Text>
        )}
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text,
          textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginTop: 16, marginBottom: 6,
        }}>
          {t('paywall.headline', { count: TRIAL_WORKOUTS })}
        </Text>
        <Text style={{
          fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary,
          textAlign: "center", lineHeight: 20, marginBottom: 28,
        }}>
          {t('paywall.payOnce')}
        </Text>

        {/* Value callout */}
        <View style={{
          borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
          borderLeftColor: Colors.primary, backgroundColor: Colors.bgAccent,
          padding: 14, marginBottom: 24,
        }}>
          <Text style={{
            fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.primary,
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
          }}>
            {t('paywall.foundingPriceHeading', { count: FOUNDING_TIER_COUNT })}
          </Text>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18,
          }}>
            Most fitness apps charge{" "}
            <Text style={{ color: Colors.text, fontFamily: "Rubik_600SemiBold" }}>$10–15/month</Text>.
            {" "}POWRLOG is{" "}
            <Text style={{ color: Colors.text, fontFamily: "Rubik_600SemiBold" }}>{UNLOCK_PRICE_LABEL} once</Text>
            {" "}for founding members — less than a single month elsewhere. Regular price is {REGULAR_PRICE_LABEL} once the founding batch is gone.
          </Text>
        </View>

        {/* Feature list */}
        <Text style={{
          fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted,
          textTransform: "uppercase", letterSpacing: 2, marginBottom: 12,
        }}>
          {t('paywall.featuresHeading')}
        </Text>

        {FEATURE_KEYS.map(f => (
          <View key={f.tKey} style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <Ionicons name={f.icon as any} size={18} color={Colors.primary} />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.text, flex: 1 }}>
              {t(`paywall.features.${f.tKey}`)}
            </Text>
            <Ionicons name="checkmark" size={16} color={Colors.primary} />
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={{
        paddingHorizontal: 24, paddingTop: 16,
        paddingBottom: 16 + insets.bottom,
        borderTopWidth: 1, borderTopColor: Colors.border,
        backgroundColor: Colors.bg,
      }}>
        {/* Price badge */}
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted,
            marginBottom: 2,
          }}>
            {t('paywall.regularPriceLabel')}{" "}
            <Text style={{ textDecorationLine: "line-through" }}>{REGULAR_PRICE_LABEL}</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 40, color: Colors.text, letterSpacing: -1 }}>
              {UNLOCK_PRICE_LABEL}
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>
              {t('paywall.oneTime')}
            </Text>
          </View>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.primary,
            marginTop: 3, letterSpacing: 0.5,
          }}>
            {t('paywall.foundingBadge', { count: FOUNDING_TIER_COUNT })}
          </Text>
        </View>

        {/* Buy button */}
        <Pressable
          onPress={handlePurchase}
          disabled={purchasing || restoring}
          style={({ pressed }) => ({
            backgroundColor: purchasing ? Colors.bgAccent : Colors.primary,
            paddingVertical: 18,
            alignItems: "center",
            marginBottom: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {purchasing
            ? <ActivityIndicator color={Colors.text} />
            : <Text style={{
                fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text,
                textTransform: "uppercase", letterSpacing: 2,
              }}>
                {t('paywall.unlockButton', { price: UNLOCK_PRICE_LABEL })}
              </Text>
          }
        </Pressable>

        {/* Restore */}
        <Pressable
          onPress={handleRestore}
          disabled={purchasing || restoring}
          style={({ pressed }) => ({ alignItems: "center", opacity: pressed ? 0.6 : 1 })}
        >
          {restoring
            ? <ActivityIndicator color={Colors.textMuted} size="small" />
            : <Text style={{
                fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted,
                textDecorationLine: "underline",
              }}>
                {t('paywall.restorePurchase')}
              </Text>
          }
        </Pressable>

        {/* Legal */}
        {Platform.OS === "ios" && (
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted,
            textAlign: "center", marginTop: 12, lineHeight: 15,
          }}>
            {t('paywall.legalText')}
          </Text>
        )}

        {/* Privacy Policy + Terms — required by Apple Guideline 3.1.1 on IAP screens */}
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Pressable onPress={() => Linking.openURL("https://powrlog.com/privacy")}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textDecorationLine: "underline" }}>
              {t('paywall.privacyPolicy')}
            </Text>
          </Pressable>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted }}>·</Text>
          <Pressable onPress={() => Linking.openURL("https://powrlog.com/terms")}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textDecorationLine: "underline" }}>
              {t('paywall.termsOfUse')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

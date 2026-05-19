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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { usePurchase, UNLOCK_PRICE_LABEL, REGULAR_PRICE_LABEL, FOUNDING_TIER_COUNT } from "@/contexts/PurchaseContext";

const FEATURES = [
  { icon: "trending-up",        text: "ARPO auto-progression — weights adjust every session" },
  { icon: "repeat-variant",     text: "Double Progression mode for strength-focused blocks" },
  { icon: "lightning-bolt",     text: "Myo-rep sets — more effective reps, less time" },
  { icon: "timer-outline",      text: "Smart 3-tier rest timer calibrated per movement" },
  { icon: "restaurant-outline", text: "Personalised calories & macro targets" },
  { icon: "body-outline",       text: "Body composition & FFMI tracking" },
  { icon: "heart-outline",      text: "Recovery Intelligence from Apple Health / Health Connect" },
  { icon: "bar-chart-outline",  text: "Volume landmarks & muscle progress charts" },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { purchaseUnlock, restorePurchases, isPurchased } = usePurchase();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring,  setRestoring]  = useState(false);

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
      Alert.alert("Purchase Failed", result.error, [{ text: "OK" }]);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.success) {
      router.replace("/(tabs)");
    } else {
      Alert.alert("No Purchase Found", result.error ?? "No previous purchase found for this Apple ID.", [{ text: "OK" }]);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Image
          source={require("../assets/images/LOGO2.png")}
          style={{ width: "45%", height: 120, alignSelf: "center", marginTop: 12, marginBottom: 8 }}
          resizeMode="contain"
        />

        {/* Headline */}
        <Text style={{
          fontFamily: "Rubik_700Bold", fontSize: 24, color: Colors.text,
          textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginBottom: 6,
        }}>
          3 sessions done.{"\n"}Time to unlock.
        </Text>
        <Text style={{
          fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary,
          textAlign: "center", lineHeight: 20, marginBottom: 28,
        }}>
          You've seen what POWRLOG does.{"\n"}Pay once. Own it. No subscription, ever.
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
            Founding member price — first {FOUNDING_TIER_COUNT} only
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
          Everything included
        </Text>

        {FEATURES.map(f => (
          <View key={f.text} style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <Ionicons name={f.icon as any} size={18} color={Colors.primary} />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.text, flex: 1 }}>
              {f.text}
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
            Regular price{" "}
            <Text style={{ textDecorationLine: "line-through" }}>{REGULAR_PRICE_LABEL}</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 40, color: Colors.text, letterSpacing: -1 }}>
              {UNLOCK_PRICE_LABEL}
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted }}>
              one-time · yours forever
            </Text>
          </View>
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.primary,
            marginTop: 3, letterSpacing: 0.5,
          }}>
            Founding member price · First {FOUNDING_TIER_COUNT} only
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
                Unlock POWRLOG — {UNLOCK_PRICE_LABEL}
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
                Restore previous purchase
              </Text>
          }
        </Pressable>

        {/* Legal */}
        {Platform.OS === "ios" && (
          <Text style={{
            fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted,
            textAlign: "center", marginTop: 12, lineHeight: 15,
          }}>
            Payment charged to your Apple ID at confirmation.{"\n"}
            Manage in Settings → [Your Name] → App Store.
          </Text>
        )}
      </View>
    </View>
  );
}

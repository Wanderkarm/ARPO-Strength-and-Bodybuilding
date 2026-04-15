import React, { useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { GLOSSARY } from "@/utils/volumeLandmarks";

interface InfoTipProps {
  term: keyof typeof GLOSSARY;
  /** Override the term label shown on the badge (defaults to `term`) */
  label?: string;
  size?: number;
  color?: string;
}

export default function InfoTip({ term, label, size = 14, color = Colors.textMuted }: InfoTipProps) {
  const [visible, setVisible] = useState(false);
  const entry = GLOSSARY[term];
  if (!entry) return null;

  function open() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
  }

  return (
    <>
      <Pressable
        onPress={open}
        hitSlop={8}
        accessibilityLabel={`Info about ${term}`}
        accessibilityRole="button"
      >
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}
          onPress={() => setVisible(false)}
        >
          <Pressable
            onPress={() => {}} // prevent dismiss on inner tap
            style={{
              backgroundColor: Colors.bgAccent,
              borderWidth: 1,
              borderColor: Colors.border,
              width: "100%",
              padding: 24,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle" size={18} color={Colors.primary} />
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 14,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}>
                  {label ?? term}
                </Text>
              </View>
              <Pressable onPress={() => setVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Body */}
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 13,
              color: Colors.textSecondary,
              lineHeight: 20,
              marginBottom: entry.citation ? 14 : 0,
            }}>
              {entry.explanation}
            </Text>

            {/* Citation */}
            {entry.citation && (
              <View style={{ borderLeftWidth: 2, borderLeftColor: Colors.border, paddingLeft: 10 }}>
                <Text style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 10,
                  color: Colors.textMuted,
                  fontStyle: "italic",
                  lineHeight: 16,
                }}>
                  {entry.citation}
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

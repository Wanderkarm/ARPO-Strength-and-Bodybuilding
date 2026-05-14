import React, { useState } from "react";
import { Text, Pressable, Modal, View, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { glossaryTerms } from "@/utils/educationData";

interface GlossaryTermProps {
  text: string;
  termKey: string;
  style?: object;
}

export default function GlossaryTerm({ text, termKey, style }: GlossaryTermProps) {
  const [visible, setVisible] = useState(false);
  const term = glossaryTerms[termKey];

  if (!term) {
    return <Text style={style}>{text}</Text>;
  }

  function open() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
  }

  return (
    <>
      <Pressable onPress={open} hitSlop={6}>
        <Text
          style={[
            style,
            {
              textDecorationLine: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: Colors.textMuted,
            },
          ]}
        >
          {text}
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          onPress={() => setVisible(false)}
          style={styles.overlay}
        >
          {/* Stop propagation so tapping the card doesn't dismiss */}
          <Pressable onPress={() => {}} style={styles.card}>

            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Ionicons name="book-outline" size={16} color={Colors.primary} />
                <Text style={styles.title} numberOfLines={1}>{term.title}</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* ── Definition ── */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.definition}>{term.definition}</Text>

              {/* ── Learn More section ── */}
              {term.learnMore && (
                <>
                  <View style={styles.learnMoreHeader}>
                    <Ionicons name="flask-outline" size={12} color={Colors.primary} />
                    <Text style={styles.learnMoreLabel}>In Practice</Text>
                  </View>
                  <Text style={styles.learnMoreText}>{term.learnMore}</Text>
                </>
              )}
            </ScrollView>

            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.closeBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Colors.bgAccent,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  title: {
    fontFamily: "Rubik_700Bold",
    fontSize: 15,
    color: Colors.text,
    textTransform: "uppercase",
    letterSpacing: 1,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 14,
  },
  definition: {
    fontFamily: "Rubik_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  learnMoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  learnMoreLabel: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 10,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  learnMoreText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 20,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary + "44",
    paddingLeft: 10,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  closeBtnText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

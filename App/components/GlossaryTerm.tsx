import React, { useState } from "react";
import { Text, Pressable, Modal, View, StyleSheet } from "react-native";
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

  return (
    <>
      <Pressable onPress={() => setVisible(true)} hitSlop={6}>
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
          <Pressable onPress={() => {}} style={styles.card}>
            <Text style={styles.title}>{term.title}</Text>

            <View style={styles.divider} />

            <Text style={styles.definition}>{term.definition}</Text>

            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
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
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
  },
  title: {
    fontFamily: "Rubik_700Bold",
    fontSize: 18,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  definition: {
    fontFamily: "Rubik_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 24,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeBtnText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

/**
 * RecoveryGuideModal
 *
 * Plain-English explainer for the Recovery Intelligence system.
 * Structure: purpose → define terms → how it helps → how it's calculated.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface RecoveryGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

const STATUS_LEVELS = [
  {
    label: "Primed",
    color: "#43A047",
    deviation: "≥ +10% vs your normal",
    description:
      "Your body is signalling peak readiness. Great day to push harder — add a rep, go heavier, or chase a personal best.",
  },
  {
    label: "Recovered",
    color: "#29B6F6",
    deviation: "Within ±10% of your normal",
    description:
      "You're in good shape. Stick to your plan. This is where most of your progress actually happens.",
  },
  {
    label: "Fatigued",
    color: "#F59E0B",
    deviation: "−10% to −20% below normal",
    description:
      "Stress is building up. Still train, but back off slightly — drop one set per exercise and prioritise sleep tonight.",
  },
  {
    label: "Accumulating",
    color: "#E53935",
    deviation: "> −20% below normal",
    description:
      "Your body needs a break. Consider swapping today's session for a walk or light stretching. If you're in Week 3 of your plan, this is expected — the upcoming deload will turn this fatigue into your biggest gains.",
  },
];

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={14} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DefinitionBox({ term, definition }: { term: string; definition: string }) {
  return (
    <View style={styles.definitionBox}>
      <Text style={styles.definitionTerm}>{term}</Text>
      <Text style={styles.definitionText}>{definition}</Text>
    </View>
  );
}

export default function RecoveryGuideModal({ visible, onClose }: RecoveryGuideModalProps) {
  function handleClose() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Ionicons name="pulse-outline" size={18} color={Colors.primary} />
              <Text style={styles.sheetTitle}>Recovery Intelligence</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.headerDivider} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >

            {/* ── Purpose ── */}
            <Section icon="help-circle-outline" title="What is this?">
              <Text style={styles.body}>
                Every morning, POWRLOG checks two signals from Apple Health to answer one question:{" "}
                <Text style={styles.emphasis}>is your body ready to train hard today, or does it need to be managed carefully?</Text>
              </Text>
              <Text style={styles.body}>
                The answer changes how you should approach today's session — whether to push for new records, follow the plan as written, or pull back slightly to avoid digging yourself into a hole.
              </Text>
            </Section>

            {/* ── Define the terms ── */}
            <Section icon="book-outline" title="The Two Signals — Explained Simply">
              <DefinitionBox
                term="Heart Rate Variability (HRV)"
                definition="Your heart doesn't beat like a metronome — the tiny gaps between beats vary slightly. A healthy, recovered nervous system produces more variation. A stressed or fatigued one produces less. HRV measures this variation in milliseconds. Higher = more recovered. It's the most sensitive early-warning signal for fatigue — it often drops 1–2 days before you consciously feel tired."
              />
              <DefinitionBox
                term="Resting Heart Rate (RHR)"
                definition="How many times your heart beats per minute when you're completely at rest (usually measured while you sleep). Lower = better. When your body is under stress — from hard training, poor sleep, or illness — your heart has to work harder, so RHR rises above your normal. It's a reliable backup signal when HRV data isn't available."
              />
            </Section>

            {/* ── Why personal baseline ── */}
            <Section icon="person-outline" title="Why It's Personal to You">
              <Text style={styles.body}>
                A score of 40 ms HRV might be excellent for one person and a warning sign for another. Generic thresholds ("below 30 = bad") don't work because every body is different.
              </Text>
              <Text style={styles.body}>
                POWRLOG builds <Text style={styles.emphasis}>your personal baseline</Text> from your last 7 readings — then grades today against{" "}
                <Text style={styles.emphasis}>your</Text> normal, not a population average. After 3 readings you'll start seeing personalised insights. By day 7 the baseline is stable.
              </Text>
            </Section>

            {/* ── Status levels ── */}
            <Section icon="layers-outline" title="What the Colours Mean">
              {STATUS_LEVELS.map((s) => (
                <View key={s.label} style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Text style={[styles.statusLabel, { color: s.color }]}>{s.label.toUpperCase()}</Text>
                      <View style={[styles.deviationBadge, { borderColor: s.color + "55", backgroundColor: s.color + "18" }]}>
                        <Text style={[styles.deviationText, { color: s.color }]}>{s.deviation}</Text>
                      </View>
                    </View>
                    <Text style={styles.statusDesc}>{s.description}</Text>
                  </View>
                </View>
              ))}
            </Section>

            {/* ── How it's calculated ── */}
            <Section icon="calculator-outline" title="How the Score is Calculated">
              <Text style={styles.body}>
                Both signals are compared to your 7-day average, then combined into one composite score:
              </Text>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaLabel}>Composite Recovery Score</Text>
                <Text style={styles.formulaText}>
                  HRV change from your normal × 60%{"\n"}
                  RHR change from your normal × 40%
                </Text>
                <Text style={styles.formulaNote}>
                  HRV gets more weight because it responds to fatigue faster. RHR is a strong supporting signal.
                </Text>
              </View>
              <Text style={[styles.body, { marginTop: 10 }]}>
                If HRV or RHR data isn't available, POWRLOG falls back to your sleep duration vs your rolling average. Sleep is a weaker signal but still useful — consistently short nights reduce strength by 2–8%.
              </Text>
            </Section>

            {/* ── Week context ── */}
            <Section icon="calendar-outline" title="It Changes Week by Week">
              <Text style={styles.body}>
                The same fatigue reading means something different depending on where you are in your 4-week training block:
              </Text>
              {[
                { week: "Week 1 — Accumulation", color: "#29B6F6", copy: "Fatigue this early is a warning. Your previous block may not have fully cleared. Consider an extra rest day." },
                { week: "Week 2 — Intensification", color: "#29B6F6", copy: "Some fatigue is normal as volume builds. Watch the trend over two sessions before adjusting." },
                { week: "Week 3 — Overreach", color: "#F59E0B", copy: "Deep fatigue is the goal this week. This controlled stress, followed by deload, is what produces your biggest gains. Push through." },
                { week: "Week 4 — Deload", color: "#43A047", copy: "Fatigue should be clearing. Light loads let your body absorb the work from weeks 1–3. Don't skip this week." },
              ].map((item) => (
                <View key={item.week} style={[styles.mesoRow, { borderLeftColor: item.color }]}>
                  <Text style={[styles.mesoWeek, { color: item.color }]}>{item.week}</Text>
                  <Text style={styles.mesoCopy}>{item.copy}</Text>
                </View>
              ))}
            </Section>

          </ScrollView>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.bgAccent,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: "90%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 8,
  },
  sheetTitle: {
    fontFamily: "Rubik_700Bold",
    fontSize: 16,
    color: Colors.text,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  headerDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Rubik_700Bold",
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  body: {
    fontFamily: "Rubik_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  emphasis: {
    fontFamily: "Rubik_600SemiBold",
    color: Colors.text,
  },
  definitionBox: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: 12,
    marginBottom: 10,
  },
  definitionTerm: {
    fontFamily: "Rubik_700Bold",
    fontSize: 12,
    color: Colors.text,
    marginBottom: 5,
  },
  definitionText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
    paddingLeft: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    flexShrink: 0,
  },
  statusLabel: {
    fontFamily: "Rubik_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
  },
  deviationBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 2,
  },
  deviationText: {
    fontFamily: "Rubik_500Medium",
    fontSize: 9,
    letterSpacing: 0.3,
  },
  statusDesc: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  formulaBox: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: 12,
    marginTop: 4,
  },
  formulaLabel: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 9,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  formulaText: {
    fontFamily: "Rubik_500Medium",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  formulaNote: {
    fontFamily: "Rubik_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  mesoRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
    paddingLeft: 10,
    marginBottom: 10,
  },
  mesoWeek: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 11,
    color: Colors.text,
    marginBottom: 2,
  },
  mesoCopy: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  closeBtnText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

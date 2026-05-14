/**
 * RecoveryGuideModal
 *
 * A comprehensive, scrollable explainer for the Recovery Intelligence system.
 * Opened by a "Learn More →" button on the Recovery Intelligence cards
 * (dashboard tile and post-workout summary).
 *
 * Covers:
 *  1. Why personal baselines beat fixed thresholds
 *  2. The four status levels with colour indicators
 *  3. How HRV and RHR are combined
 *  4. Mesocycle-aware interpretation
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

// ─── Status level definitions ─────────────────────────────────────────────────
const STATUS_LEVELS = [
  {
    label: "Primed",
    color: "#43A047",
    deviation: "≥ +10% vs baseline",
    description:
      "Peak readiness. Your HRV is elevated and/or RHR is below your normal — your nervous system is primed for high output. Ideal day to push intensity, chase rep ceilings, or attempt a PR.",
  },
  {
    label: "Recovered",
    color: "#29B6F6",
    deviation: "Within ±10%",
    description:
      "Normal training state. Metrics are within your personal range. Stick to your planned session — this is where most productive training happens.",
  },
  {
    label: "Fatigued",
    color: "#F59E0B",
    deviation: "−10% to −20%",
    description:
      "Accumulated stress is building. Train, but reduce volume slightly — drop one working set per exercise and prioritise 8+ hrs sleep tonight. In Week 3 (Overreach) this is expected and intended.",
  },
  {
    label: "Accumulating",
    color: "#E53935",
    deviation: "> −20% below baseline",
    description:
      "Significant systemic fatigue. Consider substituting your session with active recovery — a walk, mobility work, or light movement. If in Week 3, this is the intended overreach stimulus; the upcoming deload will convert this into your biggest gains.",
  },
];

// ─── Section component ────────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
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
          {/* ── Header ── */}
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

            {/* ── Why baselines? ── */}
            <Section icon="person-outline" title="Your Personal Baseline">
              <Text style={styles.body}>
                Fixed thresholds ("HRV below 30 ms = poor") ignore the fact that every body is different. A 40 ms HRV is excellent for a 50-year-old and a warning sign for a 22-year-old trained athlete.
              </Text>
              <Text style={styles.body}>
                POWRLOG builds your baseline from the last 7 synced readings and grades today's data against <Text style={styles.emphasis}>your</Text> normal — not a population average. After 3 readings, personalised insights unlock. By day 7, the baseline is stable.
              </Text>
            </Section>

            {/* ── Status levels ── */}
            <Section icon="layers-outline" title="Status Levels">
              {STATUS_LEVELS.map((s) => (
                <View key={s.label} style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Text style={[styles.statusLabel, { color: s.color }]}>{s.label}</Text>
                      <View style={[styles.deviationBadge, { borderColor: s.color + "55", backgroundColor: s.color + "18" }]}>
                        <Text style={[styles.deviationText, { color: s.color }]}>{s.deviation}</Text>
                      </View>
                    </View>
                    <Text style={styles.statusDesc}>{s.description}</Text>
                  </View>
                </View>
              ))}
            </Section>

            {/* ── The signals ── */}
            <Section icon="analytics-outline" title="The Signals: HRV + RHR">
              <Text style={styles.body}>
                Both metrics are pulled from Apple Health or Health Connect and compared to your 7-day average.
              </Text>

              <View style={styles.signalRow}>
                <Ionicons name="pulse-outline" size={14} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.signalName}>Heart Rate Variability (HRV) — 60% weight</Text>
                  <Text style={styles.signalDesc}>
                    The variation in time between heartbeats (milliseconds). Higher = more adaptable nervous system = better recovered. HRV is the most sensitive early indicator of fatigue — it often drops 1–2 days before you consciously feel tired. It carries more weight in the composite score for this reason.
                  </Text>
                </View>
              </View>

              <View style={styles.signalRow}>
                <Ionicons name="heart-outline" size={14} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.signalName}>Resting Heart Rate (RHR) — 40% weight</Text>
                  <Text style={styles.signalDesc}>
                    Beats per minute at full rest. Lower = better. An elevated RHR relative to your baseline indicates your cardiovascular system is working harder than normal to maintain homeostasis — a reliable secondary fatigue signal.
                  </Text>
                </View>
              </View>

              <View style={[styles.formulaBox]}>
                <Text style={styles.formulaLabel}>Composite Score</Text>
                <Text style={styles.formulaText}>
                  = (HRV deviation × 0.6) + (RHR deviation × 0.4){"\n"}
                  <Text style={styles.formulaNote}>RHR deviation is inverted — below baseline = positive (good)</Text>
                </Text>
              </View>
            </Section>

            {/* ── Mesocycle context ── */}
            <Section icon="calendar-outline" title="Mesocycle Context">
              <Text style={styles.body}>
                The same recovery reading means different things at different points in your 4-week training block:
              </Text>

              {[
                { week: "Week 1 — Accumulation", copy: "Fatigue this early is an early-warning signal. Your last block may not have fully cleared. Consider an extra rest day before continuing." },
                { week: "Week 2 — Intensification", copy: "Some fatigue is normal as volume builds. Monitor trends across two sessions before adjusting load." },
                { week: "Week 3 — Overreach", copy: "Deep fatigue is intentional. This is the stimulus that, once followed by deload, produces supercompensation. Push through with planned loads." },
                { week: "Week 4 — Deload", copy: "Fatigue should be dissipating. Light loads let accumulated stress clear so fitness gains from weeks 1–3 can express fully." },
              ].map((item) => (
                <View key={item.week} style={styles.mesoRow}>
                  <Text style={styles.mesoWeek}>{item.week}</Text>
                  <Text style={styles.mesoCopy}>{item.copy}</Text>
                </View>
              ))}
            </Section>

            {/* ── Sleep note ── */}
            <Section icon="moon-outline" title="Sleep as a Fallback">
              <Text style={styles.body}>
                If no HRV or RHR data is available, POWRLOG uses sleep duration vs your rolling average. Sleep is a weaker signal but still informative — consistently short nights predict next-day strength reductions of 2–8%.
              </Text>
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
    maxHeight: "88%",
    paddingBottom: 0,
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

  // Section
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

  // Status levels
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
    textTransform: "uppercase",
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

  // Signals
  signalRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  signalName: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    marginBottom: 3,
  },
  signalDesc: {
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
    marginBottom: 6,
  },
  formulaText: {
    fontFamily: "Rubik_500Medium",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
  },
  formulaNote: {
    fontFamily: "Rubik_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },

  // Mesocycle rows
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

  // Close button
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

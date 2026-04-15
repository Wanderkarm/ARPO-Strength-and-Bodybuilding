import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, Pressable, Platform, Modal, ScrollView, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useAudioPlayer } from "expo-audio";
import Colors from "@/constants/colors";
import { restFacts } from "@/utils/educationData";

interface RestTimerProps {
  initialSeconds: number;
  onDismiss: () => void;
}

async function scheduleEndNotification(inSeconds: number): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Rest Complete",
        body: "Time to lift. Get back to your set.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, inSeconds),
      },
    });
    return id;
  } catch {
    return null;
  }
}

async function cancelNotification(id: string | null) {
  if (!id || Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

export default function RestTimer({ initialSeconds, onDismiss }: RestTimerProps) {
  const endTimestampRef = useRef(Date.now() + initialSeconds * 1000);
  const notifIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFinishedRef = useRef(false);

  const [seconds, setSeconds] = useState(initialSeconds);
  const [paperModalVisible, setPaperModalVisible] = useState(false);
  const player = useAudioPlayer(require("@/assets/beep.wav"));

  const fact = useMemo(() => {
    return restFacts[Math.floor(Math.random() * restFacts.length)];
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    scheduleEndNotification(initialSeconds).then((id) => {
      notifIdRef.current = id;
    });

    intervalRef.current = setInterval(() => {
      const remaining = Math.ceil((endTimestampRef.current - Date.now()) / 1000);
      setSeconds(Math.max(0, remaining));
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      cancelNotification(notifIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (seconds === 0 && !hasFinishedRef.current) {
      hasFinishedRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      handleTimerComplete();
    }
  }, [seconds]);

  async function handleTimerComplete() {
    cancelNotification(notifIdRef.current);
    notifIdRef.current = null;

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    try {
      player.seekTo(0);
      player.play();
    } catch {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }

    setTimeout(() => {
      onDismiss();
    }, 1500);
  }

  async function addTime() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    endTimestampRef.current += 30000;
    const newRemaining = Math.ceil((endTimestampRef.current - Date.now()) / 1000);
    setSeconds(newRemaining);
    hasFinishedRef.current = false;

    cancelNotification(notifIdRef.current).then(() => {
      scheduleEndNotification(newRemaining).then((id) => {
        notifIdRef.current = id;
      });
    });
  }

  function skipTimer() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    cancelNotification(notifIdRef.current);
    notifIdRef.current = null;
    onDismiss();
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const isFinished = seconds === 0;

  return (
    <View testID="rest-timer" style={styles.container}>
      <Text style={styles.label}>{isFinished ? "Time's Up" : "Rest Timer"}</Text>

      <Text
        testID="rest-timer-display"
        style={[styles.timer, { color: isFinished ? Colors.success : Colors.primary }]}
      >
        {display}
      </Text>

      {!isFinished && (
        <View style={styles.buttonRow}>
          <Pressable
            testID="rest-add-time-btn"
            onPress={addTime}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.actionBtnText}>+30s</Text>
          </Pressable>

          <Pressable
            testID="rest-skip-btn"
            onPress={skipTimer}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionBtnText, { color: Colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>
      )}

      {!isFinished && (
        <View style={styles.factContainer}>
          <Text style={styles.factText}>{fact.excerpt}</Text>
          <Pressable
            testID="read-source-btn"
            onPress={() => setPaperModalVisible(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 10 })}
          >
            <Text style={styles.readSourceText}>Read Source Paper</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={paperModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaperModalVisible(false)}
      >
        <Pressable onPress={() => setPaperModalVisible(false)} style={styles.modalOverlay}>
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalCitation}>{fact.citation}</Text>
              <Text style={styles.modalPaperTitle}>{fact.paperTitle}</Text>
              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>Methodology & Sample Size:</Text>
              <Text style={styles.modalBody}>
                {fact.sampleSize}. {fact.methodology}
              </Text>
              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>Key Findings:</Text>
              <Text style={styles.modalBody}>{fact.keyFindings}</Text>
            </ScrollView>
            <Pressable
              testID="close-paper-modal"
              onPress={() => setPaperModalVisible(false)}
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginTop: 12,
    alignItems: "center",
  },
  label: {
    fontFamily: "Rubik_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  timer: {
    fontFamily: "Rubik_700Bold",
    fontSize: 56,
    letterSpacing: 4,
    lineHeight: 64,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  actionBtnText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  factContainer: {
    marginTop: 24,
    maxWidth: 320,
    alignItems: "center",
  },
  factText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  readSourceText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    maxHeight: "80%",
  },
  modalCitation: {
    fontFamily: "Rubik_700Bold",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  modalPaperTitle: {
    fontFamily: "Rubik_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
    marginBottom: 20,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  modalSectionTitle: {
    fontFamily: "Rubik_700Bold",
    fontSize: 12,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalBody: {
    fontFamily: "Rubik_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 20,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  closeBtnText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

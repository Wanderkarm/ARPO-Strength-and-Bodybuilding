/**
 * ARPO Notification utilities
 * – Daily workout & weigh-in reminders (scheduled, cancellable)
 * – Immediate PR celebration notification with sound
 */
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── AsyncStorage keys ────────────────────────────────────────────────────────
export const NOTIF_KEYS = {
  workoutEnabled: "notif_workout_enabled",
  workoutHour:    "notif_workout_hour",
  workoutMinute:  "notif_workout_minute",
  workoutId:      "notif_workout_id",
  weighinEnabled: "notif_weighin_enabled",
  weighinHour:    "notif_weighin_hour",
  weighinMinute:  "notif_weighin_minute",
  weighinId:      "notif_weighin_id",
} as const;

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  if (Platform.OS === "web") return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────

async function cancelById(storageKey: string): Promise<void> {
  const id = await AsyncStorage.getItem(storageKey);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(storageKey);
  }
}

export async function scheduleWorkoutReminder(hour: number, minute: number): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelById(NOTIF_KEYS.workoutId);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "💪 Time to Train",
      body: randomWorkoutMessage(),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    } as any,
  });
  await AsyncStorage.setItem(NOTIF_KEYS.workoutId, id);
  await AsyncStorage.setItem(NOTIF_KEYS.workoutEnabled, "true");
  await AsyncStorage.setItem(NOTIF_KEYS.workoutHour, String(hour));
  await AsyncStorage.setItem(NOTIF_KEYS.workoutMinute, String(minute));
}

export async function scheduleWeighInReminder(hour: number, minute: number): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelById(NOTIF_KEYS.weighinId);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "⚖️ Morning Weigh-in",
      body: "Log your weight to keep your progress chart up to date.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    } as any,
  });
  await AsyncStorage.setItem(NOTIF_KEYS.weighinId, id);
  await AsyncStorage.setItem(NOTIF_KEYS.weighinEnabled, "true");
  await AsyncStorage.setItem(NOTIF_KEYS.weighinHour, String(hour));
  await AsyncStorage.setItem(NOTIF_KEYS.weighinMinute, String(minute));
}

export async function cancelWorkoutReminder(): Promise<void> {
  await cancelById(NOTIF_KEYS.workoutId);
  await AsyncStorage.setItem(NOTIF_KEYS.workoutEnabled, "false");
}

export async function cancelWeighInReminder(): Promise<void> {
  await cancelById(NOTIF_KEYS.weighinId);
  await AsyncStorage.setItem(NOTIF_KEYS.weighinEnabled, "false");
}

// ─── PR Notification ──────────────────────────────────────────────────────────

export async function firePRNotification(
  exerciseName: string,
  newBest: number,
  previousBest: number,
  unit: string
): Promise<void> {
  if (Platform.OS === "web") return;
  const gain = previousBest > 0
    ? ` (+${Math.round((newBest - previousBest) * 10) / 10}${unit})`
    : "";
  const kudos = randomPRKudos();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🏆 New PR — ${exerciseName}`,
      body: `${newBest}${unit}${gain}. ${kudos}`,
      sound: true,
    },
    trigger: null,
  });
}

// ─── Preference loading ───────────────────────────────────────────────────────

export type NotificationPrefs = {
  workoutEnabled: boolean;
  workoutHour: number;
  workoutMinute: number;
  weighinEnabled: boolean;
  weighinHour: number;
  weighinMinute: number;
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const [we, wh, wm, de, dh, dm] = await Promise.all([
    AsyncStorage.getItem(NOTIF_KEYS.workoutEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.workoutHour),
    AsyncStorage.getItem(NOTIF_KEYS.workoutMinute),
    AsyncStorage.getItem(NOTIF_KEYS.weighinEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.weighinHour),
    AsyncStorage.getItem(NOTIF_KEYS.weighinMinute),
  ]);
  return {
    workoutEnabled: we === "true",
    workoutHour:    wh !== null ? parseInt(wh) : 8,
    workoutMinute:  wm !== null ? parseInt(wm) : 0,
    weighinEnabled: de === "true",
    weighinHour:    dh !== null ? parseInt(dh) : 7,
    weighinMinute:  dm !== null ? parseInt(dm) : 0,
  };
}

// ─── Kudos copy ───────────────────────────────────────────────────────────────

const WORKOUT_MESSAGES = [
  "Your gains don't wait. Let's get after it.",
  "The barbell is calling. Don't keep it waiting.",
  "Every rep is a deposit in the bank of gains.",
  "Progress doesn't happen by accident. Show up.",
  "Today's session is the one you'll thank yourself for.",
  "Consistency beats motivation every time. Go train.",
  "The only bad workout is the one you skipped.",
];

const PR_KUDOS = [
  "That's what ARPO is built for.",
  "You're stronger than last week. Keep going.",
  "Numbers don't lie — you're making progress.",
  "Progression is the point. You're living it.",
  "New ceiling set. Aim higher.",
];

function randomWorkoutMessage(): string {
  return WORKOUT_MESSAGES[Math.floor(Math.random() * WORKOUT_MESSAGES.length)];
}

function randomPRKudos(): string {
  return PR_KUDOS[Math.floor(Math.random() * PR_KUDOS.length)];
}

export function formatTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

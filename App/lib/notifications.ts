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
  // Streak reminder keys (ids stored as JSON array for multi-day scheduling)
  streakEnabled:  "notif_streak_enabled",
  streakHour:     "notif_streak_hour",
  streakMinute:   "notif_streak_minute",
  streakDays:     "notif_streak_days",  // "daily" | JSON array of day numbers [0-6]
  streakIds:      "notif_streak_ids",   // JSON array of notification IDs
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

// ─── Streak Reminder ──────────────────────────────────────────────────────────

/**
 * Schedule streak reminder(s).
 * @param hour     Hour (0–23)
 * @param minute   Minute (0–59)
 * @param days     "daily" for every day, or array of weekday numbers (0=Sun … 6=Sat)
 * @param streak   Current streak count, included in notification body
 */
export async function scheduleStreakReminder(
  hour: number,
  minute: number,
  days: "daily" | number[],
  streak = 0
): Promise<void> {
  if (Platform.OS === "web") return;
  // Cancel any previously scheduled streak notifications
  await cancelStreakReminder();

  const streakText = streak > 1 ? `You're on a ${streak}-day streak. ` : "";
  const body = `${streakText}Log a workout or weigh-in today to keep it going. 💪`;

  const ids: string[] = [];

  if (days === "daily") {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔥 Don't Break Your Streak!",
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      } as any,
    });
    ids.push(id);
  } else {
    // Schedule a separate weekly notification for each selected day
    const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    for (const weekday of days) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🔥 Don't Break Your Streak — ${DAY_NAMES[weekday]}`,
          body,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: weekday + 1, // expo uses 1=Sun … 7=Sat
          hour,
          minute,
        } as any,
      });
      ids.push(id);
    }
  }

  await AsyncStorage.setItem(NOTIF_KEYS.streakIds,    JSON.stringify(ids));
  await AsyncStorage.setItem(NOTIF_KEYS.streakEnabled, "true");
  await AsyncStorage.setItem(NOTIF_KEYS.streakHour,    String(hour));
  await AsyncStorage.setItem(NOTIF_KEYS.streakMinute,  String(minute));
  await AsyncStorage.setItem(NOTIF_KEYS.streakDays,    JSON.stringify(days));
}

export async function cancelStreakReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  const raw = await AsyncStorage.getItem(NOTIF_KEYS.streakIds);
  if (raw) {
    try {
      const ids: string[] = JSON.parse(raw);
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    } catch {}
    await AsyncStorage.removeItem(NOTIF_KEYS.streakIds);
  }
  await AsyncStorage.setItem(NOTIF_KEYS.streakEnabled, "false");
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
  streakEnabled: boolean;
  streakHour: number;
  streakMinute: number;
  streakDays: "daily" | number[];
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const [we, wh, wm, de, dh, dm, se, sh, sm, sd] = await Promise.all([
    AsyncStorage.getItem(NOTIF_KEYS.workoutEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.workoutHour),
    AsyncStorage.getItem(NOTIF_KEYS.workoutMinute),
    AsyncStorage.getItem(NOTIF_KEYS.weighinEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.weighinHour),
    AsyncStorage.getItem(NOTIF_KEYS.weighinMinute),
    AsyncStorage.getItem(NOTIF_KEYS.streakEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.streakHour),
    AsyncStorage.getItem(NOTIF_KEYS.streakMinute),
    AsyncStorage.getItem(NOTIF_KEYS.streakDays),
  ]);

  let streakDays: "daily" | number[] = "daily";
  try { if (sd) streakDays = JSON.parse(sd); } catch {}

  return {
    workoutEnabled: we === "true",
    workoutHour:    wh !== null ? parseInt(wh) : 8,
    workoutMinute:  wm !== null ? parseInt(wm) : 0,
    weighinEnabled: de === "true",
    weighinHour:    dh !== null ? parseInt(dh) : 7,
    weighinMinute:  dm !== null ? parseInt(dm) : 0,
    streakEnabled:  se === "true",
    streakHour:     sh !== null ? parseInt(sh) : 20,
    streakMinute:   sm !== null ? parseInt(sm) : 0,
    streakDays,
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

/**
 * ARPO Notification utilities
 * – One rotating daily reminder (pre-schedules 28 days of unique messages)
 * – Separate morning weigh-in reminder
 * – Immediate PR celebration notification
 */
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── AsyncStorage keys ────────────────────────────────────────────────────────
export const NOTIF_KEYS = {
  // Daily training reminder (replaces old workout + streak reminders)
  reminderEnabled: "notif_reminder_enabled",
  reminderHour:    "notif_reminder_hour",
  reminderMinute:  "notif_reminder_minute",
  reminderIds:     "notif_reminder_ids",     // JSON array of pre-scheduled IDs
  reminderIndex:   "notif_reminder_index",   // rotation position in message pool
  // Weigh-in reminder (kept separate — different time, different purpose)
  weighinEnabled:  "notif_weighin_enabled",
  weighinHour:     "notif_weighin_hour",
  weighinMinute:   "notif_weighin_minute",
  weighinId:       "notif_weighin_id",
  // Legacy keys — kept so old values aren't orphaned
  workoutEnabled:  "notif_workout_enabled",
  streakEnabled:   "notif_streak_enabled",
} as const;

// ─── Message pool — cycles sequentially, never randomly ───────────────────────
// 28 messages = 4 full weeks before any repeats

const REMINDER_MESSAGES: { title: string; body: string }[] = [
  { title: "💪 Time to Train",       body: "Your gains don't wait. Let's get after it." },
  { title: "💪 Time to Train",       body: "The barbell is calling. Don't keep it waiting." },
  { title: "🔥 Stay Consistent",     body: "Log a workout or weigh-in to keep your streak alive." },
  { title: "🏋️ Train Today",         body: "Champions show up on the days they don't feel like it." },
  { title: "💪 Time to Train",       body: "Every rep is a deposit in the bank of gains." },
  { title: "🔥 Don't Stop Now",      body: "You've been showing up. Keep the momentum going." },
  { title: "💪 Time to Train",       body: "Progress doesn't happen by accident. Show up." },
  { title: "🏋️ Train Today",         body: "Your future self is counting on what you do right now." },
  { title: "💪 Time to Train",       body: "Today's session is the one you'll thank yourself for." },
  { title: "🔥 Stay Consistent",     body: "Small actions compound. Don't break the chain." },
  { title: "💪 Time to Train",       body: "Consistency beats motivation every time. Go train." },
  { title: "📊 Track Your Progress", body: "Log your session and let the algorithm do its job." },
  { title: "💪 Time to Train",       body: "The only bad workout is the one you skipped." },
  { title: "🏋️ Train Today",         body: "Discipline isn't about feeling it. It's about doing it anyway." },
  { title: "💪 Time to Train",       body: "Tired is temporary. Gains are forever." },
  { title: "🔥 Stay Consistent",     body: "The version of you who trains today thanks you tomorrow." },
  { title: "💪 Time to Train",       body: "No one regrets a workout. Go get it." },
  { title: "🏋️ Train Today",         body: "This rep, this session — it all adds up." },
  { title: "📊 Track Your Progress", body: "Data is progress. Log today's session." },
  { title: "💪 Time to Train",       body: "Your body adapts to what you consistently do." },
  { title: "🔥 Don't Stop Now",      body: "Momentum is everything. Keep it going." },
  { title: "🏋️ Train Today",         body: "One session at a time. That's all it takes." },
  { title: "💪 Time to Train",       body: "Hard work in the gym is the shortcut." },
  { title: "🔥 Stay Consistent",     body: "Streak or no streak — you train because it matters." },
  { title: "🏋️ Train Today",         body: "The goal doesn't care how you feel. Train anyway." },
  { title: "💪 Time to Train",       body: "You didn't come this far to only come this far." },
  { title: "📊 Track Your Progress", body: "Log your weight and workout. Progress compounds." },
  { title: "🔥 Don't Stop Now",      body: "Every session is a vote for who you're becoming." },
];

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

// ─── Daily Training Reminder (rotating) ──────────────────────────────────────

/** Cancel all pre-scheduled reminder notifications. */
async function cancelReminderIds(): Promise<void> {
  const raw = await AsyncStorage.getItem(NOTIF_KEYS.reminderIds);
  if (raw) {
    try {
      const ids: string[] = JSON.parse(raw);
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    } catch {}
    await AsyncStorage.removeItem(NOTIF_KEYS.reminderIds);
  }
}

/**
 * Pre-schedule DAYS_AHEAD one-time notifications starting from tomorrow,
 * each with the next message in the sequential rotation.
 */
async function preScheduleReminder(hour: number, minute: number, daysAhead = 28): Promise<void> {
  if (Platform.OS === "web") return;
  await cancelReminderIds();

  const rawIdx = await AsyncStorage.getItem(NOTIF_KEYS.reminderIndex);
  let idx = rawIdx ? parseInt(rawIdx) || 0 : 0;

  const ids: string[] = [];
  const now = new Date();

  for (let day = 1; day <= daysAhead; day++) {
    const fireDate = new Date(now);
    fireDate.setDate(fireDate.getDate() + day);
    fireDate.setHours(hour, minute, 0, 0);
    if (fireDate <= now) continue;

    const msg = REMINDER_MESSAGES[idx % REMINDER_MESSAGES.length];
    idx++;

    const id = await Notifications.scheduleNotificationAsync({
      content: { title: msg.title, body: msg.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate } as any,
    });
    ids.push(id);
  }

  await AsyncStorage.setItem(NOTIF_KEYS.reminderIds,  JSON.stringify(ids));
  await AsyncStorage.setItem(NOTIF_KEYS.reminderIndex, String(idx));
}

export async function scheduleReminder(hour: number, minute: number): Promise<void> {
  await preScheduleReminder(hour, minute, 28);
  await AsyncStorage.setItem(NOTIF_KEYS.reminderEnabled, "true");
  await AsyncStorage.setItem(NOTIF_KEYS.reminderHour,    String(hour));
  await AsyncStorage.setItem(NOTIF_KEYS.reminderMinute,  String(minute));
  // Also clear legacy flags so old notifications don't confuse things
  await AsyncStorage.setItem(NOTIF_KEYS.workoutEnabled, "false");
  await AsyncStorage.setItem(NOTIF_KEYS.streakEnabled,  "false");
}

export async function cancelReminder(): Promise<void> {
  await cancelReminderIds();
  await AsyncStorage.setItem(NOTIF_KEYS.reminderEnabled, "false");
}

/**
 * Call on app foreground. If < 7 notifications remain, silently re-fill for
 * another 28 days. Throttled to once per day via a timestamp check.
 */
export async function refreshReminderIfNeeded(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const enabled = await AsyncStorage.getItem(NOTIF_KEYS.reminderEnabled);
    if (enabled !== "true") return;

    // Throttle: only run once per day
    const lastRefresh = await AsyncStorage.getItem("notif_reminder_last_refresh");
    const today = new Date().toISOString().slice(0, 10);
    if (lastRefresh === today) return;
    await AsyncStorage.setItem("notif_reminder_last_refresh", today);

    // Count how many of our pre-scheduled notifications are still pending
    const rawIds = await AsyncStorage.getItem(NOTIF_KEYS.reminderIds);
    if (!rawIds) {
      // Nothing scheduled — reschedule from scratch
      const h = parseInt((await AsyncStorage.getItem(NOTIF_KEYS.reminderHour)) ?? "8");
      const m = parseInt((await AsyncStorage.getItem(NOTIF_KEYS.reminderMinute)) ?? "0");
      await preScheduleReminder(h, m, 28);
      return;
    }

    const ids: string[] = JSON.parse(rawIds);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduled.map(n => n.identifier));
    const remaining = ids.filter(id => scheduledIds.has(id)).length;

    if (remaining < 7) {
      const h = parseInt((await AsyncStorage.getItem(NOTIF_KEYS.reminderHour)) ?? "8");
      const m = parseInt((await AsyncStorage.getItem(NOTIF_KEYS.reminderMinute)) ?? "0");
      await preScheduleReminder(h, m, 28);
    }
  } catch {}
}

// ─── Weigh-in Reminder ────────────────────────────────────────────────────────

export async function scheduleWeighInReminder(hour: number, minute: number): Promise<void> {
  if (Platform.OS === "web") return;
  const prevId = await AsyncStorage.getItem(NOTIF_KEYS.weighinId);
  if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});

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
  await AsyncStorage.setItem(NOTIF_KEYS.weighinId,      id);
  await AsyncStorage.setItem(NOTIF_KEYS.weighinEnabled,  "true");
  await AsyncStorage.setItem(NOTIF_KEYS.weighinHour,     String(hour));
  await AsyncStorage.setItem(NOTIF_KEYS.weighinMinute,   String(minute));
}

export async function cancelWeighInReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(NOTIF_KEYS.weighinId);
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await AsyncStorage.removeItem(NOTIF_KEYS.weighinId);
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
  const kudos = PR_KUDOS[Math.floor(Math.random() * PR_KUDOS.length)];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🏆 New PR — ${exerciseName}`,
      body: `${newBest}${unit}${gain}. ${kudos}`,
      sound: true,
    },
    trigger: null,
  });
}

const PR_KUDOS = [
  "That's what ARPO is built for.",
  "You're stronger than last week. Keep going.",
  "Numbers don't lie — you're making progress.",
  "Progression is the point. You're living it.",
  "New ceiling set. Aim higher.",
];

// ─── Preference loading ───────────────────────────────────────────────────────

export type NotificationPrefs = {
  reminderEnabled: boolean;
  reminderHour:    number;
  reminderMinute:  number;
  weighinEnabled:  boolean;
  weighinHour:     number;
  weighinMinute:   number;
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const [re, rh, rm, we, wh, wm,
         // Legacy fallbacks — if old workout reminder was enabled, migrate it
         oldWorkout, oldWorkoutH, oldWorkoutM] = await Promise.all([
    AsyncStorage.getItem(NOTIF_KEYS.reminderEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.reminderHour),
    AsyncStorage.getItem(NOTIF_KEYS.reminderMinute),
    AsyncStorage.getItem(NOTIF_KEYS.weighinEnabled),
    AsyncStorage.getItem(NOTIF_KEYS.weighinHour),
    AsyncStorage.getItem(NOTIF_KEYS.weighinMinute),
    AsyncStorage.getItem(NOTIF_KEYS.workoutEnabled),
    AsyncStorage.getItem("notif_workout_hour"),
    AsyncStorage.getItem("notif_workout_minute"),
  ]);

  // Migrate: if new reminder key is unset but old workout key was enabled, inherit it
  const reminderEnabled = re !== null ? re === "true" : oldWorkout === "true";
  const reminderHour    = rh !== null ? parseInt(rh) : (oldWorkoutH !== null ? parseInt(oldWorkoutH) : 8);
  const reminderMinute  = rm !== null ? parseInt(rm) : (oldWorkoutM !== null ? parseInt(oldWorkoutM) : 0);

  return {
    reminderEnabled,
    reminderHour,
    reminderMinute,
    weighinEnabled: we === "true",
    weighinHour:    wh !== null ? parseInt(wh) : 7,
    weighinMinute:  wm !== null ? parseInt(wm) : 0,
  };
}

// ─── Legacy compat stubs (so old imports don't crash) ─────────────────────────
/** @deprecated Use scheduleReminder instead */
export const scheduleWorkoutReminder = scheduleReminder;
/** @deprecated Use cancelReminder instead */
export const cancelWorkoutReminder   = cancelReminder;
/** @deprecated Streak is now merged into the training reminder */
export const scheduleStreakReminder  = async () => {};
/** @deprecated Streak is now merged into the training reminder */
export const cancelStreakReminder    = async () => {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

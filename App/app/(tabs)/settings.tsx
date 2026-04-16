import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  TextInput,
  Alert,
  Switch,
  Modal,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import { GOAL_META } from "@/utils/volumeLandmarks";
import {
  getUserProfile,
  updateUserUnit,
  updateUserBodyweight,
  updatePlanGoalType,
  switchGymType,
  getAllExercises,
  getWorkoutPlan,
  type GymType,
} from "@/lib/local-db";
import type { GoalType } from "@/utils/volumeLandmarks";
import {
  loadNotificationPrefs,
  scheduleWorkoutReminder,
  scheduleWeighInReminder,
  cancelWorkoutReminder,
  cancelWeighInReminder,
  scheduleStreakReminder,
  cancelStreakReminder,
  requestNotificationPermission,
  formatTime,
  type NotificationPrefs,
} from "@/lib/notifications";
import {
  getStreakInfo,
  getTodaySteps,
  updateStepGoal,
  getStreakNotifSettings,
  updateStreakNotifSettings,
  type StreakInfo,
  type DailyStepsEntry,
} from "@/lib/local-db";
import {
  exportBackup,
  pickAndPreviewBackup,
  restoreBackup,
  type RestorePreview,
  type ARPOBackup,
} from "@/lib/backup";

// ─── Small reusable section header ──────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{
      fontFamily: "Rubik_700Bold",
      fontSize: 10,
      color: Colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 2,
      marginBottom: 8,
      marginTop: 28,
    }}>
      {title}
    </Text>
  );
}

// ─── Pill toggle ─────────────────────────────────────────────────────────────

function PillToggle<T extends string>({
  options,
  value,
  onChange,
  accentColor = Colors.primary,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  accentColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 0 }}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(opt.value);
            }}
            style={({ pressed }) => ({
              flex: 1,
              borderWidth: 1,
              borderColor: active ? accentColor : Colors.border,
              backgroundColor: active ? accentColor + "22" : Colors.bg,
              paddingVertical: 10,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
              borderRightWidth: i < options.length - 1 ? 0 : 1,
            })}
          >
            <Text style={{
              fontFamily: active ? "Rubik_700Bold" : "Rubik_400Regular",
              fontSize: 12,
              color: active ? accentColor : Colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit, refreshUnit } = useUnit();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  // User profile
  const [gender, setGender] = useState("MALE");
  const [experience, setExperience] = useState("BEGINNER");
  const [bodyweightInput, setBodyweightInput] = useState("");

  // Plan settings
  const [goalType, setGoalType] = useState<GoalType>("hypertrophy");
  const [gymType, setGymType] = useState<GymType>("GYM");
  const [templateName, setTemplateName] = useState("");
  const [currentWeek, setCurrentWeek] = useState(1);
  const [hasPlan, setHasPlan] = useState(false);
  const [switchingGym, setSwitchingGym] = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    workoutEnabled: false, workoutHour: 8,  workoutMinute: 0,
    weighinEnabled: false, weighinHour: 7,  weighinMinute: 0,
    streakEnabled:  false, streakHour:  20, streakMinute:  0, streakDays: "daily",
  });
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showWeighinPicker, setShowWeighinPicker] = useState(false);

  // Backup / restore
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{ backup: ARPOBackup; preview: RestorePreview } | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Streak + Steps
  const [streak, setStreak] = useState<StreakInfo>({ current: 0, longest: 0, lastStreakDate: null });
  const [todaySteps, setTodaySteps] = useState<DailyStepsEntry | null>(null);
  const [stepGoalInput, setStepGoalInput] = useState("8000");
  const [savingStepGoal, setSavingStepGoal] = useState(false);
  const [stepGoalSaved, setStepGoalSaved] = useState(false);
  const [showStreakPicker, setShowStreakPicker] = useState(false);
  // Which days of week selected for streak reminder (0=Sun…6=Sat). null = daily
  const [streakReminderDays, setStreakReminderDays] = useState<"daily" | number[]>("daily");

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  async function loadSettings() {
    setLoading(true);
    try {
      const uid = await AsyncStorage.getItem("userId");
      setUserId(uid);

      if (uid) {
        const profile = await getUserProfile(uid);
        if (profile) {
          setGender(profile.gender);
          setExperience(profile.experience);
          setBodyweightInput(profile.bodyweight ? String(profile.bodyweight) : "");
        }
      }

      const pid = await AsyncStorage.getItem("activePlanId");
      setPlanId(pid);

      if (pid) {
        const plan = await getWorkoutPlan(pid);
        if (plan) {
          setHasPlan(true);
          setGoalType(plan.goalType);
          setGymType(plan.gymType);
          setTemplateName(plan.template.name);
          setCurrentWeek(plan.currentWeek);
        }
      } else {
        setHasPlan(false);
      }

      const prefs = await loadNotificationPrefs();
      setNotifPrefs(prefs);
      setStreakReminderDays(prefs.streakDays);

      if (uid) {
        const [s, steps] = await Promise.all([
          getStreakInfo(uid),
          getTodaySteps(uid),
        ]);
        setStreak(s);
        setTodaySteps(steps);
        setStepGoalInput(String(steps.goal));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Unit change ──────────────────────────────────────────────────────────

  async function handleUnitChange(newUnit: "lbs" | "kg") {
    if (!userId || newUnit === unit) return;
    setSaving(true);
    try {
      await updateUserUnit(userId, newUnit);
      await refreshUnit(); // updates UnitContext globally immediately
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── Bodyweight save ──────────────────────────────────────────────────────

  async function handleBodyweightSave() {
    if (!userId) return;
    const val = parseFloat(bodyweightInput);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await updateUserBodyweight(userId, val);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── Goal type change ─────────────────────────────────────────────────────

  async function handleGoalChange(newGoal: GoalType) {
    if (!planId || newGoal === goalType) return;
    Alert.alert(
      "Change Goal?",
      `Switching to ${GOAL_META.find(g => g.key === newGoal)?.label} will update rep targets on future sessions. Current week is unaffected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Change Goal",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await updatePlanGoalType(planId, newGoal);
              setGoalType(newGoal);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              console.error(err);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  // ── Gym type switch ──────────────────────────────────────────────────────

  async function handleGymTypeChange(newGymType: GymType) {
    if (!planId || newGymType === gymType) return;
    const label = newGymType === "HOME" ? "Home Gym" : "Full Gym";
    Alert.alert(
      `Switch to ${label}?`,
      newGymType === "HOME"
        ? "Barbell and machine exercises will be swapped to dumbbell/bodyweight alternatives. Your progress on each exercise is preserved independently."
        : "Exercises will switch back to barbell and machine versions. Your previous full-gym weights will be restored where available.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Switch to ${label}`,
          onPress: async () => {
            setSwitchingGym(true);
            try {
              const exercises = await getAllExercises();
              await switchGymType(planId, newGymType, exercises);
              setGymType(newGymType);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              console.error(err);
            } finally {
              setSwitchingGym(false);
            }
          },
        },
      ]
    );
  }

  // ────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const mesoWeek = ((currentWeek - 1) % 4) + 1;
  const goalMeta = GOAL_META.find(g => g.key === goalType);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>

        {/* Header */}
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <Text style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 22,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 3,
          }}>
            Settings
          </Text>
        </View>

        {/* ── Preferences ── */}
        <SectionHeader title="Preferences" />

        {/* Unit toggle */}
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                Weight Unit
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                Used throughout the app
              </Text>
            </View>
            {saving && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          <PillToggle
            options={[
              { label: "Pounds (lbs)", value: "lbs" },
              { label: "Kilograms (kg)", value: "kg" },
            ]}
            value={unit}
            onChange={handleUnitChange}
          />
        </View>

        {/* Bodyweight */}
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
            Bodyweight
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
            Used to calculate bodyweight exercise targets
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={bodyweightInput}
              onChangeText={setBodyweightInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 185"
              placeholderTextColor={Colors.textMuted}
              style={{
                flex: 1,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontFamily: "Rubik_400Regular",
                fontSize: 14,
                color: Colors.text,
              }}
            />
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 13,
              color: Colors.textMuted,
              alignSelf: "center",
              width: 30,
            }}>
              {unit}
            </Text>
            <Pressable
              onPress={handleBodyweightSave}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingHorizontal: 16,
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Active Plan ── */}
        {hasPlan && (
          <>
            <SectionHeader title="Active Plan" />

            {/* Plan info pill */}
            <View style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderLeftWidth: 3,
              borderLeftColor: Colors.primary,
              padding: 14,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }} numberOfLines={1}>
                  {templateName}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Week {currentWeek} · Meso Week {mesoWeek}
                </Text>
              </View>
              <View style={{
                borderWidth: 1,
                borderColor: goalMeta?.accentColor ?? Colors.border,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 9,
                  color: goalMeta?.accentColor ?? Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}>
                  {goalMeta?.label}
                </Text>
              </View>
            </View>

            {/* Change plan */}
            <Pressable
              onPress={() => router.push("/templates")}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: Colors.border,
                padding: 14,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                  Change Plan
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Browse templates and start a new mesocycle
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>

            {/* Gym type toggle */}
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                    Gym Type
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                    Switches exercises for all remaining sessions
                  </Text>
                </View>
                {switchingGym && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              <PillToggle
                options={[
                  { label: "🏠  Home", value: "HOME" },
                  { label: "🏋️  Full Gym", value: "GYM" },
                ]}
                value={gymType}
                onChange={handleGymTypeChange}
              />
              <Text style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 10,
                color: Colors.textMuted,
                marginTop: 8,
                lineHeight: 15,
              }}>
                {gymType === "HOME"
                  ? "Using dumbbell & bodyweight alternatives. Switch back any time — your full-gym weights are saved."
                  : "Using barbell & machine exercises. Switch to Home any time — your home weights are saved."}
              </Text>
            </View>

            {/* Training goal */}
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
                Training Goal
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
                Changes rep targets and volume ranges from the next session
              </Text>
              <View style={{ gap: 6 }}>
                {GOAL_META.map((g) => (
                  <Pressable
                    key={g.key}
                    onPress={() => handleGoalChange(g.key)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderWidth: 1,
                      borderColor: goalType === g.key ? g.accentColor : Colors.border,
                      borderLeftWidth: 3,
                      borderLeftColor: g.accentColor,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: goalType === g.key ? g.accentColor + "11" : Colors.bg,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <View>
                      <Text style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 12,
                        color: goalType === g.key ? g.accentColor : Colors.text,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}>
                        {g.label}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                        {g.repRange} · {g.setsPerWeek}
                      </Text>
                    </View>
                    {goalType === g.key && (
                      <Ionicons name="checkmark-circle" size={18} color={g.accentColor} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Exercise Library ── */}
        <SectionHeader title="Exercise Library" />
        <Pressable
          onPress={() => router.push("/custom-exercise")}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: Colors.border,
            padding: 14,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{
              width: 34,
              height: 34,
              backgroundColor: Colors.bgAccent,
              borderWidth: 1,
              borderColor: Colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                Custom Exercises
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                Add exercises not in the library
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </Pressable>

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />

        {/* Workout reminder row */}
        {[
          /* ── Workout Reminder ── */
          (() => {
            const enabled = notifPrefs.workoutEnabled;
            const timeStr = formatTime(notifPrefs.workoutHour, notifPrefs.workoutMinute);
            const pickerDate = new Date();
            pickerDate.setHours(notifPrefs.workoutHour, notifPrefs.workoutMinute, 0, 0);

            const onToggle = async (val: boolean) => {
              const updated = { ...notifPrefs, workoutEnabled: val };
              setNotifPrefs(updated);
              if (val) {
                const granted = await requestNotificationPermission();
                if (granted) await scheduleWorkoutReminder(notifPrefs.workoutHour, notifPrefs.workoutMinute);
                else setNotifPrefs({ ...updated, workoutEnabled: false });
              } else {
                await cancelWorkoutReminder();
              }
            };

            const onTimeChange = async (event: DateTimePickerEvent, date?: Date) => {
              if (Platform.OS === "android") setShowWorkoutPicker(false);
              if (event.type === "dismissed" || !date) return;
              const h = date.getHours();
              const m = date.getMinutes();
              const updated = { ...notifPrefs, workoutHour: h, workoutMinute: m };
              setNotifPrefs(updated);
              if (notifPrefs.workoutEnabled) await scheduleWorkoutReminder(h, m);
            };

            return (
              <View key="workout" style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 34, height: 34, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="barbell-outline" size={17} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Workout Reminder</Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                        {enabled ? `Daily at ${timeStr}` : "Off"}
                      </Text>
                    </View>
                  </View>
                  <Switch value={enabled} onValueChange={onToggle} trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.text} />
                </View>
                {enabled && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                      Reminder Time
                    </Text>
                    <Pressable
                      onPress={() => setShowWorkoutPicker(true)}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: 10,
                        borderWidth: 1, borderColor: Colors.primary,
                        backgroundColor: Colors.primary + "11",
                        paddingHorizontal: 14, paddingVertical: 10,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Ionicons name="time-outline" size={16} color={Colors.primary} />
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.primary, flex: 1 }}>{timeStr}</Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>Tap to change</Text>
                    </Pressable>
                    {/* Android: inline picker dialog */}
                    {showWorkoutPicker && Platform.OS === "android" && (
                      <DateTimePicker value={pickerDate} mode="time" display="default" onChange={onTimeChange} />
                    )}
                    {/* iOS: modal with spinner */}
                    {Platform.OS === "ios" && (
                      <Modal visible={showWorkoutPicker} transparent animationType="slide">
                        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
                          <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
                            <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                              <Pressable onPress={() => setShowWorkoutPicker(false)} hitSlop={12}>
                                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                              </Pressable>
                            </View>
                            <DateTimePicker value={pickerDate} mode="time" display="spinner" textColor="#FFFFFF" onChange={onTimeChange} style={{ height: 180 }} />
                          </View>
                        </View>
                      </Modal>
                    )}
                  </View>
                )}
              </View>
            );
          })(),
          /* ── Weigh-in Reminder ── */
          (() => {
            const enabled = notifPrefs.weighinEnabled;
            const timeStr = formatTime(notifPrefs.weighinHour, notifPrefs.weighinMinute);
            const pickerDate = new Date();
            pickerDate.setHours(notifPrefs.weighinHour, notifPrefs.weighinMinute, 0, 0);

            const onToggle = async (val: boolean) => {
              const updated = { ...notifPrefs, weighinEnabled: val };
              setNotifPrefs(updated);
              if (val) {
                const granted = await requestNotificationPermission();
                if (granted) await scheduleWeighInReminder(notifPrefs.weighinHour, notifPrefs.weighinMinute);
                else setNotifPrefs({ ...updated, weighinEnabled: false });
              } else {
                await cancelWeighInReminder();
              }
            };

            const onTimeChange = async (event: DateTimePickerEvent, date?: Date) => {
              if (Platform.OS === "android") setShowWeighinPicker(false);
              if (event.type === "dismissed" || !date) return;
              const h = date.getHours();
              const m = date.getMinutes();
              const updated = { ...notifPrefs, weighinHour: h, weighinMinute: m };
              setNotifPrefs(updated);
              if (notifPrefs.weighinEnabled) await scheduleWeighInReminder(h, m);
            };

            return (
              <View key="weighin" style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 34, height: 34, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="scale-outline" size={17} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Weigh-in Reminder</Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                        {enabled ? `Daily at ${timeStr}` : "Off"}
                      </Text>
                    </View>
                  </View>
                  <Switch value={enabled} onValueChange={onToggle} trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.text} />
                </View>
                {enabled && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                      Reminder Time
                    </Text>
                    <Pressable
                      onPress={() => setShowWeighinPicker(true)}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: 10,
                        borderWidth: 1, borderColor: Colors.primary,
                        backgroundColor: Colors.primary + "11",
                        paddingHorizontal: 14, paddingVertical: 10,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Ionicons name="time-outline" size={16} color={Colors.primary} />
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.primary, flex: 1 }}>{timeStr}</Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>Tap to change</Text>
                    </Pressable>
                    {showWeighinPicker && Platform.OS === "android" && (
                      <DateTimePicker value={pickerDate} mode="time" display="default" onChange={onTimeChange} />
                    )}
                    {Platform.OS === "ios" && (
                      <Modal visible={showWeighinPicker} transparent animationType="slide">
                        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
                          <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
                            <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                              <Pressable onPress={() => setShowWeighinPicker(false)} hitSlop={12}>
                                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                              </Pressable>
                            </View>
                            <DateTimePicker value={pickerDate} mode="time" display="spinner" textColor="#FFFFFF" onChange={onTimeChange} style={{ height: 180 }} />
                          </View>
                        </View>
                      </Modal>
                    )}
                  </View>
                )}
              </View>
            );
          })()
        ]}

        {/* ── Streak ── */}
        <SectionHeader title="Streak" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <View>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                Current Streak
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                Log a workout or weigh-in every day
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 20 }}>🔥</Text>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: "#F59E0B" }}>
                {streak.current}
              </Text>
            </View>
          </View>
          {streak.longest > 0 && (
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
              Personal best: {streak.longest} day{streak.longest !== 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {/* Streak Reminder */}
        {(() => {
          const enabled = notifPrefs.streakEnabled;
          const timeStr = formatTime(notifPrefs.streakHour, notifPrefs.streakMinute);
          const pickerDate = new Date();
          pickerDate.setHours(notifPrefs.streakHour, notifPrefs.streakMinute, 0, 0);
          const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

          const onToggle = async (val: boolean) => {
            const updated = { ...notifPrefs, streakEnabled: val };
            setNotifPrefs(updated);
            if (val) {
              const granted = await requestNotificationPermission();
              if (granted) await scheduleStreakReminder(notifPrefs.streakHour, notifPrefs.streakMinute, streakReminderDays, streak.current);
              else setNotifPrefs({ ...updated, streakEnabled: false });
            } else {
              await cancelStreakReminder();
            }
            if (userId) await updateStreakNotifSettings(userId, { enabled: val, time: `${notifPrefs.streakHour}:${notifPrefs.streakMinute}`, days: streakReminderDays });
          };

          const onTimeChange = async (event: DateTimePickerEvent, date?: Date) => {
            if (Platform.OS === "android") setShowStreakPicker(false);
            if (event.type === "dismissed" || !date) return;
            const h = date.getHours();
            const m = date.getMinutes();
            const updated = { ...notifPrefs, streakHour: h, streakMinute: m };
            setNotifPrefs(updated);
            if (notifPrefs.streakEnabled) await scheduleStreakReminder(h, m, streakReminderDays, streak.current);
            if (userId) await updateStreakNotifSettings(userId, { enabled: notifPrefs.streakEnabled, time: `${h}:${m}`, days: streakReminderDays });
          };

          return (
            <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 34, height: 34, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="flame-outline" size={17} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Streak Reminder</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {enabled
                        ? `${streakReminderDays === "daily" ? "Daily" : `${(streakReminderDays as number[]).length} day(s)/week`} at ${timeStr}`
                        : "Off"}
                    </Text>
                  </View>
                </View>
                <Switch value={enabled} onValueChange={onToggle} trackColor={{ false: Colors.border, true: "#F59E0B" }} thumbColor={Colors.text} />
              </View>
              {enabled && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 }}>
                  {/* Time picker */}
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Time
                  </Text>
                  <Pressable
                    onPress={() => setShowStreakPicker(true)}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 10,
                      borderWidth: 1, borderColor: "#F59E0B",
                      backgroundColor: "#F59E0B11",
                      paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Ionicons name="time-outline" size={16} color="#F59E0B" />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: "#F59E0B", flex: 1 }}>{timeStr}</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>Tap to change</Text>
                  </Pressable>
                  {showStreakPicker && Platform.OS === "android" && (
                    <DateTimePicker value={pickerDate} mode="time" display="default" onChange={onTimeChange} />
                  )}
                  {Platform.OS === "ios" && (
                    <Modal visible={showStreakPicker} transparent animationType="slide">
                      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
                        <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
                          <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                            <Pressable onPress={() => setShowStreakPicker(false)} hitSlop={12}>
                              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1 }}>Done</Text>
                            </Pressable>
                          </View>
                          <DateTimePicker value={pickerDate} mode="time" display="spinner" textColor="#FFFFFF" onChange={onTimeChange} style={{ height: 180 }} />
                        </View>
                      </View>
                    </Modal>
                  )}
                  {/* Day selector */}
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Remind me on
                  </Text>
                  <View style={{ flexDirection: "row", gap: 0 }}>
                    {/* "Every day" option */}
                    <Pressable
                      onPress={async () => {
                        setStreakReminderDays("daily");
                        if (notifPrefs.streakEnabled) await scheduleStreakReminder(notifPrefs.streakHour, notifPrefs.streakMinute, "daily", streak.current);
                        if (userId) await updateStreakNotifSettings(userId, { enabled: notifPrefs.streakEnabled, time: `${notifPrefs.streakHour}:${notifPrefs.streakMinute}`, days: "daily" });
                      }}
                      style={({ pressed }) => ({
                        flex: 1.5, borderWidth: 1, borderRightWidth: 0,
                        borderColor: streakReminderDays === "daily" ? "#F59E0B" : Colors.border,
                        backgroundColor: streakReminderDays === "daily" ? "#F59E0B22" : Colors.bg,
                        paddingVertical: 9, alignItems: "center", opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: streakReminderDays === "daily" ? "Rubik_700Bold" : "Rubik_400Regular", fontSize: 10, color: streakReminderDays === "daily" ? "#F59E0B" : Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Every Day
                      </Text>
                    </Pressable>
                    {/* Individual day toggles */}
                    {DAY_LABELS.map((day, i) => {
                      const isCustom = Array.isArray(streakReminderDays);
                      const isActive = isCustom && (streakReminderDays as number[]).includes(i);
                      return (
                        <Pressable
                          key={day}
                          onPress={async () => {
                            const current = Array.isArray(streakReminderDays) ? [...streakReminderDays] : [];
                            const next = isActive ? current.filter(d => d !== i) : [...current, i].sort();
                            const newDays = next.length === 0 ? "daily" : next;
                            setStreakReminderDays(newDays);
                            if (notifPrefs.streakEnabled) await scheduleStreakReminder(notifPrefs.streakHour, notifPrefs.streakMinute, newDays, streak.current);
                            if (userId) await updateStreakNotifSettings(userId, { enabled: notifPrefs.streakEnabled, time: `${notifPrefs.streakHour}:${notifPrefs.streakMinute}`, days: newDays });
                          }}
                          style={({ pressed }) => ({
                            flex: 1,
                            borderWidth: 1, borderRightWidth: i < 6 ? 0 : 1,
                            borderColor: isActive ? "#F59E0B" : Colors.border,
                            backgroundColor: isActive ? "#F59E0B22" : Colors.bg,
                            paddingVertical: 9, alignItems: "center", opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{ fontFamily: isActive ? "Rubik_700Bold" : "Rubik_400Regular", fontSize: 9, color: isActive ? "#F59E0B" : Colors.textMuted, textTransform: "uppercase" }}>
                            {day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          );
        })()}

        {/* ── Steps ── */}
        <SectionHeader title="Daily Steps" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
            Daily Step Goal
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
            Track steps manually today. Apple Watch & Google Fit sync coming in a future update.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={stepGoalInput}
              onChangeText={setStepGoalInput}
              keyboardType="number-pad"
              placeholder="8000"
              placeholderTextColor={Colors.textMuted}
              style={{
                flex: 1,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontFamily: "Rubik_400Regular",
                fontSize: 14,
                color: Colors.text,
              }}
            />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, alignSelf: "center" }}>
              steps
            </Text>
            <Pressable
              onPress={async () => {
                if (!userId) return;
                const goal = parseInt(stepGoalInput);
                if (isNaN(goal) || goal <= 0) return;
                setSavingStepGoal(true);
                await updateStepGoal(userId, goal);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setSavingStepGoal(false);
                setStepGoalSaved(true);
                setTimeout(() => setStepGoalSaved(false), 2000);
              }}
              disabled={savingStepGoal}
              style={({ pressed }) => ({
                backgroundColor: stepGoalSaved ? "#2E7D32" : Colors.primary,
                paddingHorizontal: 16,
                justifyContent: "center",
                opacity: pressed || savingStepGoal ? 0.8 : 1,
              })}
            >
              {savingStepGoal
                ? <ActivityIndicator color={Colors.text} size="small" />
                : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    {stepGoalSaved ? "Saved ✓" : "Save"}
                  </Text>
              }
            </Pressable>
          </View>
        </View>

        {/* ── Backup & Restore ── */}
        <SectionHeader title="Backup & Restore" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8, padding: 16 }}>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 }}>
            Save a copy of all your workout history, body data, and custom routines. Send it to yourself by email, save it to Google Drive, iCloud, or any cloud storage — and restore it any time if you reinstall or switch phones.
          </Text>

          {/* Export */}
          <Pressable
            onPress={async () => {
              setExportingBackup(true);
              const result = await exportBackup();
              setExportingBackup(false);
              if (!result.success) Alert.alert("Export Failed", result.error ?? "Something went wrong.");
            }}
            disabled={exportingBackup}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: pressed || exportingBackup ? 0.75 : 1,
              marginBottom: 10,
            })}
          >
            {exportingBackup
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
            }
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: "#FFF", textTransform: "uppercase", letterSpacing: 1.5 }}>
              {exportingBackup ? "Preparing..." : "Export Backup"}
            </Text>
          </Pressable>

          {/* Restore */}
          <Pressable
            onPress={async () => {
              const result = await pickAndPreviewBackup();
              if (!result.success) {
                if (result.error !== "No file selected.") Alert.alert("Could Not Read File", result.error);
                return;
              }
              setRestorePreview({ backup: result.backup, preview: result.preview });
            }}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="cloud-download-outline" size={18} color={Colors.textSecondary} />
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Restore from Backup
            </Text>
          </Pressable>
        </View>

        {/* Restore confirmation modal */}
        <Modal
          visible={restorePreview !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setRestorePreview(null)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
            <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, padding: 24, paddingBottom: 36 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Restore This Backup?
              </Text>
              {restorePreview && (
                <>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, marginBottom: 16 }}>
                    Backed up on {new Date(restorePreview.preview.exportedAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                  </Text>
                  {[
                    { label: "Workout sessions", value: restorePreview.preview.workoutSessions },
                    { label: "Weigh-ins", value: restorePreview.preview.weighIns },
                    { label: "Body measurements", value: restorePreview.preview.bodyMeasurements },
                    { label: "Custom routines", value: restorePreview.preview.customTemplates },
                    { label: "Training plans", value: restorePreview.preview.workoutPlans },
                  ].map(item => (
                    <View key={item.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary }}>{item.label}</Text>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>{item.value}</Text>
                    </View>
                  ))}
                  <View style={{ marginTop: 16, borderLeftWidth: 3, borderLeftColor: Colors.warning, paddingLeft: 12, paddingVertical: 6, marginBottom: 20 }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.warning, lineHeight: 18 }}>
                      This will replace all current data on this device. This cannot be undone.
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      if (!restorePreview) return;
                      setRestoring(true);
                      const result = await restoreBackup(restorePreview.backup);
                      setRestoring(false);
                      setRestorePreview(null);
                      if (result.success) {
                        Alert.alert("Restored", "Your backup has been restored. The app will now reload.", [
                          { text: "OK", onPress: () => router.replace("/") },
                        ]);
                      } else {
                        Alert.alert("Restore Failed", result.error ?? "Something went wrong.");
                      }
                    }}
                    disabled={restoring}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.primary,
                      paddingVertical: 16,
                      alignItems: "center",
                      opacity: pressed || restoring ? 0.75 : 1,
                      marginBottom: 10,
                    })}
                  >
                    {restoring
                      ? <ActivityIndicator color="#FFF" />
                      : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "#FFF", textTransform: "uppercase", letterSpacing: 1.5 }}>Restore</Text>
                    }
                  </Pressable>
                  <Pressable
                    onPress={() => setRestorePreview(null)}
                    style={({ pressed }) => ({ paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Cancel</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Profile ── */}
        <SectionHeader title="Profile" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Gender
              </Text>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, textTransform: "capitalize" }}>
                {gender.charAt(0) + gender.slice(1).toLowerCase()}
              </Text>
            </View>
            <View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Experience
              </Text>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, textTransform: "capitalize" }}>
                {experience.charAt(0) + experience.slice(1).toLowerCase()}
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

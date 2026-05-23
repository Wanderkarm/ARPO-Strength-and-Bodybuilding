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
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import { usePurchase, TRIAL_WORKOUTS, UNLOCK_PRICE_LABEL } from "@/contexts/PurchaseContext";
import { GOAL_META } from "@/utils/volumeLandmarks";
import {
  getUserProfile,
  updateUserUnit,
  updateUserBodyweight,
  logBodyWeight,
  updatePlanGoalType,
  updateUserProgressionMode,
  switchGymType,
  getAllExercises,
  getWorkoutPlan,
  getMostRecentBodyWeightKg,
  deleteAllUserData,
  type GymType,
} from "@/lib/local-db";
import type { GoalType } from "@/utils/volumeLandmarks";
import type { ProgressionMode } from "@/utils/progressionAlgorithm";
import {
  loadNotificationPrefs,
  scheduleReminder,
  scheduleWeighInReminder,
  cancelReminder,
  cancelWeighInReminder,
  requestNotificationPermission,
  formatTime,
  type NotificationPrefs,
} from "@/lib/notifications";
import {
  getStreakInfo,
  getTodaySteps,
  updateStepGoal,
  type StreakInfo,
  type DailyStepsEntry,
} from "@/lib/local-db";
import {
  exportBackup,
  pickAndPreviewBackup,
  restoreBackup,
  type RestorePreview,
  type POWRLOGBackup,
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
  const { isPurchased, trialWorkoutsRemaining } = usePurchase();

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
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("arpo");
  const [gymType, setGymType] = useState<GymType>("GYM");
  const [templateName, setTemplateName] = useState("");
  const [currentWeek, setCurrentWeek] = useState(1);
  const [hasPlan, setHasPlan] = useState(false);
  const [switchingGym, setSwitchingGym] = useState(false);
  const [planDaysPerWeek, setPlanDaysPerWeek] = useState(3);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    reminderEnabled: false, reminderHour: 8, reminderMinute: 0,
    weighinEnabled:  false, weighinHour:  7, weighinMinute:  0,
  });
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showWeighinPicker,  setShowWeighinPicker]  = useState(false);

  // Backup / restore
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{ backup: POWRLOGBackup; preview: RestorePreview } | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Streak + Steps
  const [streak, setStreak] = useState<StreakInfo>({ current: 0, longest: 0, lastStreakDate: null });
  const [todaySteps, setTodaySteps] = useState<DailyStepsEntry | null>(null);
  const [stepGoalInput, setStepGoalInput] = useState("8000");
  const [savingStepGoal, setSavingStepGoal] = useState(false);
  const [stepGoalSaved, setStepGoalSaved] = useState(false);
  // Watch / device reminder
  const [watchReminderEnabled, setWatchReminderEnabled] = useState(false);

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
        const [profile, latestWeightKg] = await Promise.all([
          getUserProfile(uid),
          getMostRecentBodyWeightKg(uid),
        ]);
        if (profile) {
          setGender(profile.gender);
          setExperience(profile.experience);
          setProgressionMode(profile.progressionMode ?? "arpo");
          // Prefer most recent weigh-in log; fall back to onboarding profile value
          if (latestWeightKg !== null) {
            const displayWeight =
              unit === "kg"
                ? Math.round(latestWeightKg * 10) / 10
                : Math.round(latestWeightKg * 2.20462 * 10) / 10;
            setBodyweightInput(String(displayWeight));
          } else if (profile.bodyweight) {
            // profile.bodyweight is always stored in kg (set via onboarding with conversion)
            const displayWeight =
              unit === "kg"
                ? Math.round(profile.bodyweight * 10) / 10
                : Math.round(profile.bodyweight * 2.20462 * 10) / 10;
            setBodyweightInput(String(displayWeight));
          }
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
          setPlanDaysPerWeek(plan.template.days.length);
        }
      } else {
        setHasPlan(false);
      }

      const prefs = await loadNotificationPrefs();
      setNotifPrefs(prefs);

      const watchPref = await AsyncStorage.getItem("watchReminderEnabled");
      setWatchReminderEnabled(watchPref === "true");

      if (uid) {
        const [s, steps] = await Promise.all([
          getStreakInfo(uid),
          getTodaySteps(uid),
        ]);
        setStreak(s);
        setTodaySteps(steps);
        if (steps) setStepGoalInput(String(steps.goal));
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
    // Always store in kg so all downstream calcs work regardless of display unit
    const valKg = unit === "lbs" ? Math.round((val / 2.20462) * 10) / 10 : val;
    setSaving(true);
    try {
      await updateUserBodyweight(userId, valKg);
      // Also write to body_weight_logs so the chart on the Body tab stays current
      await logBodyWeight(userId, valKg);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── Progression mode change ──────────────────────────────────────────────

  async function handleProgressionModeChange(newMode: ProgressionMode) {
    if (!userId || newMode === progressionMode) return;
    const label = newMode === "double_progression" ? "Double Progression" : "ARPO (Autoregulation)";
    Alert.alert(
      "Change Progression Method?",
      `Switching to ${label} will affect how targets are calculated from the next session onward.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSaving(true);
            try {
              await updateUserProgressionMode(userId, newMode);
              setProgressionMode(newMode);
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>

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
              returnKeyType="done"
              onSubmitEditing={handleBodyweightSave}
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

            {/* Progression Method */}
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
                Progression Method
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
                How your weights and reps advance each week
              </Text>
              <View style={{ gap: 6 }}>
                {([
                  {
                    key: "arpo" as ProgressionMode,
                    label: "ARPO",
                    subtitle: "Autoregulated Progressive Overload",
                    description: "Adjusts volume using pump & soreness signals. Backed by Schoenfeld 2010 and Helms et al. — ideal for hypertrophy and lifters who want built-in fatigue management.",
                    accentColor: Colors.primary,
                  },
                  {
                    key: "double_progression" as ProgressionMode,
                    label: "Double Progression",
                    subtitle: "Rep → Weight ladder",
                    description: "Hold weight and chase the top of your rep range across all sets. Once you hit it, increase load and reset to the bottom. Simple, proven, and great for strength focus.",
                    accentColor: "#F59E0B",
                  },
                ] as const).map((m) => (
                  <Pressable
                    key={m.key}
                    onPress={() => handleProgressionModeChange(m.key)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: progressionMode === m.key ? m.accentColor : Colors.border,
                      borderLeftWidth: 3,
                      borderLeftColor: m.accentColor,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: progressionMode === m.key ? m.accentColor + "11" : Colors.bg,
                      opacity: pressed ? 0.8 : 1,
                      gap: 4,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View>
                        <Text style={{
                          fontFamily: "Rubik_700Bold",
                          fontSize: 12,
                          color: progressionMode === m.key ? m.accentColor : Colors.text,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}>
                          {m.label}
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 1 }}>
                          {m.subtitle}
                        </Text>
                      </View>
                      {progressionMode === m.key && (
                        <Ionicons name="checkmark-circle" size={18} color={m.accentColor} />
                      )}
                    </View>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginTop: 4 }}>
                      {m.description}
                    </Text>
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

        {/* ── Devices ── */}
        <SectionHeader title="Devices" />

        <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, marginRight: 10 }}>
              <View style={{ width: 34, height: 34, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Text style={{ fontSize: 18, lineHeight: 22 }}>⌚</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                  Workout Tracker Reminder
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                  {watchReminderEnabled
                    ? "Reminds you to start Apple Watch / fitness app at workout start"
                    : "Get a nudge to start your Apple Watch or fitness app"}
                </Text>
              </View>
            </View>
            <Switch
              value={watchReminderEnabled}
              onValueChange={async (val) => {
                setWatchReminderEnabled(val);
                await AsyncStorage.setItem("watchReminderEnabled", val ? "true" : "false");
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.text}
            />
          </View>
          {watchReminderEnabled && (
            <View style={{
              borderTopWidth: 1, borderTopColor: Colors.border,
              paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: Colors.bgAccent,
              flexDirection: "row", alignItems: "flex-start", gap: 8,
            }}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
                When your workout begins, an in-app banner and a notification will remind you to start tracking on your device.
                {Platform.OS === "ios" ? " The notification also vibrates your Apple Watch automatically when your phone is pocketed." : ""}
                {"\n\n"}
                <Text style={{ color: Colors.textMuted, fontStyle: "italic" }}>
                  {Platform.OS === "ios" ? "Apple Health" : "Health Connect"} sync is available via the Body tab. Body weight, body fat % and steps will be pulled from your last recorded entry.
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />

        {/* Training reminder (unified — replaces old workout + streak) */}
        {(() => {
          const enabled  = notifPrefs.reminderEnabled;
          const timeStr  = formatTime(notifPrefs.reminderHour, notifPrefs.reminderMinute);
          const pickerDate = new Date();
          pickerDate.setHours(notifPrefs.reminderHour, notifPrefs.reminderMinute, 0, 0);

          const onToggle = async (val: boolean) => {
            const updated = { ...notifPrefs, reminderEnabled: val };
            setNotifPrefs(updated);
            if (val) {
              const granted = await requestNotificationPermission();
              if (granted) await scheduleReminder(notifPrefs.reminderHour, notifPrefs.reminderMinute);
              else setNotifPrefs({ ...updated, reminderEnabled: false });
            } else {
              await cancelReminder();
            }
          };

          const onTimeChange = async (event: DateTimePickerEvent, date?: Date) => {
            if (Platform.OS === "android") setShowReminderPicker(false);
            if (event.type === "dismissed" || !date) return;
            const h = date.getHours();
            const m = date.getMinutes();
            const updated = { ...notifPrefs, reminderHour: h, reminderMinute: m };
            setNotifPrefs(updated);
            if (notifPrefs.reminderEnabled) await scheduleReminder(h, m);
          };

          return (
            <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 34, height: 34, backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="barbell-outline" size={17} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Training Reminder</Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {enabled ? `Daily at ${timeStr} · rotates messages` : "Off"}
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
                    onPress={() => setShowReminderPicker(true)}
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
                  {showReminderPicker && Platform.OS === "android" && (
                    <DateTimePicker value={pickerDate} mode="time" display="default" onChange={onTimeChange} />
                  )}
                  {Platform.OS === "ios" && (
                    <Modal visible={showReminderPicker} transparent animationType="slide">
                      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
                        <View style={{ backgroundColor: "#1C1C1E", paddingBottom: 20 }}>
                          <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                            <Pressable onPress={() => setShowReminderPicker(false)} hitSlop={12}>
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
        })()}
        {[
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


        {/* ── Steps ── */}
        <SectionHeader title="Daily Steps" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 }}>
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 }}>
            Daily Step Goal
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
            Log your daily steps from the Home tab. Your progress toward this goal is shown there each day.
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

        {/* ── Training Schedule ── */}
        {hasPlan && planId && (
          <>
            <SectionHeader title="Training Schedule" />
            <Pressable
              onPress={() => router.push({
                pathname: "/schedule-picker",
                params: { planId, daysPerWeek: String(planDaysPerWeek), destination: "back" },
              })}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                borderWidth: 1, borderColor: Colors.border,
                paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>
                  Edit Training Days
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Set which days of the week you train
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          </>
        )}

        {/* ── Purchase / Trial status ── */}
        {isPurchased ? (
          <View style={{ borderWidth: 1, borderColor: Colors.primary + "44", borderLeftWidth: 3, borderLeftColor: Colors.primary, backgroundColor: Colors.primary + "0A", padding: 14, marginBottom: 24 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>
              ✓ Full Access
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
              POWRLOG unlocked — thanks for your support.
            </Text>
          </View>
        ) : trialWorkoutsRemaining > 0 ? (
          <Pressable
            onPress={() => router.push("/paywall")}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
              borderLeftColor: "#F59E0B", backgroundColor: "#F59E0B0A",
              padding: 14, marginBottom: 24, opacity: pressed ? 0.8 : 1,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>
                Free Trial — {trialWorkoutsRemaining} session{trialWorkoutsRemaining !== 1 ? "s" : ""} remaining
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                Unlock for {UNLOCK_PRICE_LABEL} — one-time, no subscription.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
          </Pressable>
        ) : null}

        {/* ── Legal ── */}
        <SectionHeader title="Legal" />
        <View style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 8 }}>
          {[
            { label: "Privacy Policy", url: "https://powrlog.com/privacy" },
            { label: "Terms of Use",   url: "https://powrlog.com/terms" },
          ].map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => Linking.openURL(item.url)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 16, paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.text }}>{item.label}</Text>
              <Ionicons name="open-outline" size={15} color={Colors.textMuted} />
            </Pressable>
          ))}
        </View>
        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginBottom: 24, paddingHorizontal: 4 }}>
          POWRLOG is not a medical app. Always consult a physician before beginning any exercise program.
        </Text>

        {/* ── Danger Zone ── */}
        <SectionHeader title="Danger Zone" />
        <View style={{ borderWidth: 1, borderColor: "#E5393522", borderLeftWidth: 3, borderLeftColor: "#E53935", padding: 16, marginBottom: 8 }}>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 }}>
            Permanently delete all your data — workout history, body logs, plans, and profile. This cannot be undone. Export a backup first if you want to keep your data.
          </Text>
          <Pressable
            onPress={() => {
              Alert.alert(
                "Delete All Data",
                "This will permanently erase your entire profile, workout history, body measurements, and all plans. There is no undo.\n\nAre you sure?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete Everything",
                    style: "destructive",
                    onPress: () => {
                      Alert.alert(
                        "Final Confirmation",
                        "Last chance — all data will be gone forever.",
                        [
                          { text: "Go Back", style: "cancel" },
                          {
                            text: "Yes, Delete All",
                            style: "destructive",
                            onPress: async () => {
                              try {
                                await deleteAllUserData();
                                await AsyncStorage.clear();
                                router.replace("/");
                              } catch (err) {
                                Alert.alert("Error", "Something went wrong. Please try again.");
                              }
                            },
                          },
                        ]
                      );
                    },
                  },
                ]
              );
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: "#E53935",
              paddingVertical: 13,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="trash-outline" size={16} color="#E53935" />
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: "#E53935", textTransform: "uppercase", letterSpacing: 1 }}>
              Delete All Data
            </Text>
          </Pressable>
        </View>

        {/* ── Dev Tools (only visible in dev builds, never in production) ── */}
        {__DEV__ && (
          <>
            <SectionHeader title="Dev Tools" />
            <View style={{ borderWidth: 1, borderColor: "#F59E0B44", borderLeftWidth: 3, borderLeftColor: "#F59E0B", padding: 16, marginBottom: 8, gap: 10 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
                These controls are only visible in development builds and are hidden in production.
              </Text>
              {[
                { label: "Reset trial (back to 3 sessions)", value: "0" },
                { label: "Set trial to 1 session left", value: "2" },
                { label: "Expire trial (trigger paywall)", value: "3" },
              ].map(({ label, value }) => (
                <Pressable
                  key={label}
                  onPress={async () => {
                    await AsyncStorage.setItem("trialWorkoutCount", value);
                    Alert.alert("Dev", `trialWorkoutCount set to ${value}. Restart or refocus the app.`);
                  }}
                  style={({ pressed }) => ({
                    borderWidth: 1, borderColor: "#F59E0B",
                    paddingVertical: 11, paddingHorizontal: 14,
                    alignItems: "center", opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

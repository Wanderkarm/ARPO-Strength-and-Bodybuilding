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
  getNutritionProfile,
  type GymType,
} from "@/lib/local-db";
import type { GoalType } from "@/utils/volumeLandmarks";
import {
  loadNotificationPrefs,
  scheduleWorkoutReminder,
  scheduleWeighInReminder,
  cancelWorkoutReminder,
  cancelWeighInReminder,
  requestNotificationPermission,
  formatTime,
  type NotificationPrefs,
} from "@/lib/notifications";

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
  const [nutritionConfigured, setNutritionConfigured] = useState(false);

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
  });
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showWeighinPicker, setShowWeighinPicker] = useState(false);

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
        const nutrition = await getNutritionProfile(uid);
        setNutritionConfigured(!!(nutrition?.heightCm && nutrition?.age));
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

        {/* ── Tools ── */}
        <SectionHeader title="Tools" />
        {[
          {
            route: "/one-rep-max",
            icon: "barbell-outline",
            title: "1RM Calculator",
            subtitle: "Estimate your one-rep max from any set",
          },
          {
            route: "/body-weight-log",
            icon: "scale-outline",
            title: "Bodyweight Log",
            subtitle: "Track weight with 7-day rolling average",
          },
          {
            route: "/body-measurements",
            icon: "body-outline",
            title: "Body Measurements",
            subtitle: "Chest, waist, arms, thighs and more",
          },
          {
            route: "/custom-exercise",
            icon: "add-circle-outline",
            title: "Custom Exercises",
            subtitle: "Add exercises not in the library",
          },
        ].map((item, i) => (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route as any)}
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
                <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                  {item.title}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  {item.subtitle}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        ))}

        {/* ── Nutrition ── */}
        <SectionHeader title="Nutrition" />
        <Pressable
          onPress={() => router.push(nutritionConfigured ? "/nutrition" : "/nutrition-setup")}
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
              <Ionicons name="nutrition-outline" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                Nutrition Targets
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                {nutritionConfigured
                  ? "Calories, macros & meal examples"
                  : "Set up your calorie & macro targets"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {!nutritionConfigured && (
              <View style={{
                backgroundColor: Colors.primary + "22",
                borderWidth: 1,
                borderColor: Colors.primary + "55",
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  New
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </View>
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
          })()
        }
        {
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

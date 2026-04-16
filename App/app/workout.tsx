import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Switch,
  FlatList,
  Alert,
  useWindowDimensions,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import ExerciseGuide from "@/components/ExerciseGuide";
import ExerciseVideoPlayer from "@/components/ExerciseVideoPlayer";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import RestTimer from "@/components/RestTimer";
import GlossaryTerm from "@/components/GlossaryTerm";
import { calculateRestTime } from "@/utils/restTimer";
import {
  getWorkoutPlan,
  getAllExercises,
  updateSetLog,
  resetWorkoutDay,
  swapExercise as swapExerciseDb,
  resetExerciseToOriginal as resetExerciseToOriginalDb,
  resetAllExercisesToOriginal as resetAllExercisesToOriginalDb,
  completeWorkout,
  updateExercise,
  type WorkoutPlan,
  type Exercise,
} from "@/lib/local-db";

interface SetState {
  setLogId: string;
  setNumber: number;
  targetWeight: number;
  targetReps: number;
  repsCompleted: string;
  weightUsed: string;
  feedback: { text: string; color: string } | null;
}

interface ExerciseState {
  logId: string;
  exerciseId: string;
  exercise: Exercise;
  targetSets: number;
  targetWeight: number;
  targetRIR: string;
  sorenessRating: number | null;
  pumpRating: number | null;
  sets: SetState[];
}

const RECOVERY_OPTIONS = [
  { value: -2, label: "-2", desc: "Very Fatigued" },
  { value: -1, label: "-1", desc: "Fatigued" },
  { value: 0, label: "0", desc: "Recovered" },
  { value: 1, label: "+1", desc: "Fresh" },
  { value: 2, label: "+2", desc: "Very Fresh" },
];

const TOUR_STEPS = [
  {
    title: "The Goal & The Reality",
    text: "Here is your target. If it is too heavy today, just enter the weight and reps you actually completed on the right.",
  },
  {
    title: "Muscle Map & Instructions",
    text: "Each exercise shows which muscles are targeted and step-by-step form cues. Study these before your first set.",
  },
  {
    title: "Watch The Movement",
    text: "Every exercise comes pre-loaded with a YouTube tutorial. Tap the red play button to open it. You can also paste in any YouTube link you prefer — tap the pencil icon to customise.",
  },
  {
    title: "The Algorithm",
    text: "After finishing all exercises, rate your effort here. Be honest — this dictates how ARPO adjusts your weight next session.",
  },
];

type Rect = { x: number; y: number; width: number; height: number };

function getFeedback(
  repsCompleted: number,
  weightUsed: number,
  targetWeight: number,
  targetReps: number,
  isBodyweight = false
): { text: string; color: string } {
  const hitTarget = isBodyweight
    ? repsCompleted >= targetReps
    : repsCompleted >= targetReps && weightUsed >= targetWeight;
  if (hitTarget) {
    return {
      text: "Target exceeded. Progressive overload achieved.",
      color: Colors.success,
    };
  }
  return {
    text: "Below target. Autoregulation will adjust next week.",
    color: Colors.warning,
  };
}

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { unit } = useUnit();

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [dayNumber, setDayNumber] = useState(1);
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [homeGymOnly, setHomeGymOnly] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [allExercisesList, setAllExercisesList] = useState<Exercise[]>([]);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pendingSwapExerciseId, setPendingSwapExerciseId] = useState<string | null>(null);
  const [swapScopeVisible, setSwapScopeVisible] = useState(false);
  const [restoringExercise, setRestoringExercise] = useState(false);
  const [incompleteModalVisible, setIncompleteModalVisible] = useState(false);
  const [restTimerVisible, setRestTimerVisible] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [restTimerKey, setRestTimerKey] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [videoPlayerVisible, setVideoPlayerVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const exerciseStatesRef = useRef<ExerciseState[]>([]);
  const { height: screenHeight } = useWindowDimensions();

  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  const setTableRef = useRef<View>(null);
  const guideRef = useRef<View>(null);
  const videoButtonRef = useRef<View>(null);
  const actionBarRef = useRef<View>(null);
  const weightInputRefs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => {
    loadPlan();
  }, []);

  async function loadPlan() {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (planId) {
      const p = await getWorkoutPlan(planId);
      setPlan(p);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    if (plan) {
      const currentDayNum = plan.currentDay || 1;
      setDayNumber(currentDayNum);

      const todayLogs = plan.logs.filter(
        (l) =>
          l.weekNumber === plan.currentWeek &&
          l.dayNumber === currentDayNum &&
          !l.completedAt
      );

      if (todayLogs.length === 0) {
        if (!plan.isActive) {
          router.replace("/templates");
        } else {
          router.replace("/(tabs)");
        }
        return;
      }

      const states: ExerciseState[] = todayLogs.map((log) => ({
        logId: log.id,
        exerciseId: log.exerciseId,
        exercise: log.exercise,
        targetSets: log.targetSets,
        targetWeight: log.targetWeight,
        targetRIR: log.targetRIR,
        sorenessRating: log.sorenessRating ?? 0,
        pumpRating: log.pumpRating ?? 3,
        sets: (log.sets || []).map((s) => {
          const hasData = s.repsCompleted !== null && s.weightUsed !== null;
          return {
            setLogId: s.id,
            setNumber: s.setNumber,
            targetWeight: s.targetWeight,
            targetReps: s.targetReps,
            repsCompleted: s.repsCompleted !== null ? String(s.repsCompleted) : "",
            weightUsed: s.weightUsed !== null ? String(s.weightUsed) : "",
            feedback: hasData
              ? getFeedback(s.repsCompleted!, s.weightUsed!, s.targetWeight, s.targetReps)
              : null,
          };
        }),
      }));

      setExerciseStates(states);

      AsyncStorage.getItem("hasCompletedWorkoutTour").then((done) => {
        if (!done) {
          setTimeout(() => startTour(), 1000);
        }
      });
    }
  }, [plan]);

  const tourRefs = [setTableRef, guideRef, videoButtonRef, actionBarRef];

  async function measureStep(step: number) {
    if (step === 1) {
      scrollRef.current?.scrollToEnd({ animated: false });
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    await new Promise<void>((r) => setTimeout(r, 180));
    tourRefs[step]?.current?.measureInWindow((x, y, width, height) => {
      const pad = 6;
      setSpotlight({ x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 });
    });
  }

  async function startTour() {
    setTourStep(0);
    setTourVisible(true);
    await measureStep(0);
  }

  async function tourNext() {
    const next = tourStep + 1;
    if (next >= TOUR_STEPS.length) {
      closeTour();
      return;
    }
    setTourStep(next);
    setSpotlight(null);
    await measureStep(next);
  }

  async function tourPrev() {
    const prev = tourStep - 1;
    if (prev < 0) return;
    setTourStep(prev);
    setSpotlight(null);
    await measureStep(prev);
  }

  function closeTour() {
    setTourVisible(false);
    setSpotlight(null);
    AsyncStorage.setItem("hasCompletedWorkoutTour", "true");
  }

  function handleWeightEndEditing(exIndex: number, si: number, setData: SetState) {
    const num = parseFloat(setData.weightUsed);
    if (isNaN(num) || num <= 0 || setData.targetWeight <= 0) return;
    if (num > setData.targetWeight * 1.2) {
      const refKey = `${exIndex}-${si}`;
      Alert.alert(
        "Massive Jump Detected",
        `You entered ${num}, which is a huge jump from your target of ${setData.targetWeight}. Is this correct?`,
        [
          {
            text: "No, let me fix it",
            onPress: () => {
              updateSet(exIndex, si, "weightUsed", "");
              setTimeout(() => weightInputRefs.current[refKey]?.focus(), 150);
            },
          },
          { text: "Yes, I crushed it", style: "default" },
        ]
      );
    }
  }

  function updateSet(
    exIndex: number,
    setIndex: number,
    field: keyof SetState,
    value: string | { text: string; color: string } | null
  ) {
    setExerciseStates((prev) => {
      const updated = [...prev];
      const ex = { ...updated[exIndex] };
      const sets = [...ex.sets];
      sets[setIndex] = { ...sets[setIndex], [field]: value };
      ex.sets = sets;
      updated[exIndex] = ex;
      return updated;
    });
  }

  function updateExerciseRating(exIndex: number, type: "soreness" | "pump", value: number) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExerciseStates((prev) => {
      const updated = [...prev];
      if (type === "soreness") {
        updated[exIndex] = { ...updated[exIndex], sorenessRating: value };
      } else {
        updated[exIndex] = { ...updated[exIndex], pumpRating: value };
      }
      return updated;
    });
  }

  async function handleSetRepsChange(exIndex: number, setIndex: number, value: string) {
    updateSet(exIndex, setIndex, "repsCompleted", value);
    const num = parseInt(value);
    if (!isNaN(num)) {
      const ex = exerciseStates[exIndex];
      const setLogId = ex.sets[setIndex].setLogId;
      await updateSetLog(setLogId, { repsCompleted: num });
      // Bodyweight exercises don't require a weight entry — auto-commit 0
      if (ex.exercise.equipment === "BODYWEIGHT") {
        updateSet(exIndex, setIndex, "weightUsed", "0");
        await updateSetLog(setLogId, { weightUsed: 0 });
      }
    }
  }

  async function handleSetWeightChange(exIndex: number, setIndex: number, value: string) {
    updateSet(exIndex, setIndex, "weightUsed", value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const setLogId = exerciseStates[exIndex].sets[setIndex].setLogId;
      await updateSetLog(setLogId, { weightUsed: num });
    }
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
  }, [exerciseStates]);

  function handleFieldBlur(exIndex: number, setIndex: number) {
    setTimeout(() => {
      setExerciseStates((current) => {
        const ex = current[exIndex];
        if (!ex) return current;
        const set = ex.sets[setIndex];
        if (!set || set.feedback) return current;
        const isBodyweight = ex.exercise.equipment === "BODYWEIGHT";
        const reps = parseInt(set.repsCompleted);
        if (isNaN(reps) || reps <= 0) return current;
        if (!isBodyweight) {
          const weight = parseFloat(set.weightUsed);
          if (isNaN(weight) || weight <= 0) return current;
        }

        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const weight = parseFloat(set.weightUsed) || 0;
        const feedback = getFeedback(reps, weight, set.targetWeight, set.targetReps, isBodyweight);

        const updated = [...current];
        const updatedEx = { ...updated[exIndex] };
        const updatedSets = [...updatedEx.sets];
        updatedSets[setIndex] = { ...updatedSets[setIndex], feedback };
        updatedEx.sets = updatedSets;
        updated[exIndex] = updatedEx;

        const isLastSet = setIndex === updatedEx.sets.length - 1;
        if (!isLastSet) {
          const category = updatedEx.exercise.category;
          const restSeconds = calculateRestTime(category);
          setRestTimerSeconds(restSeconds);
          setRestTimerKey((prev) => prev + 1);
          setRestTimerVisible(true);
          setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }

        return updated;
      });
    }, 150);
  }

  function autoLogSet(exIndex: number, setIndex: number, reps: number, weight: number) {
    const states = exerciseStatesRef.current;
    const ex = states[exIndex];
    if (!ex) return;
    const set = ex.sets[setIndex];
    if (!set || set.feedback) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const isBodyweight = ex.exercise.equipment === "BODYWEIGHT";
    const feedback = getFeedback(reps, weight, set.targetWeight, set.targetReps, isBodyweight);
    updateSet(exIndex, setIndex, "feedback", feedback);

    const isLastSet = setIndex === ex.sets.length - 1;
    if (!isLastSet) {
      const category = ex.exercise.category;
      const restSeconds = calculateRestTime(category);
      setRestTimerSeconds(restSeconds);
      setRestTimerKey((prev) => prev + 1);
      setRestTimerVisible(true);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }

  function handleLogSet(exIndex: number, setIndex: number) {
    const ex = exerciseStates[exIndex];
    const set = ex.sets[setIndex];
    const isBodyweightEx = ex.exercise.equipment === "BODYWEIGHT";
    const reps = parseInt(set.repsCompleted);
    if (isNaN(reps)) return;
    const weight = isBodyweightEx ? 0 : parseFloat(set.weightUsed);
    if (!isBodyweightEx && isNaN(weight)) return;
    autoLogSet(exIndex, setIndex, reps, weight);
  }

  function handleNextExercise() {
    const currentEx = exerciseStates[currentExerciseIndex];
    if (!isExerciseComplete(currentEx)) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIncompleteModalVisible(true);
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRestTimerVisible(false);
    if (currentExerciseIndex < exerciseStates.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
    }
  }

  function handlePrevExercise() {
    setRestTimerVisible(false);
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
    }
  }

  function openEditModal() {
    const ex = exerciseStates[currentExerciseIndex];
    setEditName(ex.exercise.name);
    setEditVideoUrl(ex.exercise.defaultVideoUrl || "");
    setEditModalVisible(true);
  }

  async function handleSaveExercise() {
    const ex = exerciseStates[currentExerciseIndex];
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    setEditSaving(true);
    try {
      const newVideoUrl = editVideoUrl.trim() || null;
      await updateExercise(ex.exercise.id, trimmedName, newVideoUrl);
      setExerciseStates((prev) =>
        prev.map((s, i) =>
          i === currentExerciseIndex
            ? { ...s, exercise: { ...s.exercise, name: trimmedName, defaultVideoUrl: newVideoUrl } }
            : s
        )
      );
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
    } catch {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setEditSaving(false);
    }
  }

  function isExerciseComplete(ex: ExerciseState): boolean {
    const bw = ex.exercise.equipment === "BODYWEIGHT";
    return ex.sets.every((s) => bw ? s.repsCompleted !== "" : s.repsCompleted !== "" && s.weightUsed !== "");
  }

  function canFinish(): boolean {
    return exerciseStates.every(isExerciseComplete);
  }

  async function handleFinishWorkout() {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) return;
    if (!canFinish()) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const firstIncomplete = exerciseStates.findIndex((ex) => !isExerciseComplete(ex));
      if (firstIncomplete >= 0) setCurrentExerciseIndex(firstIncomplete);
      setIncompleteModalVisible(true);
      return;
    }
    // Ratings are collected inline per exercise — proceed directly to completion
    handleConfirmRecovery();
  }

  async function handleConfirmRecovery() {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) return;
    setFinishing(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const exercises = exerciseStates.map((ex) => ({
        logId: ex.logId,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exercise.name,
        category: ex.exercise.category,
        targetSets: ex.targetSets,
        targetWeight: ex.targetWeight,
        targetRIR: ex.targetRIR,
        sorenessRating: ex.sorenessRating ?? 0,
        pumpRating: ex.pumpRating ?? 3,
        sets: ex.sets.map((s) => ({
          setLogId: s.setLogId,
          repsCompleted: parseInt(s.repsCompleted) || 0,
          weightUsed: parseFloat(s.weightUsed) || 0,
          targetReps: s.targetReps,
        })),
      }));

      const result = await completeWorkout(planId, dayNumber, exercises);
      const currentRIR = exerciseStates.length > 0 ? exerciseStates[0].targetRIR : "";

      if (result.isMesoComplete) {
        router.replace({ pathname: "/meso-complete", params: { planId } });
      } else {
        router.replace({
          pathname: "/summary",
          params: {
            totalVolume: String(result.totalVolume),
            weekNumber: String(result.weekNumber),
            dayNumber: String(result.dayNumber),
            exerciseCount: String(exercises.length),
            nextWeekTargets: JSON.stringify(result.nextWeekTargets),
            currentRIR,
          },
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFinishing(false);
    }
  }

  async function handleSkipExercise() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const exIndex = currentExerciseIndex;
    const ex = exerciseStates[exIndex];

    for (let i = 0; i < ex.sets.length; i++) {
      if (ex.sets[i].repsCompleted === "") {
        updateSet(exIndex, i, "repsCompleted", "0");
        await updateSetLog(ex.sets[i].setLogId, { repsCompleted: 0 });
      }
      if (ex.sets[i].weightUsed === "") {
        updateSet(exIndex, i, "weightUsed", "0");
        await updateSetLog(ex.sets[i].setLogId, { weightUsed: 0 });
      }
    }

    setIncompleteModalVisible(false);
    if (currentExerciseIndex < exerciseStates.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
    }
  }

  async function handleResetWorkout() {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId || !plan) return;
    setResetting(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await resetWorkoutDay(planId, plan.currentWeek, dayNumber);
      setResetModalVisible(false);
      setCurrentExerciseIndex(0);
      const p = await getWorkoutPlan(planId);
      setPlan(p);
    } catch (err) {
      console.error(err);
    } finally {
      setResetting(false);
    }
  }

  const currentCategory = exerciseStates[currentExerciseIndex]?.exercise?.category;
  const currentExerciseId = exerciseStates[currentExerciseIndex]?.exerciseId;

  useEffect(() => {
    if (swapModalVisible) {
      getAllExercises().then(setAllExercisesList);
    }
  }, [swapModalVisible]);

  const filteredExercises = allExercisesList.filter((ex) => {
    if (ex.id === currentExerciseId) return false;
    if (ex.category !== currentCategory) return false;
    if (homeGymOnly && ex.equipment !== "DUMBBELL" && ex.equipment !== "BODYWEIGHT") return false;
    return true;
  });

  function handleSelectForSwap(newExerciseId: string) {
    setPendingSwapExerciseId(newExerciseId);
    setSwapModalVisible(false);
    setSwapScopeVisible(true);
  }

  async function handleConfirmSwap(scope: 'once' | 'permanent') {
    if (!pendingSwapExerciseId) return;
    const logId = exerciseStates[currentExerciseIndex]?.logId;
    if (!logId) return;
    setSwapping(true);
    setSwapScopeVisible(false);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const updated = await swapExerciseDb(logId, pendingSwapExerciseId, scope);
      if (updated) {
        setExerciseStates((prev) => {
          const next = [...prev];
          next[currentExerciseIndex] = {
            ...next[currentExerciseIndex],
            exerciseId: updated.exerciseId,
            exercise: updated.exercise,
            sets: (updated.sets || []).map((s) => ({
              setLogId: s.id,
              setNumber: s.setNumber,
              targetWeight: s.targetWeight,
              targetReps: s.targetReps,
              repsCompleted: "",
              weightUsed: "",
              feedback: null,
            })),
            sorenessRating: null,
            pumpRating: null,
          };
          return next;
        });
      }
      setHomeGymOnly(false);
      setPendingSwapExerciseId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSwapping(false);
    }
  }

  async function handleRestoreThisExercise() {
    const logId = exerciseStates[currentExerciseIndex]?.logId;
    if (!logId) return;
    setRestoringExercise(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = await resetExerciseToOriginalDb(logId);
      if (updated) {
        setExerciseStates((prev) => {
          const next = [...prev];
          next[currentExerciseIndex] = {
            ...next[currentExerciseIndex],
            exerciseId: updated.exerciseId,
            exercise: updated.exercise,
            sets: (updated.sets || []).map((s) => ({
              setLogId: s.id,
              setNumber: s.setNumber,
              targetWeight: s.targetWeight,
              targetReps: s.targetReps,
              repsCompleted: s.repsCompleted !== null ? String(s.repsCompleted) : "",
              weightUsed: s.weightUsed !== null ? String(s.weightUsed) : "",
              feedback: null,
            })),
          };
          return next;
        });
      }
      setResetModalVisible(false);
    } catch (err) {
      console.error(err);
    } finally {
      setRestoringExercise(false);
    }
  }

  async function handleRestoreAllExercises() {
    const storedPlanId = await AsyncStorage.getItem("activePlanId");
    if (!storedPlanId) return;
    setRestoringExercise(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await resetAllExercisesToOriginalDb(storedPlanId);
      setResetModalVisible(false);
      // Reload plan — useEffect will re-derive exerciseStates
      const p = await getWorkoutPlan(storedPlanId);
      setPlan(p);
      setCurrentExerciseIndex(0);
    } catch (err) {
      console.error(err);
    } finally {
      setRestoringExercise(false);
    }
  }

  if (isLoading || exerciseStates.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const currentEx = exerciseStates[currentExerciseIndex];
  const isLastExercise = currentExerciseIndex === exerciseStates.length - 1;
  const isBodyweight = currentEx.exercise.equipment === "BODYWEIGHT";
  const allSetsLogged = currentEx.sets.every((s) =>
    isBodyweight ? s.repsCompleted !== "" : s.repsCompleted !== "" && s.weightUsed !== ""
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, paddingBottom: bottomInset }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}
      >
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            Day {dayNumber}
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            Week {plan?.currentWeek}
            {plan && ((plan.currentWeek - 1) % 4) + 1 === 4 ? " · DELOAD" : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.primary }}>
            {currentExerciseIndex + 1}/{exerciseStates.length}
          </Text>
          <Pressable onPress={startTour} hitSlop={12}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 2, paddingVertical: 8 }}>
        {exerciseStates.map((ex, i) => (
          <Pressable
            key={ex.logId}
            onPress={() => setCurrentExerciseIndex(i)}
            style={{
              flex: 1,
              height: 3,
              backgroundColor:
                i === currentExerciseIndex
                  ? Colors.primary
                  : isExerciseComplete(ex)
                    ? Colors.success
                    : Colors.border,
            }}
          />
        ))}
      </View>

      {/* Deload week banner */}
      {plan && ((plan.currentWeek - 1) % 4) + 1 === 4 && (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginTop: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: "#F59E0B55",
          borderLeftWidth: 3,
          borderLeftColor: "#F59E0B",
          backgroundColor: "#F59E0B11",
        }}>
          <Ionicons name="battery-charging-outline" size={16} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1 }}>
              Deload Week
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
              Reduced volume, same weight. Focus on form and recovery.
            </Text>
          </View>
        </View>
      )}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>
            {currentEx.exercise.name}
          </Text>
          <View style={{ flexDirection: "row", gap: 4, marginLeft: 6, flexShrink: 0 }}>
            <Pressable
              testID="edit-exercise-btn"
              onPress={openEditModal}
              hitSlop={10}
              style={{ width: 32, height: 32, borderWidth: 1, borderColor: Colors.border, justifyContent: "center", alignItems: "center" }}
            >
              <Ionicons name="pencil" size={14} color={Colors.textMuted} />
            </Pressable>
            <Pressable
              testID="reset-workout-btn"
              onPress={() => setResetModalVisible(true)}
              hitSlop={10}
              style={{ width: 32, height: 32, borderWidth: 1, borderColor: Colors.border, justifyContent: "center", alignItems: "center" }}
            >
              <Ionicons name="refresh" size={14} color={Colors.textMuted} />
            </Pressable>
            <Pressable
              testID="swap-exercise-btn"
              onPress={() => setSwapModalVisible(true)}
              hitSlop={10}
              style={{ width: 32, height: 32, borderWidth: 1, borderColor: Colors.border, justifyContent: "center", alignItems: "center" }}
            >
              <Ionicons name="swap-horizontal" size={14} color={Colors.textMuted} />
            </Pressable>
            <View ref={videoButtonRef} style={{ flexDirection: "row", alignItems: "center" }}>
              {currentEx.exercise.defaultVideoUrl ? (
                <Pressable
                  testID="video-link-btn"
                  onPress={() => setVideoPlayerVisible(true)}
                  hitSlop={10}
                  style={{ width: 32, height: 32, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}
                >
                  <Ionicons name="play" size={14} color={Colors.primary} />
                </Pressable>
              ) : (
                <View style={{ width: 32, height: 32, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}>
                  <Ionicons name="play" size={14} color={Colors.textMuted} />
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            {currentEx.exercise.category}
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>|</Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            {currentEx.exercise.equipment}
          </Text>
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>|</Text>
          <GlossaryTerm
            text={`RIR ${currentEx.targetRIR.replace(" RIR", "")}`}
            termKey="RIR"
            style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}
          />
        </View>

        <View ref={setTableRef} style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgAccent }}>
            <View style={{ width: 40, paddingVertical: 8, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Set
              </Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 8, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Target
              </Text>
            </View>
            {!isBodyweight && (
              <View style={{ flex: 1, paddingVertical: 8, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  {unit}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, paddingVertical: 8, alignItems: "center" }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Reps
              </Text>
            </View>
          </View>

          {currentEx.sets.map((set, si) => {
            const isSetDone = isBodyweight
              ? set.repsCompleted !== ""
              : set.repsCompleted !== "" && set.weightUsed !== "";
            return (
              <View key={set.setLogId}>
                <View
                  style={{
                    flexDirection: "row",
                    borderBottomWidth: si < currentEx.sets.length - 1 || set.feedback ? 1 : 0,
                    borderBottomColor: Colors.border,
                    alignItems: "center",
                  }}
                >
                  <View style={{ width: 40, paddingVertical: 10, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: isSetDone ? Colors.success : Colors.text }}>
                      {set.setNumber}
                    </Text>
                  </View>

                  <View style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>
                      {isBodyweight ? `BW × ${set.targetReps}` : `${set.targetWeight} ${unit} × ${set.targetReps}`}
                    </Text>
                  </View>

                  {!isBodyweight && (
                    <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: Colors.border }}>
                      <TextInput
                        ref={(r) => { weightInputRefs.current[`${currentExerciseIndex}-${si}`] = r; }}
                        value={set.weightUsed}
                        onChangeText={(v) => handleSetWeightChange(currentExerciseIndex, si, v)}
                        onBlur={() => handleFieldBlur(currentExerciseIndex, si)}
                        onEndEditing={() => handleWeightEndEditing(currentExerciseIndex, si, set)}
                        keyboardType="numeric"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                        style={{
                          fontFamily: "Rubik_700Bold",
                          fontSize: 16,
                          color: Colors.text,
                          paddingVertical: 10,
                          textAlign: "center",
                        }}
                      />
                    </View>
                  )}

                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                    <TextInput
                      value={set.repsCompleted}
                      onChangeText={(v) => handleSetRepsChange(currentExerciseIndex, si, v)}
                      onBlur={() => handleFieldBlur(currentExerciseIndex, si)}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor={Colors.textMuted}
                      style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 16,
                        color: Colors.text,
                        paddingVertical: 10,
                        textAlign: "center",
                        flex: 1,
                      }}
                    />
                    {isSetDone && !set.feedback && (
                      <Pressable
                        onPress={() => handleLogSet(currentExerciseIndex, si)}
                        hitSlop={8}
                        style={{ paddingRight: 8 }}
                      >
                        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      </Pressable>
                    )}
                    {set.feedback && (
                      <View style={{ paddingRight: 8 }}>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={set.feedback.color}
                        />
                      </View>
                    )}
                  </View>
                </View>

                {set.feedback && (
                  <View
                    style={{
                      borderBottomWidth: si < currentEx.sets.length - 1 ? 1 : 0,
                      borderBottomColor: Colors.border,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: Colors.bg,
                      borderLeftWidth: 3,
                      borderLeftColor: set.feedback.color,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Rubik_500Medium",
                        fontSize: 11,
                        color: set.feedback.color,
                        fontStyle: "italic",
                        lineHeight: 16,
                      }}
                    >
                      {set.feedback.text}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Per-exercise ratings — appear inline as soon as all sets are complete */}
        {isExerciseComplete(currentEx) && (
          <View
            onLayout={(e) => {
              // Auto-scroll to the rating strip the moment it first appears
              const y = e.nativeEvent.layout.y;
              setTimeout(() => scrollRef.current?.scrollTo({ y: y - 16, animated: true }), 80);
            }}
            style={{ marginHorizontal: 20, marginTop: 20, borderWidth: 1, borderColor: Colors.primary + "66", padding: 16 }}
          >
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
              Rate This Exercise
            </Text>

            {/* Recovery row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, width: 60 }}>
                Recovery
              </Text>
              <View style={{ flexDirection: "row", flex: 1, gap: 4 }}>
                {RECOVERY_OPTIONS.map((opt) => {
                  const isSelected = currentEx.sorenessRating === opt.value;
                  const activeColor = opt.value >= 1 ? Colors.success : opt.value <= -1 ? Colors.danger : Colors.text;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => updateExerciseRating(currentExerciseIndex, "soreness", opt.value)}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderWidth: 1,
                        borderColor: isSelected ? activeColor : Colors.border,
                        backgroundColor: isSelected ? Colors.bg : "transparent",
                        paddingVertical: 9,
                        alignItems: "center",
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: isSelected ? activeColor : Colors.textMuted }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Pump row */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, width: 60 }}>
                Pump
              </Text>
              <View style={{ flexDirection: "row", flex: 1, gap: 4 }}>
                {[1, 2, 3, 4, 5].map((v) => {
                  const isSelected = currentEx.pumpRating === v;
                  const activeColor = v <= 2 ? Colors.warning : v >= 5 ? Colors.danger : Colors.primary;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => updateExerciseRating(currentExerciseIndex, "pump", v)}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderWidth: 1,
                        borderColor: isSelected ? activeColor : Colors.border,
                        backgroundColor: isSelected ? Colors.bg : "transparent",
                        paddingVertical: 9,
                        alignItems: "center",
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: isSelected ? activeColor : Colors.textMuted }}>
                        {v}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {restTimerVisible && (
          <RestTimer
            key={restTimerKey}
            initialSeconds={restTimerSeconds}
            onDismiss={() => setRestTimerVisible(false)}
          />
        )}

        {/* Exercise guide — anatomy map + breakdown + instructions */}
        <View ref={guideRef}>
          <ExerciseGuide exercise={currentEx.exercise} />
        </View>

        {/* Bottom padding so the guide doesn't sit right against the action bar */}
        <View style={{ height: 28 }} />
      </ScrollView>

      <View ref={actionBarRef} style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {currentExerciseIndex > 0 && (
            <Pressable
              onPress={handlePrevExercise}
              style={({ pressed }) => ({
                flex: 1,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingVertical: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
                Previous
              </Text>
            </Pressable>
          )}

          {isLastExercise ? (
            <Pressable
              onPress={handleFinishWorkout}
              disabled={finishing}
              style={({ pressed }) => ({
                flex: 2,
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {finishing ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textAlign: "center", textTransform: "uppercase", letterSpacing: 2 }}>
                  Complete Session
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNextExercise}
              style={({ pressed }) => ({
                flex: 2,
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textAlign: "center", textTransform: "uppercase", letterSpacing: 2 }}>
                Next Exercise
              </Text>
            </Pressable>
          )}
        </View>
      </View>


      <Modal
        visible={incompleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIncompleteModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, width: "100%", padding: 24 }}>
            <Ionicons name="alert-circle" size={32} color={Colors.warning} style={{ alignSelf: "center", marginBottom: 12 }} />
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, textAlign: "center", marginBottom: 8 }}>
              Missing Data
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 18, marginBottom: 24 }}>
              Some sets are missing reps or weight. Fill them in, or skip this exercise to log it as zeros.
            </Text>
            <Pressable
              testID="go-back-fill-btn"
              onPress={() => setIncompleteModalVisible(false)}
              style={({ pressed }) => ({
                backgroundColor: Colors.primary,
                paddingVertical: 14,
                alignItems: "center",
                marginBottom: 10,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Go Back & Fill In
              </Text>
            </Pressable>
            <Pressable
              testID="skip-exercise-btn"
              onPress={handleSkipExercise}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: Colors.border,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Skip Exercise
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, width: "100%" }}>

            {/* ── RESET SESSION DATA ── */}
            <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                Reset Session Data
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 }}>
                Clear all reps, weights, and recovery ratings entered today. Cannot be undone.
              </Text>
              <Pressable
                testID="confirm-reset-btn"
                onPress={handleResetWorkout}
                disabled={resetting}
                style={({ pressed }) => ({
                  backgroundColor: Colors.primary,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: pressed || resetting ? 0.7 : 1,
                })}
              >
                {resetting ? (
                  <ActivityIndicator color={Colors.text} size="small" />
                ) : (
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                    Reset Session Data
                  </Text>
                )}
              </Pressable>
            </View>

            {/* ── RESTORE EXERCISES ── */}
            <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                Restore Original Exercises
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 }}>
                Undo exercise swaps and restore the template's original selections.
              </Text>
              <Pressable
                onPress={handleRestoreThisExercise}
                disabled={restoringExercise}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingVertical: 13,
                  alignItems: "center",
                  marginBottom: 8,
                  opacity: pressed || restoringExercise ? 0.7 : 1,
                })}
              >
                {restoringExercise ? (
                  <ActivityIndicator color={Colors.text} size="small" />
                ) : (
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                    Restore This Exercise
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleRestoreAllExercises}
                disabled={restoringExercise}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingVertical: 13,
                  alignItems: "center",
                  opacity: pressed || restoringExercise ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Restore All Exercises
                </Text>
              </Pressable>
            </View>

            {/* ── CANCEL ── */}
            <Pressable
              testID="cancel-reset-btn"
              onPress={() => setResetModalVisible(false)}
              style={({ pressed }) => ({
                padding: 18,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── SWAP SCOPE PICKER ── */}
      <Modal
        visible={swapScopeVisible}
        animationType="fade"
        transparent
        onRequestClose={() => { setSwapScopeVisible(false); setPendingSwapExerciseId(null); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
                Apply change to...
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                How long should this swap last?
              </Text>
            </View>

            <Pressable
              onPress={() => handleConfirmSwap('once')}
              disabled={swapping}
              style={({ pressed }) => ({
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
                opacity: pressed || swapping ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Just this session
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                Next session reverts to the original exercise
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleConfirmSwap('permanent')}
              disabled={swapping}
              style={({ pressed }) => ({
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
                opacity: pressed || swapping ? 0.7 : 1,
              })}
            >
              {swapping ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Every session from now on
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                    Updates all future sessions in this plan
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setSwapScopeVisible(false); setPendingSwapExerciseId(null); }}
              style={({ pressed }) => ({ padding: 18, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={swapModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => { setSwapModalVisible(false); setHomeGymOnly(false); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, maxHeight: "70%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Swap Exercise
              </Text>
              <Pressable onPress={() => { setSwapModalVisible(false); setHomeGymOnly(false); }} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                    Dumbbells / Bodyweight Only
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                    Filter for home gym equipment
                  </Text>
                </View>
                <Switch
                  testID="home-gym-toggle"
                  value={homeGymOnly}
                  onValueChange={setHomeGymOnly}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.text}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Category:
                </Text>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  {currentCategory}
                </Text>
              </View>
            </View>

            {swapping ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : filteredExercises.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="barbell-outline" size={32} color={Colors.textMuted} />
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.textMuted, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                  No alternatives available
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredExercises}
                keyExtractor={(item) => item.id}
                scrollEnabled={!!filteredExercises.length}
                contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`swap-option-${item.id}`}
                    onPress={() => handleSelectForSwap(item.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
                        {item.equipment}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 16 }} onPress={() => setEditModalVisible(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Edit Exercise
                </Text>
                <Pressable onPress={() => setEditModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                  Exercise Name
                </Text>
                <TextInput
                  testID="edit-exercise-name"
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Exercise name"
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    fontFamily: "Rubik_500Medium",
                    fontSize: 15,
                    color: Colors.text,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    marginBottom: 20,
                    backgroundColor: Colors.bgAccent,
                  }}
                />

                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
                  Video URL
                </Text>
                <TextInput
                  testID="edit-video-url"
                  value={editVideoUrl}
                  onChangeText={setEditVideoUrl}
                  placeholder="https://youtu.be/..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 14,
                    color: Colors.primary,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    marginBottom: 24,
                    backgroundColor: Colors.bgAccent,
                  }}
                />

                <Pressable
                  testID="save-exercise-btn"
                  onPress={handleSaveExercise}
                  disabled={editSaving || !editName.trim()}
                  style={({ pressed }) => ({
                    backgroundColor: Colors.primary,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: pressed || editSaving || !editName.trim() ? 0.6 : 1,
                  })}
                >
                  {editSaving ? (
                    <ActivityIndicator color={Colors.text} size="small" />
                  ) : (
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                      Save Changes
                    </Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom workout tour overlay */}
      <Modal
        visible={tourVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeTour}
      >
        <View style={{ flex: 1 }}>
          {spotlight ? (
            <>
              {/* 4-panel dim overlay creating a spotlight window */}
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: spotlight.y, backgroundColor: "rgba(0,0,0,0.82)" }} />
              <View style={{ position: "absolute", left: 0, right: 0, top: spotlight.y + spotlight.height, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)" }} />
              <View style={{ position: "absolute", left: 0, width: spotlight.x, top: spotlight.y, height: spotlight.height, backgroundColor: "rgba(0,0,0,0.82)" }} />
              <View style={{ position: "absolute", left: spotlight.x + spotlight.width, right: 0, top: spotlight.y, height: spotlight.height, backgroundColor: "rgba(0,0,0,0.82)" }} />
              {/* Crimson border around spotlight */}
              <View style={{ position: "absolute", left: spotlight.x, top: spotlight.y, width: spotlight.width, height: spotlight.height, borderWidth: 2, borderColor: Colors.primary }} pointerEvents="none" />
            </>
          ) : (
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)" }} />
          )}

          {/* Tooltip card — below spotlight if in top half of screen, above if in bottom half */}
          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              ...(() => {
                const TOOLTIP_HEIGHT = 230;
                const GAP = 16;
                if (!spotlight) return { bottom: 80 };
                const spaceBelow = screenHeight - (spotlight.y + spotlight.height);
                const spaceAbove = spotlight.y;
                if (spaceBelow >= TOOLTIP_HEIGHT + GAP) {
                  return { top: spotlight.y + spotlight.height + GAP };
                } else if (spaceAbove >= TOOLTIP_HEIGHT + GAP) {
                  return { bottom: screenHeight - spotlight.y + GAP };
                } else {
                  return { bottom: 20 };
                }
              })(),
              backgroundColor: "#0A0A0A",
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 20,
            }}
          >
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.primary, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
              Step {tourStep + 1} of {TOUR_STEPS.length}
            </Text>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, marginBottom: 8 }}>
              {TOUR_STEPS[tourStep].title}
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 }}>
              {TOUR_STEPS[tourStep].text}
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {tourStep > 0 && (
                <Pressable
                  onPress={tourPrev}
                  style={{ borderWidth: 1, borderColor: "#333333", paddingVertical: 10, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                    Back
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={closeTour}
                style={{ borderWidth: 1, borderColor: "#333333", paddingVertical: 10, paddingHorizontal: 14 }}
              >
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Skip
                </Text>
              </Pressable>
              <Pressable
                onPress={tourNext}
                style={{ flex: 1, backgroundColor: Colors.primary, paddingVertical: 10, alignItems: "center" }}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                  {tourStep === TOUR_STEPS.length - 1 ? "Got It" : "Next →"}
                </Text>
              </Pressable>
            </View>

            {/* Step dots */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 16 }}>
              {TOUR_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === tourStep ? 16 : 6,
                    height: 4,
                    backgroundColor: i === tourStep ? Colors.primary : "#333333",
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Inline video player */}
      {currentEx?.exercise.defaultVideoUrl && (
        <ExerciseVideoPlayer
          visible={videoPlayerVisible}
          onClose={() => setVideoPlayerVisible(false)}
          videoUrl={currentEx.exercise.defaultVideoUrl}
          exerciseName={currentEx.exercise.name}
        />
      )}
    </View>
  );
}

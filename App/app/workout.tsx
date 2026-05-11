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
  Keyboard,
  Linking,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import ExerciseGuide from "@/components/ExerciseGuide";
import SupersetIcon from "@/components/SupersetIcon";
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
  updateExerciseEquipment,
  getPreviousSessionSets,
  updateExerciseNotes,
  startWorkoutSession,
  finishWorkoutSession,
  addSetToLog,
  removeLastSetFromLog,
  propagateSetChangeToPlan,
  type WorkoutPlan,
  type Exercise,
} from "@/lib/local-db";
import { firePRNotification } from "@/lib/notifications";
import * as Notifications from "expo-notifications";
import { calculatePlates, platesString, BAR_PRESETS, type PlateResult } from "@/utils/plateCalculator";

const SCIENCE_TIPS: { icon: string; text: string }[] = [
  { icon: "flask-outline",       text: "RIR 3 is the hypertrophy sweet spot — hard enough to grow, controlled enough for clean technique." },
  { icon: "time-outline",        text: "Rest 2-3 min between compound sets. ATP restores in ~90 sec, but neural fatigue takes longer." },
  { icon: "trending-up-outline", text: "Progressive overload = more weight OR more reps at the same load. Both drive muscle growth equally." },
  { icon: "moon-outline",        text: "Growth hormone peaks during deep sleep. 7-9 hours isn't optional — it's part of the program." },
  { icon: "body-outline",        text: "Controlled negatives (3-4 sec) increase mechanical tension — the primary driver of hypertrophy." },
  { icon: "fitness-outline",     text: "Focusing on the working muscle can raise activation by up to 35% in isolation exercises." },
  { icon: "refresh-outline",     text: "Deload weeks aren't lost training — they're when adaptations consolidate and performance rebounds." },
  { icon: "nutrition-outline",   text: "20-40 g protein within 2 hours post-workout maximizes muscle protein synthesis." },
  { icon: "stats-chart-outline", text: "Volume (sets × reps × load) is the #1 driver of hypertrophy. RIR keeps set quality high." },
  { icon: "water-outline",       text: "Even 2% dehydration drops strength output 5-8%. Sip 500 ml before you start." },
  { icon: "thunderstorm-outline",text: "Antagonist supersets (chest + back) let one muscle recover while the other works — no strength loss." },
  { icon: "layers-outline",      text: "Accumulated fatigue masks fitness gains. Deloads reveal how much stronger you've actually become." },
  { icon: "pulse-outline",       text: "Compound lifts first, isolation after. Spend your best energy where it moves the most load." },
  { icon: "flame-outline",       text: "Muscle soreness ≠ effective training. DOMS is inflammation, not a growth signal." },
  { icon: "cellular-outline",    text: "Each muscle needs 10-20 hard sets per week to grow. This program keeps you in that optimal range." },
];

/**
 * Antagonist category pairs for auto-suggesting supersets.
 * Order within each pair doesn't matter — the algorithm checks both directions.
 */
const ANTAGONIST_PAIRS: [string, string][] = [
  ["HORIZONTAL PUSH", "HORIZONTAL BACK"],
  ["INCLINE PUSH",    "VERTICAL BACK"],
  ["VERTICAL PUSH",   "HORIZONTAL BACK"],
  ["BICEPS",          "TRICEPS"],
  ["QUADS",           "HAMSTRINGS"],
  ["QUADS",           "GLUTES"],
  ["LATERAL DELTS",   "BICEPS"],
  ["REAR DELTS",      "BICEPS"],
  ["VERTICAL PUSH",   "VERTICAL BACK"],
];

/** Given the current exercise list, return index pairs that make good supersets. */
function suggestSupersetPairs(states: { exercise: { category: string } }[]): [number, number][] {
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  for (let i = 0; i < states.length; i++) {
    if (used.has(i)) continue;
    const catA = states[i].exercise.category?.toUpperCase();
    for (let j = i + 1; j < states.length; j++) {
      if (used.has(j)) continue;
      const catB = states[j].exercise.category?.toUpperCase();
      const isAntagonist = ANTAGONIST_PAIRS.some(
        ([a, b]) => (a === catA && b === catB) || (b === catA && a === catB)
      );
      if (isAntagonist) {
        pairs.push([i, j]);
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  return pairs;
}

/** MEV (Minimum Effective Volume) and MAV (Maximum Adaptive Volume) sets per week, by category. */
const MEV_MAV: Record<string, { mev: number; mav: number }> = {
  "HORIZONTAL PUSH": { mev: 8,  mav: 16 },
  "INCLINE PUSH":    { mev: 6,  mav: 14 },
  "VERTICAL PUSH":   { mev: 6,  mav: 14 },
  "HORIZONTAL BACK": { mev: 10, mav: 20 },
  "VERTICAL BACK":   { mev: 8,  mav: 18 },
  "BICEPS":          { mev: 8,  mav: 20 },
  "TRICEPS":         { mev: 6,  mav: 16 },
  "REAR DELTS":      { mev: 10, mav: 20 },
  "TRAPS":           { mev: 8,  mav: 18 },
  "QUADS":           { mev: 8,  mav: 18 },
  "HAMSTRINGS":      { mev: 6,  mav: 16 },
  "GLUTES":          { mev: 8,  mav: 18 },
  "CALVES":          { mev: 10, mav: 20 },
  "ABS":             { mev: 10, mav: 20 },
};

interface SetState {
  setLogId: string;
  setNumber: number;
  targetWeight: number;
  targetReps: number;
  repsCompleted: string;
  weightUsed: string;
  feedback: { text: string; color: string } | null;
}

interface PrevSet {
  setNumber: number;
  weightUsed: number;
  repsCompleted: number;
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
  exerciseNotes: string;
  prevSets: PrevSet[] | null; // last session's completed sets for this exercise
  supersetGroup: number | null; // exercises sharing same group ID alternate sets
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
    text: "After finishing all exercises, rate your effort here. Be honest — this dictates how POWRLOG adjusts your weight next session.",
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
  const weightOk = targetWeight === 0 || weightUsed >= targetWeight;
  const repsOk   = repsCompleted >= targetReps;

  const hitTarget = isBodyweight ? repsOk : repsOk && weightOk;

  if (hitTarget) {
    const exceeded = isBodyweight
      ? repsCompleted > targetReps
      : repsCompleted > targetReps || (targetWeight > 0 && weightUsed > targetWeight);
    return {
      text: exceeded
        ? "Target exceeded. Progressive overload achieved."
        : "Target met. Progressive overload achieved.",
      color: Colors.success,
    };
  }

  // Give a specific reason so the user understands what to fix
  if (!isBodyweight && !weightOk && repsOk) {
    return {
      text: "Weight below target. Increase load next set.",
      color: Colors.warning,
    };
  }
  if (!repsOk && weightOk) {
    return {
      text: "Reps below target. Autoregulation will lower weight next week.",
      color: Colors.warning,
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
  const [editEquipment, setEditEquipment] = useState("BARBELL");
  const [editSaving, setEditSaving] = useState(false);
  // ── Session timer ────────────────────────────────────────────────────────
  const startedAtRef     = useRef<string | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // ── Session notes ────────────────────────────────────────────────────────
  const [sessionNotes, setSessionNotes] = useState("");
  // ── Plate calculator ─────────────────────────────────────────────────────
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [plateCalcTarget, setPlateCalcTarget] = useState("");
  const [plateCalcBar, setPlateCalcBar] = useState<number | null>(null);
  const [plateResult, setPlateResult] = useState<PlateResult | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const restTimerContainerRef = useRef<View>(null);
  const restTimerY = useRef<number>(0);
  const exerciseStatesRef = useRef<ExerciseState[]>([]);
  const autoFinishTriggeredRef = useRef(false);
  const finishingRef = useRef(false); // guards against double-complete (manual + auto-finish race)
  const { height: screenHeight } = useWindowDimensions();

  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  const setTableRef = useRef<View>(null);
  const guideRef = useRef<View>(null);
  const videoButtonRef = useRef<View>(null);
  const actionBarRef = useRef<View>(null);
  const weightInputRefs = useRef<Record<string, TextInput | null>>({});
  // Track which exerciseIds have already shown the huge-jump warning this install
  const warnedJumpExercisesRef = useRef<Set<string>>(new Set());
  // ── Watch reminder banner ────────────────────────────────────────────────
  const [watchBannerVisible, setWatchBannerVisible] = useState(false);
  // ── Exercise panel ───────────────────────────────────────────────────────
  const [exercisePanelVisible, setExercisePanelVisible] = useState(false);
  const [supersetPickMode, setSupersetPickMode] = useState(false);
  const [supersetPickSource, setSupersetPickSource] = useState<number | null>(null);
  const supersetGroupCounterRef = useRef(1);
  // ── Superset onboarding ───────────────────────────────────────────────────
  const [supersetIntroVisible, setSupersetIntroVisible] = useState(false);
  const [supersetIntroIsFirstTime, setSupersetIntroIsFirstTime] = useState(false);
  // ── Superset jump banner ──────────────────────────────────────────────────
  const [supersetJumpBanner, setSupersetJumpBanner] = useState<string | null>(null);
  // ── Keyboard visibility (used to hide guide during input) ────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // ── Add / Remove Sets scope modal ────────────────────────────────────────
  const [setManageModal, setSetManageModal] = useState<'add' | 'remove' | null>(null);
  const [setManageSaving, setSetManageSaving] = useState(false);

  useEffect(() => {
    loadPlan();
    // Restore which exercises have already been warned about large weight jumps
    AsyncStorage.getItem("hugejump_warned_exercises").then((raw) => {
      if (raw) {
        try {
          const ids: string[] = JSON.parse(raw);
          warnedJumpExercisesRef.current = new Set(ids);
        } catch {}
      }
    });
    // Track keyboard so we can hide the exercise guide during set entry
    const kbShow = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const kbHide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    // Cleanup timer on unmount
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      kbShow.remove();
      kbHide.remove();
    };
  }, []);

  async function loadPlan() {
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) {
      router.replace("/(tabs)");
      return;
    }
    const p = await getWorkoutPlan(planId);
    if (!p) {
      router.replace("/(tabs)");
      return;
    }
    setPlan(p);
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

      // Start session timer (idempotent — INSERT OR IGNORE in DB)
      startWorkoutSession(plan.id, plan.currentWeek, currentDayNum).then(async (startedAt) => {
        startedAtRef.current = startedAt;
        const initial = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        // Only trigger watch reminder on a fresh session start (not resume)
        if (initial < 10) {
          // Show superset suggestion modal on fresh session start
          const hasSeen = await AsyncStorage.getItem("supersetIntroSeen");
          setSupersetIntroIsFirstTime(!hasSeen);
          setSupersetIntroVisible(true);
          if (!hasSeen) await AsyncStorage.setItem("supersetIntroSeen", "1");
          const watchEnabled = await AsyncStorage.getItem("watchReminderEnabled");
          if (watchEnabled === "true") {
            setWatchBannerVisible(true);
            // Fire a local notification — this vibrates Apple Watch / Android Wear
            // automatically when the phone notification arrives on the wrist
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "Start your workout tracker ⌚",
                  body: "Open the Workout app on your Apple Watch and select Strength Training",
                  sound: false,
                },
                trigger: null, // fire immediately
              });
            } catch {}
            // Auto-dismiss banner after 10 seconds
            setTimeout(() => setWatchBannerVisible(false), 10000);
          }
        }
        setElapsedSeconds(Math.max(0, initial));
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setElapsedSeconds(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
        }, 1000);
      });

      // Build exercise states then load prev-session data async
      const states: ExerciseState[] = todayLogs.map((log) => ({
        logId: log.id,
        exerciseId: log.exerciseId,
        exercise: log.exercise,
        targetSets: log.targetSets,
        targetWeight: log.targetWeight,
        targetRIR: log.targetRIR,
        sorenessRating: log.sorenessRating ?? 0,
        pumpRating: log.pumpRating ?? 3,
        exerciseNotes: "",
        prevSets: null,
        supersetGroup: null,
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

      autoFinishTriggeredRef.current = false;
      setExerciseStates(states);

      // Load previous session sets for each exercise
      Promise.all(
        states.map((s) => getPreviousSessionSets(s.exerciseId, plan.id))
      ).then((prevResults) => {
        setExerciseStates((current) =>
          current.map((ex, i) => ({ ...ex, prevSets: prevResults[i] ?? null }))
        );
      });

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
      const exerciseId = exerciseStates[exIndex]?.exerciseId;
      // Only show this warning the first time for each exercise
      if (exerciseId && warnedJumpExercisesRef.current.has(exerciseId)) return;
      if (exerciseId) {
        warnedJumpExercisesRef.current.add(exerciseId);
        const updated = Array.from(warnedJumpExercisesRef.current);
        AsyncStorage.setItem("hugejump_warned_exercises", JSON.stringify(updated));
      }
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

  function handleSetRepsChange(exIndex: number, setIndex: number, value: string) {
    updateSet(exIndex, setIndex, "repsCompleted", value);
    const num = parseInt(value);
    if (!isNaN(num)) {
      const ex = exerciseStates[exIndex];
      const setLogId = ex.sets[setIndex].setLogId;
      // Fire-and-forget — don't await in onChangeText to avoid blocking iOS keyboard
      updateSetLog(setLogId, { repsCompleted: num }).catch(() => {});
      // Bodyweight exercises don't require a weight entry — auto-commit 0
      if (ex.exercise.equipment === "BODYWEIGHT") {
        updateSet(exIndex, setIndex, "weightUsed", "0");
        updateSetLog(setLogId, { weightUsed: 0 }).catch(() => {});
      }
    }
  }

  function handleSetWeightChange(exIndex: number, setIndex: number, value: string) {
    updateSet(exIndex, setIndex, "weightUsed", value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const setLogId = exerciseStates[exIndex].sets[setIndex].setLogId;
      // Fire-and-forget — don't await in onChangeText to avoid blocking iOS keyboard
      updateSetLog(setLogId, { weightUsed: num }).catch(() => {});
    }
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
  }, [exerciseStates]);

  // Auto-complete: as soon as every set on every exercise is logged, save and
  // navigate to the summary — no "Finish Workout" tap required.
  useEffect(() => {
    if (exerciseStates.length === 0) return;
    if (autoFinishTriggeredRef.current) return;
    if (finishingRef.current) return;
    const allDone = exerciseStates.every(isExerciseComplete);
    if (allDone) {
      autoFinishTriggeredRef.current = true;
      // Brief delay so the user sees the last feedback row before the screen transitions
      setTimeout(() => {
        handleConfirmRecovery();
      }, 1200);
    }
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
        const jumpingToPartner = hasActiveSupersertPartner(exIndex);
        if (!isLastSet && !jumpingToPartner) {
          const category = updatedEx.exercise.category;
          const restSeconds = calculateRestTime(category);
          setRestTimerSeconds(restSeconds);
          setRestTimerKey((prev) => prev + 1);
          setRestTimerVisible(true);
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: restTimerY.current - 16, animated: true });
          }, 150);
        }

        return updated;
      });
      // Jump to superset partner after field blur too
      if (hasActiveSupersertPartner(exIndex)) {
        setTimeout(() => tryJumpToSupersetPartner(exIndex), 550);
      }
    }, 150);
  }

  /**
   * Returns true if this exercise is in a superset AND the partner still has
   * unlogged sets — meaning we should skip the rest timer and jump instead.
   */
  function hasActiveSupersertPartner(exIndex: number): boolean {
    const states = exerciseStatesRef.current;
    const groupId = states[exIndex].supersetGroup;
    if (groupId === null) return false;
    return states.some(
      (ex, i) => i !== exIndex && ex.supersetGroup === groupId && ex.sets.some((s) => !s.feedback)
    );
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
    // Don't start the rest timer if we're about to jump to a superset partner.
    // The timer fires after the partner set instead (end of the superset round).
    const jumpingToPartner = hasActiveSupersertPartner(exIndex);
    if (!isLastSet && !jumpingToPartner) {
      const category = ex.exercise.category;
      const restSeconds = calculateRestTime(category);
      setRestTimerSeconds(restSeconds);
      setRestTimerKey((prev) => prev + 1);
      setRestTimerVisible(true);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: restTimerY.current - 16, animated: true });
      }, 150);
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
    // If in a superset, jump to partner after a short delay (allow feedback to render)
    setTimeout(() => tryJumpToSupersetPartner(exIndex), 400);
  }

  /** Link two exercises into a superset pair. Clears any prior group memberships first. */
  function createSuperset(indexA: number, indexB: number) {
    const groupId = supersetGroupCounterRef.current++;
    setExerciseStates((prev) => {
      const next = [...prev];
      // Remove both from any existing group
      const groupAOld = next[indexA].supersetGroup;
      const groupBOld = next[indexB].supersetGroup;
      if (groupAOld !== null) next.forEach((ex, i) => { if (ex.supersetGroup === groupAOld) next[i] = { ...next[i], supersetGroup: null }; });
      if (groupBOld !== null) next.forEach((ex, i) => { if (ex.supersetGroup === groupBOld) next[i] = { ...next[i], supersetGroup: null }; });
      next[indexA] = { ...next[indexA], supersetGroup: groupId };
      next[indexB] = { ...next[indexB], supersetGroup: groupId };
      return next;
    });
  }

  /** Remove an exercise from its superset group. If partner is then alone, clear partner too. */
  function removeFromSuperset(index: number) {
    setExerciseStates((prev) => {
      const groupId = prev[index].supersetGroup;
      if (groupId === null) return prev;
      const next = prev.map((ex) => ex.supersetGroup === groupId ? { ...ex, supersetGroup: null } : ex);
      return next;
    });
  }

  /** After logging a set, if exercise is in a superset, jump to the partner. */
  function tryJumpToSupersetPartner(exIndex: number) {
    const states = exerciseStatesRef.current;
    const groupId = states[exIndex].supersetGroup;
    if (groupId === null) return;
    // Find partner with at least one unlogged set — no data pre-fill required
    const partnerIndex = states.findIndex((ex, i) => {
      if (i === exIndex || ex.supersetGroup !== groupId) return false;
      return ex.sets.some((s) => !s.feedback);
    });
    if (partnerIndex >= 0) {
      const partnerName = states[partnerIndex].exercise.name;
      setCurrentExerciseIndex(partnerIndex);
      setRestTimerVisible(false);
      setSupersetJumpBanner(partnerName);
      setTimeout(() => setSupersetJumpBanner(null), 2000);
    }
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
    // Find the next incomplete exercise (search forward, then wrap from beginning)
    let nextIdx = -1;
    for (let i = currentExerciseIndex + 1; i < exerciseStates.length; i++) {
      if (!isExerciseComplete(exerciseStates[i])) { nextIdx = i; break; }
    }
    if (nextIdx === -1) {
      for (let i = 0; i < currentExerciseIndex; i++) {
        if (!isExerciseComplete(exerciseStates[i])) { nextIdx = i; break; }
      }
    }
    if (nextIdx >= 0) {
      setCurrentExerciseIndex(nextIdx);
    }
    // nextIdx === -1 means all exercises are done → allSessionComplete becomes true,
    // the CTA switches to "Complete Session" automatically.
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
    setEditEquipment(ex.exercise.equipment);
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
      const equipmentChanged = editEquipment !== ex.exercise.equipment;
      if (equipmentChanged) {
        await updateExerciseEquipment(ex.exercise.id, editEquipment);
        // Clear logged weights when switching to weighted BW — old "0" values are stale
        if (editEquipment === "WEIGHTED_BODYWEIGHT") {
          setExerciseStates((prev) =>
            prev.map((s, i) =>
              i === currentExerciseIndex
                ? { ...s, sets: s.sets.map((set) => ({ ...set, weightUsed: "", feedback: null })) }
                : s
            )
          );
        }
      }
      setExerciseStates((prev) =>
        prev.map((s, i) =>
          i === currentExerciseIndex
            ? { ...s, exercise: { ...s.exercise, name: trimmedName, defaultVideoUrl: newVideoUrl, equipment: editEquipment } }
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
    // Prevent double-complete: manual "Finish" tap and auto-finish timer can both
    // fire within the same render cycle — the ref guard blocks the second call.
    if (finishingRef.current) return;
    finishingRef.current = true;
    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) { finishingRef.current = false; return; }
    setFinishing(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const exercises = exerciseStatesRef.current.map((ex) => ({
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

      // Save per-exercise notes — use ref to avoid stale closure capture
      await Promise.all(
        exerciseStatesRef.current
          .filter((ex) => ex.exerciseNotes.trim())
          .map((ex) => updateExerciseNotes(ex.logId, ex.exerciseNotes))
      );

      const result = await completeWorkout(planId, dayNumber, exercises);
      const currentRIR = exerciseStates.length > 0 ? exerciseStates[0].targetRIR : "";

      // Save session duration + notes
      if (plan) {
        await finishWorkoutSession(planId, plan.currentWeek, dayNumber, sessionNotes);
      }

      // Fire a local notification for each PR (runs in background, non-blocking)
      if (result.prs.length > 0) {
        for (const pr of result.prs) {
          firePRNotification(pr.exerciseName, pr.newBest, pr.previousBest, unit).catch(() => {});
        }
      }

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
            prs: JSON.stringify(result.prs),
          },
        });
      }
    } catch (err) {
      console.error(err);
      // Reset guards so the user can retry manually
      autoFinishTriggeredRef.current = false;
      finishingRef.current = false;
      Alert.alert("Save Failed", "Your workout couldn't be saved. Tap 'Save Workout' to try again.");
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
    if (homeGymOnly && ex.equipment !== "DUMBBELL" && ex.equipment !== "BODYWEIGHT" && ex.equipment !== "WEIGHTED_BODYWEIGHT") return false;
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

  async function handleConfirmSetChange(scope: 'once' | 'permanent') {
    const action = setManageModal; // capture before clearing (state updates are async)
    if (!action) return;
    setSetManageModal(null);

    const planId = await AsyncStorage.getItem("activePlanId");
    if (!planId) return;
    const logId     = exerciseStates[currentExerciseIndex]?.logId;
    const exerciseId = exerciseStates[currentExerciseIndex]?.exerciseId;
    if (!logId) return;

    setSetManageSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (action === 'add') {
        const newSet = await addSetToLog(logId);
        if (newSet) {
          setExerciseStates((prev) => {
            const next = [...prev];
            const ex = { ...next[currentExerciseIndex] };
            ex.sets = [
              ...ex.sets,
              {
                setLogId:      newSet.id,
                setNumber:     newSet.setNumber,
                targetWeight:  newSet.targetWeight,
                targetReps:    newSet.targetReps,
                repsCompleted: "",
                weightUsed:    "",
                feedback:      null,
              },
            ];
            ex.targetSets = ex.sets.length;
            next[currentExerciseIndex] = ex;
            return next;
          });
          if (scope === 'permanent') {
            await propagateSetChangeToPlan(planId, exerciseId, logId, 1);
          }
        }
      } else {
        // remove
        const lastSet = exerciseStates[currentExerciseIndex].sets.at(-1);
        if (!lastSet || lastSet.feedback) {
          // Already completed — cannot remove
          return;
        }
        const removed = await removeLastSetFromLog(logId);
        if (removed) {
          setExerciseStates((prev) => {
            const next = [...prev];
            const ex = { ...next[currentExerciseIndex] };
            ex.sets = ex.sets.slice(0, -1);
            ex.targetSets = ex.sets.length;
            next[currentExerciseIndex] = ex;
            return next;
          });
          if (scope === 'permanent') {
            await propagateSetChangeToPlan(planId, exerciseId, logId, -1);
          }
        }
      }
    } catch (err) {
      console.error("handleConfirmSetChange error:", err);
    } finally {
      setSetManageSaving(false);
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
  const allSessionComplete = exerciseStates.every(isExerciseComplete);
  const isBodyweight = currentEx.exercise.equipment === "BODYWEIGHT";
  const isWeightedBW = currentEx.exercise.equipment === "WEIGHTED_BODYWEIGHT";
  const allSetsLogged = currentEx.sets.every((s) =>
    isBodyweight ? s.repsCompleted !== "" : s.repsCompleted !== "" && s.weightUsed !== ""
  );
  const setsRemaining = allSetsLogged ? 0 : currentEx.sets.filter((s) =>
    isBodyweight ? s.repsCompleted === "" : s.repsCompleted === "" || s.weightUsed === ""
  ).length;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, paddingBottom: bottomInset }}>

      {/* ── Watch reminder banner ── */}
      {watchBannerVisible && (
        <Pressable
          onPress={() => setWatchBannerVisible(false)}
          style={{
            backgroundColor: "#1A237E",
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 18 }}>⌚</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: "#FFFFFF", letterSpacing: 0.5 }}>
              Start Strength Training on your Apple Watch
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: "#9FA8DA", marginTop: 1 }}>
              Open the Workout app → Strength Training · Tap to dismiss
            </Text>
          </View>
          <Ionicons name="close" size={16} color="#9FA8DA" />
        </Pressable>
      )}

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Week {plan?.currentWeek}
            </Text>
            {plan && ((plan.currentWeek - 1) % 4) + 1 === 4 && (
              <>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>·</Text>
                <GlossaryTerm
                  text="DELOAD"
                  termKey="Deload"
                  style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}
                />
              </>
            )}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* Live session timer */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, fontVariant: ["tabular-nums"] }}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          </View>
          <Pressable onPress={() => setExercisePanelVisible(true)} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="list-outline" size={16} color={Colors.primary} />
          </Pressable>
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
            <GlossaryTerm
              text="Deload Week"
              termKey="Deload"
              style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1 }}
            />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
              Reduced volume, same weight. Focus on form and recovery.
            </Text>
          </View>
        </View>
      )}

      {/* ── Non-scrollable content: exercise header + set table ─────────────
           TextInputs live here so iOS never auto-scrolls the screen          ── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, flexShrink: 1 }}>
              {currentEx.exercise.name}
            </Text>
            {currentEx.supersetGroup !== null && (
              <SupersetIcon state="active" size={22} />
            )}
          </View>
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
                  onPress={() => Linking.openURL(currentEx.exercise.defaultVideoUrl!).catch(() => {})}
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

        {/* ── Previous Session Banner ── */}
        {currentEx.prevSets && currentEx.prevSets.length > 0 && (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
            paddingHorizontal: 2,
          }}>
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Last:
            </Text>
            {currentEx.prevSets.map((ps, i) => (
              <Text key={i} style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                {isBodyweight
                  ? `BW×${ps.repsCompleted}`
                  : isWeightedBW
                    ? `BW+${ps.weightUsed}×${ps.repsCompleted}`
                    : `${ps.weightUsed}×${ps.repsCompleted}`}
                {i < currentEx.prevSets!.length - 1 ? "  ·" : ""}
              </Text>
            ))}
          </View>
        )}

        {/* POWR Brief — science tip, rotates per exercise, hidden once all sets are done */}
        {!isExerciseComplete(currentEx) && (() => {
          const tip = SCIENCE_TIPS[currentExerciseIndex % SCIENCE_TIPS.length];
          return (
            <View style={{
              marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8,
              backgroundColor: Colors.bgAccent,
              borderLeftWidth: 2, borderLeftColor: Colors.primary + "66",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Ionicons name={tip.icon as any} size={11} color={Colors.primary} />
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: Colors.primary, letterSpacing: 2, textTransform: "uppercase" }}>
                  POWR Brief
                </Text>
              </View>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 17 }}>
                {tip.text}
              </Text>
            </View>
          );
        })()}

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
                {isWeightedBW ? (
                  /* Added weight column — no plate calc for belt weight */
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    +{unit}
                  </Text>
                ) : currentEx.exercise.equipment === "DUMBBELL" ? (
                  /* Dumbbell: plain label, no plate calc */
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    per DB
                  </Text>
                ) : (
                  /* Barbell / cable / machine — show plate calculator trigger */
                  <Pressable
                    onPress={() => {
                      const target = currentEx.targetWeight > 0 ? String(currentEx.targetWeight) : "";
                      setPlateCalcTarget(target);
                      setPlateCalcBar(null);
                      if (target) {
                        setPlateResult(calculatePlates(parseFloat(target), unit));
                      } else {
                        setPlateResult(null);
                      }
                      setPlateCalcVisible(true);
                    }}
                    hitSlop={10}
                    style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                  >
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                      {unit}
                    </Text>
                    <Ionicons name="barbell-outline" size={10} color={Colors.primary} />
                  </Pressable>
                )}
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
                      {isBodyweight
                        ? `BW × ${set.targetReps}`
                        : isWeightedBW
                          ? (set.targetWeight > 0 ? `BW+${set.targetWeight} × ${set.targetReps}` : `BW × ${set.targetReps}`)
                          : `${set.targetWeight} ${unit} × ${set.targetReps}`}
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
                        keyboardType="decimal-pad"
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
                      onSubmitEditing={() => Keyboard.dismiss()}
                      returnKeyType="done"
                      keyboardType="number-pad"
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

        {/* Plate calculator shortcut — barbell/cable/machine only; not dumbbells or bodyweight */}
        {!isBodyweight && !isWeightedBW && currentEx.exercise.equipment !== "DUMBBELL" && (
          <Pressable
            onPress={() => {
              const target = currentEx.targetWeight > 0 ? String(currentEx.targetWeight) : "";
              setPlateCalcTarget(target);
              setPlateCalcBar(null);
              if (target) setPlateResult(calculatePlates(parseFloat(target), unit));
              else setPlateResult(null);
              setPlateCalcVisible(true);
            }}
            style={({ pressed }) => ({
              marginHorizontal: 20,
              marginTop: 10,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: 10,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="barbell-outline" size={16} color={Colors.primary} />
            <Text style={{
              fontFamily: "Rubik_600SemiBold",
              fontSize: 12,
              color: Colors.primary,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}>
              Plate Calculator
            </Text>
          </Pressable>
        )}

        {/* ── Add / Remove Sets row ── */}
        {(() => {
          const lastSet = currentEx.sets.at(-1);
          const canRemove = currentEx.sets.length > 1 && !lastSet?.feedback;
          return (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
              marginBottom: 2,
            }}>
              {/* Remove last set */}
              <Pressable
                onPress={() => {
                  if (!canRemove) return;
                  setSetManageModal('remove');
                }}
                disabled={!canRemove}
                hitSlop={12}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  opacity: pressed ? 0.5 : canRemove ? 1 : 0.3,
                })}
              >
                <Ionicons name="remove-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 10,
                  color: Colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}>
                  Remove
                </Text>
              </Pressable>

              {/* Set count */}
              <Text style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 11,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}>
                {currentEx.sets.length} {currentEx.sets.length === 1 ? "Set" : "Sets"}
              </Text>

              {/* Add set */}
              <Pressable
                onPress={() => setSetManageModal('add')}
                hitSlop={12}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontFamily: "Rubik_500Medium",
                  fontSize: 10,
                  color: Colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}>
                  Add Set
                </Text>
                <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
              </Pressable>
            </View>
          );
        })()}

      </View>{/* end non-scrollable content */}

      {/* ── Scrollable lower area: rating (post-exercise) + guide ───────────── */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>

        {/* Per-exercise ratings — appear once all sets are complete */}
        {isExerciseComplete(currentEx) && (
          <View
            style={{ marginHorizontal: 20, marginTop: 20, borderWidth: 1, borderColor: Colors.primary + "66", padding: 16 }}
          >
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
              Rate This Exercise
            </Text>

            {/* Recovery row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <GlossaryTerm
                text="Recovery"
                termKey="Recovery"
                style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, marginRight: 8 }}
              />
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
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <GlossaryTerm
                text="Pump"
                termKey="Pump"
                style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, marginRight: 8 }}
              />
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

            {/* Exercise notes */}
            <View style={{ borderTopWidth: 1, borderTopColor: Colors.border + "66", paddingTop: 10 }}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Exercise Note
              </Text>
              <TextInput
                value={currentEx.exerciseNotes}
                onChangeText={(text) => {
                  setExerciseStates((prev) => {
                    const updated = [...prev];
                    updated[currentExerciseIndex] = { ...updated[currentExerciseIndex], exerciseNotes: text };
                    return updated;
                  });
                }}
                onBlur={() => {
                  if (currentEx.exerciseNotes.trim()) {
                    updateExerciseNotes(currentEx.logId, currentEx.exerciseNotes).catch(() => {});
                  }
                }}
                placeholder="How did this feel? Anything to remember next time…"
                placeholderTextColor={Colors.textMuted}
                multiline
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 12,
                  color: Colors.text,
                  backgroundColor: Colors.bgAccent,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  minHeight: 56,
                  textAlignVertical: "top",
                }}
              />
            </View>
          </View>
        )}

        {/* ── MEV/MAV volume nudge — appears after exercise is rated ── */}
        {isExerciseComplete(currentEx) && (() => {
          const cat = currentEx.exercise.category;
          const mavData = MEV_MAV[cat];
          if (!mavData) return null;
          const setsToday = currentEx.sets.length;
          if (setsToday >= 5) return null; // already at a reasonable session cap
          return (
            <View style={{
              marginHorizontal: 20,
              marginTop: 10,
              borderWidth: 1,
              borderColor: Colors.primary + "33",
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}>
              <Ionicons name="trending-up-outline" size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 9,
                  color: Colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 3,
                }}>
                  Volume Tip
                </Text>
                <Text style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 11,
                  color: Colors.textSecondary,
                  lineHeight: 16,
                }}>
                  {cat}: aim for {mavData.mev}–{mavData.mav} sets/week.{"\n"}You have {setsToday} set{setsToday !== 1 ? "s" : ""} today — room to grow.
                </Text>
              </View>
              <Pressable
                onPress={() => setSetManageModal('add')}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 10,
                  color: Colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}>
                  + Set
                </Text>
              </Pressable>
            </View>
          );
        })()}

        <View
          ref={restTimerContainerRef}
          onLayout={(e) => { restTimerY.current = e.nativeEvent.layout.y; }}
        >
          {restTimerVisible && (
            <RestTimer
              key={restTimerKey}
              initialSeconds={restTimerSeconds}
              onDismiss={() => setRestTimerVisible(false)}
            />
          )}
        </View>

        {/* Exercise guide — hidden while keyboard is open so it can't scroll into view */}
        {!keyboardVisible && (
          <View ref={guideRef}>
            <ExerciseGuide exercise={currentEx.exercise} />
          </View>
        )}

        {!keyboardVisible && <View style={{ height: 28 }} />}
      </ScrollView>

      <View ref={actionBarRef} style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
        {/* Session notes — shown once all exercises are complete */}
        {allSessionComplete && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
              Session Note (optional)
            </Text>
            <TextInput
              value={sessionNotes}
              onChangeText={setSessionNotes}
              placeholder="Overall session notes…"
              placeholderTextColor={Colors.textMuted}
              multiline
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 12,
                color: Colors.text,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingHorizontal: 10,
                paddingVertical: 8,
                minHeight: 44,
                textAlignVertical: "top",
              }}
            />
          </View>
        )}
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

          {allSessionComplete ? (
            // Auto-finish fires via useEffect; this button is always tappable as a fallback
            <Pressable
              onPress={finishing ? undefined : handleFinishWorkout}
              style={({ pressed }) => ({
                flex: 2,
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {finishing ? (
                <>
                  <ActivityIndicator color={Colors.text} size="small" />
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                    Saving…
                  </Text>
                </>
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Save Workout
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNextExercise}
              style={({ pressed }) => ({
                flex: 2,
                backgroundColor: allSetsLogged ? Colors.primary : "transparent",
                borderWidth: allSetsLogged ? 0 : 1,
                borderColor: Colors.border,
                paddingVertical: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{
                fontFamily: "Rubik_700Bold",
                fontSize: allSetsLogged ? 14 : 12,
                color: allSetsLogged ? Colors.text : Colors.textMuted,
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}>
                {allSetsLogged
                  ? "Next Exercise"
                  : `${setsRemaining} Set${setsRemaining !== 1 ? "s" : ""} Remaining`}
              </Text>
            </Pressable>
          )}
        </View>
      </View>


      {/* ── Exercise Panel ── bottom sheet showing all exercises in session */}
      <Modal
        visible={exercisePanelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setExercisePanelVisible(false); setSupersetPickMode(false); setSupersetPickSource(null); }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => { setExercisePanelVisible(false); setSupersetPickMode(false); setSupersetPickSource(null); }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: bottomInset + 8 }}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  {supersetPickMode ? "Tap an exercise to superset with" : "Workout Exercises"}
                </Text>
                <Pressable onPress={() => { setExercisePanelVisible(false); setSupersetPickMode(false); setSupersetPickSource(null); }} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </Pressable>
              </View>

              {supersetPickMode && (
                <View style={{ backgroundColor: Colors.primary + "22", paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.primary }}>
                    Select a second exercise to alternate sets with "{exerciseStates[supersetPickSource!]?.exercise.name}"
                  </Text>
                  <Pressable onPress={() => { setSupersetPickMode(false); setSupersetPickSource(null); }} hitSlop={8}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              <ScrollView style={{ maxHeight: screenHeight * 0.6 }}>
                {exerciseStates.map((ex, i) => {
                  const isBodyweightEx = ex.exercise.equipment === "BODYWEIGHT";
                  const isWeightedBWEx = ex.exercise.equipment === "WEIGHTED_BODYWEIGHT";
                  const setsLogged = ex.sets.filter((s) => s.feedback !== null).length;
                  const totalSets = ex.sets.length;
                  const isDone = setsLogged === totalSets;
                  const isCurrent = i === currentExerciseIndex;
                  const isPickSource = supersetPickSource === i;
                  const isPickable = supersetPickMode && !isPickSource;

                  const iconState = isPickSource ? "picking"
                    : ex.supersetGroup !== null ? "active"
                    : "inactive";

                  return (
                    <View key={ex.logId} style={{ position: "relative" }}>
                      {/* Left stripe — only shown when paired */}
                      {ex.supersetGroup !== null && (
                        <View style={{
                          position: "absolute", left: 0, top: 0, bottom: 0,
                          width: 3, backgroundColor: Colors.primary, zIndex: 1,
                        }} />
                      )}

                      <Pressable
                        onPress={() => {
                          if (supersetPickMode && supersetPickSource !== null && i !== supersetPickSource) {
                            createSuperset(supersetPickSource, i);
                            setSupersetPickMode(false);
                            setSupersetPickSource(null);
                            setExercisePanelVisible(false);
                            return;
                          }
                          if (!supersetPickMode) {
                            setCurrentExerciseIndex(i);
                            setExercisePanelVisible(false);
                          }
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          paddingLeft: ex.supersetGroup !== null ? 23 : 20,
                          paddingRight: 20,
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: Colors.border,
                          backgroundColor: isPickSource
                            ? Colors.primary + "22"
                            : isCurrent && !supersetPickMode
                              ? Colors.bgAccent
                              : "transparent",
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        {/* Status dot */}
                        <View style={{
                          width: 8, height: 8, borderRadius: 4, marginRight: 12,
                          backgroundColor: isDone ? Colors.success : isCurrent ? Colors.primary : Colors.border,
                        }} />

                        {/* Name + sets */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: isCurrent ? "Rubik_600SemiBold" : "Rubik_400Regular", fontSize: 13, color: isCurrent ? Colors.text : Colors.textSecondary }}>
                            {i + 1}. {ex.exercise.name}
                          </Text>
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                            {setsLogged}/{totalSets} sets · {ex.exercise.category}
                          </Text>
                        </View>

                        {/* Superset icon — always shown, tap to pair/unpair */}
                        {!supersetPickMode && (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              if (ex.supersetGroup !== null) {
                                removeFromSuperset(i);
                              } else {
                                setSupersetPickSource(i);
                                setSupersetPickMode(true);
                              }
                            }}
                            hitSlop={8}
                          >
                            <SupersetIcon state={iconState} size={28} />
                          </Pressable>
                        )}

                        {/* Pick target indicator */}
                        {isPickable && (
                          <Pressable
                            onPress={() => {
                              createSuperset(supersetPickSource!, i);
                              setSupersetPickMode(false);
                              setSupersetPickSource(null);
                              setExercisePanelVisible(false);
                            }}
                            hitSlop={8}
                          >
                            <SupersetIcon state="picking" size={28} />
                          </Pressable>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
                  Tap an exercise to jump to it · tap the icon to pair a superset
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Superset jump banner ─────────────────────────────────────────── */}
      {supersetJumpBanner !== null && (
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: 20,
          flexDirection: "row", alignItems: "center", gap: 8,
        }}>
          <SupersetIcon state="active" size={18} />
          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: "white", flex: 1 }}>
            SUPERSET → {supersetJumpBanner}
          </Text>
        </View>
      )}

      {/* ── Superset suggestion modal ─────────────────────────────────────── */}
      <Modal
        visible={supersetIntroVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSupersetIntroVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, width: "100%", padding: 24, gap: 16 }}>
            {/* Header */}
            <View style={{ alignItems: "center", gap: 8 }}>
              <SupersetIcon state="active" size={44} />
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" }}>
                Superset suggestions
              </Text>
              {supersetIntroIsFirstTime && (
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 18 }}>
                  Supersets alternate two exercises back-to-back with no rest between them — saves ~30% time and boosts intensity.
                </Text>
              )}
            </View>

            {/* Suggested pairs for this workout */}
            {(() => {
              const pairs = suggestSupersetPairs(exerciseStates);
              if (pairs.length === 0) return (
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>
                  No natural antagonist pairs found in today's exercises. You can still pair manually using the {" "}
                  <SupersetIcon state="inactive" size={12} /> icon.
                </Text>
              );
              return (
                <>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Suggested pairs for today
                  </Text>
                  <View style={{ gap: 8 }}>
                    {pairs.map(([a, b]) => (
                      <View key={`${a}-${b}`} style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, padding: 10, gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text }} numberOfLines={1}>
                            {exerciseStates[a]?.exercise.name}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.primary }}>↔</Text>
                        <View style={{ flex: 1, alignItems: "flex-end" }}>
                          <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text }} numberOfLines={1}>
                            {exerciseStates[b]?.exercise.name}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {
                      const pairs = suggestSupersetPairs(exerciseStates);
                      pairs.forEach(([a, b]) => createSuperset(a, b));
                      setSupersetIntroVisible(false);
                    }}
                    style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.8 : 1 })}
                  >
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: "white" }}>
                      Apply {pairs.length} superset{pairs.length > 1 ? "s" : ""} →
                    </Text>
                  </Pressable>
                </>
              );
            })()}

            <Pressable onPress={() => setSupersetIntroVisible(false)} hitSlop={8}>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" }}>
                Skip — standard sets
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

      {/* ── SET COUNT SCOPE PICKER ── */}
      <Modal
        visible={setManageModal !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSetManageModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
                {setManageModal === 'add' ? 'Add a Set' : 'Remove Last Set'}
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                Apply change to...
              </Text>
            </View>

            <Pressable
              onPress={() => handleConfirmSetChange('once')}
              disabled={setManageSaving}
              style={({ pressed }) => ({
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
                opacity: pressed || setManageSaving ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                Just this session
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                Next session reverts to the original set count
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleConfirmSetChange('permanent')}
              disabled={setManageSaving}
              style={({ pressed }) => ({
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
                opacity: pressed || setManageSaving ? 0.7 : 1,
              })}
            >
              {setManageSaving ? (
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
              onPress={() => setSetManageModal(null)}
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

                {/* Belt weight toggle — only shown for bodyweight-based exercises */}
                {(editEquipment === "BODYWEIGHT" || editEquipment === "WEIGHTED_BODYWEIGHT") && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                      Weight Type
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        { value: "BODYWEIGHT",          label: "Bodyweight Only" },
                        { value: "WEIGHTED_BODYWEIGHT", label: "+ Belt / Dumbbell" },
                      ].map((opt) => (
                        <Pressable
                          key={opt.value}
                          onPress={() => setEditEquipment(opt.value)}
                          style={({ pressed }) => ({
                            flex: 1,
                            borderWidth: 1,
                            borderColor: editEquipment === opt.value ? Colors.primary : Colors.border,
                            paddingVertical: 10,
                            alignItems: "center",
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: editEquipment === opt.value ? Colors.primary + "22" : "transparent",
                          })}
                        >
                          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: editEquipment === opt.value ? Colors.primary : Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

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


      {/* ── Plate Calculator Modal ── */}
      <Modal
        visible={plateCalcVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPlateCalcVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, padding: 20, paddingBottom: Math.max(bottomInset + 8, 24) }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Plate Calculator
              </Text>
              <Pressable onPress={() => setPlateCalcVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Target weight input */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Target Weight ({unit})
            </Text>
            <TextInput
              value={plateCalcTarget}
              onChangeText={(t) => {
                setPlateCalcTarget(t);
                const num = parseFloat(t);
                if (!isNaN(num) && num > 0) {
                  setPlateResult(calculatePlates(num, unit, plateCalcBar ?? undefined));
                } else {
                  setPlateResult(null);
                }
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 185"
              placeholderTextColor={Colors.textMuted}
              style={{
                fontFamily: "Rubik_700Bold",
                fontSize: 22,
                color: Colors.text,
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.bg,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 14,
                textAlign: "center",
              }}
            />

            {/* Bar weight selector */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Bar
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {BAR_PRESETS[unit].map((preset) => {
                const active = (plateCalcBar ?? (unit === "lbs" ? 45 : 20)) === preset.weight;
                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => {
                      setPlateCalcBar(preset.weight);
                      const num = parseFloat(plateCalcTarget);
                      if (!isNaN(num) && num > 0) {
                        setPlateResult(calculatePlates(num, unit, preset.weight));
                      }
                    }}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: active ? Colors.primary : Colors.border,
                      backgroundColor: active ? Colors.primary + "22" : Colors.bg,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: active ? "Rubik_700Bold" : "Rubik_400Regular", fontSize: 11, color: active ? Colors.primary : Colors.textMuted }}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Results */}
            {plateResult && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.primary, padding: 14 }}>
                {plateResult.platesPerSide.length === 0 ? (
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                    Bar only ({plateResult.barWeight} {unit})
                  </Text>
                ) : (
                  <>
                    <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                      Each Side
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {plateResult.platesPerSide.flatMap((p, i) =>
                        Array.from({ length: p.count }, (_, j) => (
                          <View key={`${i}-${j}`} style={{
                            backgroundColor: Colors.primary + "33",
                            borderWidth: 1,
                            borderColor: Colors.primary,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            minWidth: 42,
                            alignItems: "center",
                          }}>
                            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.primary }}>
                              {p.weight}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text }}>
                      Total: {plateResult.totalWeight} {unit}
                      {!plateResult.canMatch && (
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.warning }}>
                          {" "}(nearest possible)
                        </Text>
                      )}
                    </Text>
                    <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                      Bar ({plateResult.barWeight}) + {platesString(plateResult)} per side
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

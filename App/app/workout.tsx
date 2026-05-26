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

import YoutubePlayer from "react-native-youtube-iframe";
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
  getUserProfile,
  convertSetToMyoActivation,
  addMyoMiniSet,
  type WorkoutPlan,
  type Exercise,
  type SetType,
} from "@/lib/local-db";
import { getDPRepRange, type ProgressionMode } from "@/utils/progressionAlgorithm";
import {
  isMyoEligible,
  MYO_REST_SECONDS,
  MYO_MIN_REPS,
  MYO_MAX_MINI_SETS,
} from "@/utils/myoReps";
import { firePRNotification } from "@/lib/notifications";
import { usePurchase } from "@/contexts/PurchaseContext";
import * as Notifications from "expo-notifications";
import { calculatePlates, platesString, BAR_PRESETS, type PlateResult } from "@/utils/plateCalculator";

const SCIENCE_TIPS: { icon: string; text: string }[] = [
  { icon: "flask-outline",       text: "RIR 3 is the hypertrophy sweet spot — hard enough to grow, controlled enough for clean technique." },
  { icon: "time-outline",        text: "Heavy compounds need 3–4 min rest. ATP restores in ~90 sec but CNS recovery takes longer — skimping costs reps and volume." },
  { icon: "trending-up-outline", text: "Progressive overload = more weight OR more reps at the same load. Both drive muscle growth equally." },
  { icon: "moon-outline",        text: "Growth hormone peaks during deep sleep. 7-9 hours isn't optional — it's part of the program." },
  { icon: "body-outline",        text: "Controlled negatives (3-4 sec) increase mechanical tension — the primary driver of hypertrophy." },
  { icon: "fitness-outline",     text: "Focusing on the working muscle can raise activation by up to 35% in isolation exercises." },
  { icon: "refresh-outline",     text: "Deload weeks aren't lost training — they're when adaptations consolidate and performance rebounds." },
  { icon: "nutrition-outline",   text: "20-40 g protein within 2 hours post-workout maximizes muscle protein synthesis." },
  { icon: "stats-chart-outline", text: "Volume-load (weight × reps × sets) is the #1 hypertrophy driver. Short rests reduce it by forcing weight drops — rest longer to grow more." },
  { icon: "water-outline",       text: "Even 2% dehydration drops strength output 5-8%. Sip 500 ml before you start." },
  { icon: "thunderstorm-outline",text: "Antagonist supersets (chest + back) let one muscle recover while the other works — no strength loss." },
  { icon: "layers-outline",      text: "Accumulated fatigue masks fitness gains. Deloads reveal how much stronger you've actually become." },
  { icon: "pulse-outline",       text: "Myo-reps: one activation set near failure + 15 sec rests + mini-sets of 3–5. More effective reps in half the time — best saved for isolation finishers." },
  { icon: "flame-outline",       text: "Muscle soreness ≠ effective training. DOMS is inflammation, not a growth signal." },
  { icon: "cellular-outline",    text: "Each muscle needs 10-20 hard sets per week to grow. This program keeps you in that optimal range." },
  { icon: "barbell-outline",     text: "The 'short rest = growth hormone spike' is a myth. 2024 meta-analyses confirm these spikes don't meaningfully drive muscle protein synthesis." },
  { icon: "git-branch-outline",  text: "Double Progression: hold weight and chase the top of your rep range. Once every set hits the ceiling, increase load and reset. Simple and battle-tested." },
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
  setType: SetType;
  myoGroupId: string | null;
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
  isSkipped?: boolean; // true when user tapped "Skip Exercise"
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
  const { incrementTrialWorkout } = usePurchase();

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("arpo");
  const [isLoading, setIsLoading] = useState(true);

  // ── Myo-reps state ───────────────────────────────────────────────────────────
  const [myoActive, setMyoActive] = useState(false);
  const [myoGroupId, setMyoGroupId] = useState<string | null>(null);
  const [myoMiniCount, setMyoMiniCount] = useState(0);
  const myoMiniCountRef = useRef(0);
  const [myoRestActive, setMyoRestActive] = useState(false);
  const [myoRestSecsLeft, setMyoRestSecsLeft] = useState(MYO_REST_SECONDS);
  const myoRestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [myoRecommendVisible, setMyoRecommendVisible] = useState(false);
  const myoUsedThisSessionRef = useRef(false);
  const [myoExplainVisible, setMyoExplainVisible] = useState(false);
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
  const [videoModalVisible, setVideoModalVisible] = useState(false);
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
  // Incrementing key forces the TextInput to remount each time the modal opens,
  // fixing iOS controlled-TextInput desync where old typed text persists after close/reopen.
  const [plateCalcInputKey, setPlateCalcInputKey] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const restTimerContainerRef = useRef<View>(null);
  const restTimerY = useRef<number>(0);
  const exerciseStatesRef = useRef<ExerciseState[]>([]);
  const currentExerciseIndexRef = useRef(0); // mirrors currentExerciseIndex state for use in timer callbacks
  const handleConfirmRecoveryRef = useRef<() => void>(() => {}); // always points to latest handleConfirmRecovery
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
  const repsInputRefs   = useRef<Record<string, TextInput | null>>({});
  const focusedFieldRef = useRef<{ exIndex: number; si: number; field: "weight" | "reps" } | null>(null);
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
  // Tour should start after the superset intro modal is dismissed, not concurrently
  const pendingTourRef = useRef(false);
  // ── Superset jump banner ──────────────────────────────────────────────────
  const [supersetJumpBanner, setSupersetJumpBanner] = useState<string | null>(null);
  // ── Keyboard visibility (used to hide guide during input) ────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Ref mirror so async callbacks (setTimeout, updater fns) can read current value
  const keyboardVisibleRef = useRef(false);
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
    // Track keyboard so we can hide the exercise guide during set entry.
    // iOS fires "Will" events (before animation); Android only fires "Did" events.
    const kbShowEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const kbHideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const kbShow = Keyboard.addListener(kbShowEvent, () => { setKeyboardVisible(true); keyboardVisibleRef.current = true; });
    const kbHide = Keyboard.addListener(kbHideEvent, () => { setKeyboardVisible(false); keyboardVisibleRef.current = false; });
    // Cleanup timers on unmount
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (myoRestTimerRef.current) clearInterval(myoRestTimerRef.current);
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

    // Load user's progression mode preference
    const userId = await AsyncStorage.getItem("userId");
    if (userId) {
      const profile = await getUserProfile(userId);
      if (profile?.progressionMode) setProgressionMode(profile.progressionMode);
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

      // Start session timer (idempotent — INSERT OR IGNORE in DB)
      startWorkoutSession(plan.id, plan.currentWeek, currentDayNum).then(async (startedAt) => {
        startedAtRef.current = startedAt;
        const parsedStart = new Date(startedAt).getTime();
        const initial = Number.isFinite(parsedStart) ? Math.floor((Date.now() - parsedStart) / 1000) : 0;

        // Check tour status once here so we can coordinate with the superset modal
        const tourDone = await AsyncStorage.getItem("hasCompletedWorkoutTour");

        // Only trigger watch reminder / superset modal on a fresh session start (not resume)
        if (initial < 10) {
          // Show superset suggestion modal on fresh session start
          const hasSeen = await AsyncStorage.getItem("supersetIntroSeen");
          setSupersetIntroIsFirstTime(!hasSeen);
          setSupersetIntroVisible(true);
          if (!hasSeen) await AsyncStorage.setItem("supersetIntroSeen", "1");

          // If the tour hasn't been seen, defer it until the superset modal is dismissed.
          // Running two transparent Modals concurrently silently blocks all touches.
          if (!tourDone) pendingTourRef.current = true;

          const watchEnabled = await AsyncStorage.getItem("watchReminderEnabled");
          if (watchEnabled === "true") {
            setWatchBannerVisible(true);
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "Start your workout tracker ⌚",
                  body: "Open the Workout app on your Apple Watch and select Strength Training",
                  sound: false,
                },
                trigger: null,
              });
            } catch {}
            setTimeout(() => setWatchBannerVisible(false), 10000);
          }
        } else {
          // Resumed session — superset modal won't show, so fire tour directly if needed
          if (!tourDone) setTimeout(() => startTour(), 1000);
        }

        setElapsedSeconds(Math.max(0, initial));
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          const t = new Date(startedAt).getTime();
          if (Number.isFinite(t)) setElapsedSeconds(Math.floor((Date.now() - t) / 1000));
        }, 1000);
      }).catch((err) => {
        console.error("[workout] startWorkoutSession failed:", err);
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
          const isBodyweightEx = log.exercise.equipment === "BODYWEIGHT";
          return {
            setLogId: s.id,
            setNumber: s.setNumber,
            targetWeight: s.targetWeight,
            targetReps: s.targetReps,
            repsCompleted: s.repsCompleted !== null ? String(s.repsCompleted) : "",
            weightUsed: s.weightUsed !== null ? String(s.weightUsed) : "",
            feedback: hasData
              ? getFeedback(s.repsCompleted!, s.weightUsed ?? 0, s.targetWeight, s.targetReps, isBodyweightEx)
              : null,
            setType: s.setType ?? 'normal',
            myoGroupId: s.myoGroupId ?? null,
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

  /** Dismiss the superset intro modal, then start the tour if it was pending. */
  function dismissSupersetIntro() {
    setSupersetIntroVisible(false);
    if (pendingTourRef.current) {
      pendingTourRef.current = false;
      setTimeout(() => startTour(), 400); // short delay so modal fade-out completes
    }
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
    } else if (num < setData.targetWeight * 0.5) {
      // Likely a typo (e.g. "45" instead of "145") — warn without blocking
      const refKey = `${exIndex}-${si}`;
      Alert.alert(
        "Weight Seems Low",
        `You entered ${num}, which is less than half your target of ${setData.targetWeight}. Did you mean to type a different weight?`,
        [
          {
            text: "Fix it",
            onPress: () => {
              updateSet(exIndex, si, "weightUsed", "");
              setTimeout(() => weightInputRefs.current[refKey]?.focus(), 150);
            },
          },
          { text: "That's correct", style: "default" },
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
    // If the set was already logged, clear its feedback so it can be recalculated.
    // handleFieldBlur and autoLogSet both guard with `if (set.feedback) return`,
    // so without this clear the edited values would never update the feedback row.
    setExerciseStates((prev) => {
      const updated = [...prev];
      const ex = { ...updated[exIndex] };
      const sets = [...ex.sets];
      const hadFeedback = !!sets[setIndex]?.feedback;
      sets[setIndex] = { ...sets[setIndex], repsCompleted: value, ...(hadFeedback ? { feedback: null } : {}) };
      ex.sets = sets;
      updated[exIndex] = ex;
      return updated;
    });
    const num = parseInt(value);
    if (!isNaN(num)) {
      const ex = exerciseStatesRef.current[exIndex];
      const setLogId = ex.sets[setIndex].setLogId;
      // Fire-and-forget — don't await in onChangeText to avoid blocking iOS keyboard
      updateSetLog(setLogId, { repsCompleted: num }).catch(() => {});
      // Bodyweight exercises don't require a weight entry — auto-commit 0
      if (ex.exercise.equipment === "BODYWEIGHT") {
        updateSetLog(setLogId, { weightUsed: 0 }).catch(() => {});
      }
    }
  }

  function handleSetWeightChange(exIndex: number, setIndex: number, value: string) {
    // Clear feedback on edit so the row can be re-evaluated on next blur/log
    setExerciseStates((prev) => {
      const updated = [...prev];
      const ex = { ...updated[exIndex] };
      const sets = [...ex.sets];
      const hadFeedback = !!sets[setIndex]?.feedback;
      sets[setIndex] = { ...sets[setIndex], weightUsed: value, ...(hadFeedback ? { feedback: null } : {}) };
      ex.sets = sets;
      updated[exIndex] = ex;
      return updated;
    });
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const setLogId = exerciseStatesRef.current[exIndex].sets[setIndex].setLogId;
      // Fire-and-forget — don't await in onChangeText to avoid blocking iOS keyboard
      updateSetLog(setLogId, { weightUsed: num }).catch(() => {});
    }
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
  }, [exerciseStates]);

  useEffect(() => {
    currentExerciseIndexRef.current = currentExerciseIndex;
  }, [currentExerciseIndex]);

  // Auto-complete: as soon as every set on every exercise is logged, save and
  // navigate to the summary — no "Finish Workout" tap required.
  useEffect(() => {
    if (exerciseStates.length === 0) return;
    if (autoFinishTriggeredRef.current) return;
    if (finishingRef.current) return;
    const allDone = exerciseStates.every(isExerciseComplete);
    // Don't auto-finish while a myo block is running — mini-sets haven't fired yet.
    if (allDone && !myoActive) {
      autoFinishTriggeredRef.current = true;
      // Brief delay so the user sees the last feedback row before the screen transitions.
      // Use ref so the callback always captures the latest plan/state at call time.
      setTimeout(() => {
        handleConfirmRecoveryRef.current();
      }, 1200);
    }
  }, [exerciseStates]);

  function handleFieldBlur(exIndex: number, setIndex: number) {
    setTimeout(() => {
      // ── Read current values from the ref (safe in async callbacks) ──────────
      const snapEx = exerciseStatesRef.current[exIndex];
      const snapSet = snapEx?.sets[setIndex];
      if (!snapEx || !snapSet || snapSet.feedback) return;

      const isBodyweight = snapEx.exercise.equipment === "BODYWEIGHT";
      const reps = parseInt(snapSet.repsCompleted);
      if (isNaN(reps) || reps <= 0) return;
      if (!isBodyweight) {
        const weight = parseFloat(snapSet.weightUsed);
        if (isNaN(weight) || weight <= 0) return;
      }

      // ── Compute feedback and timer values OUTSIDE the updater ────────────────
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const weight = parseFloat(snapSet.weightUsed) || 0;
      const feedback = getFeedback(reps, weight, snapSet.targetWeight, snapSet.targetReps, isBodyweight);

      const isLastSet = setIndex === snapEx.sets.length - 1;
      const jumpingToPartner = hasActiveSupersertPartner(exIndex);
      const isMyo = snapSet.setType === 'myo_activation' || snapSet.setType === 'myo_mini';
      // Show timer after every set completion (including the last set of an exercise)
      // so navigating to the next exercise carries the rest period with you.
      const shouldStartTimer = !jumpingToPartner && !isMyo;
      const restSeconds = shouldStartTimer
        ? calculateRestTime(snapEx.exercise.category, (plan?.goalType ?? "hypertrophy") as any)
        : 0;

      // ── Update exercise state (updater does ONLY state mutation, no side-effects) ──
      setExerciseStates((current) => {
        const ex = current[exIndex];
        if (!ex) return current;
        const set = ex.sets[setIndex];
        if (!set || set.feedback) return current;
        const updated = [...current];
        const updatedEx = { ...updated[exIndex] };
        const updatedSets = [...updatedEx.sets];
        updatedSets[setIndex] = { ...updatedSets[setIndex], feedback };
        updatedEx.sets = updatedSets;
        updated[exIndex] = updatedEx;
        return updated;
      });

      // ── Start rest timer OUTSIDE the updater ────────────────────────────────
      if (shouldStartTimer) {
        setRestTimerSeconds(restSeconds);
        setRestTimerKey((prev) => prev + 1);
        setRestTimerVisible(true);
        // Only scroll to rest timer when keyboard is NOT visible — scrolling while
        // keyboard is open can silently unfocus the active TextInput on iOS.
        if (!keyboardVisibleRef.current) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: restTimerY.current - 16, animated: true });
          }, 150);
        }
      }

      // ── Jump to superset partner if set is now complete ──────────────────────
      const wasAlreadyDone = !!snapSet.feedback;
      if (!wasAlreadyDone) {
        const bw = snapEx.exercise.equipment === "BODYWEIGHT";
        const setIsDone = !isNaN(reps) && reps > 0 && (bw || (!isNaN(weight) && weight > 0));
        if (setIsDone && hasActiveSupersertPartner(exIndex)) {
          setTimeout(() => tryJumpToSupersetPartner(exIndex), 550);
        }
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

    // Don't start the rest timer if we're about to jump to a superset partner.
    // The timer fires after the partner set instead (end of the superset round).
    const jumpingToPartner = hasActiveSupersertPartner(exIndex);
    const isMyo = ex.sets[setIndex]?.setType === 'myo_activation' || ex.sets[setIndex]?.setType === 'myo_mini';
    if (!jumpingToPartner && !isMyo) {
      const category = ex.exercise.category;
      const restSeconds = calculateRestTime(category, (plan?.goalType ?? "hypertrophy") as any);
      setRestTimerSeconds(restSeconds);
      setRestTimerKey((prev) => prev + 1);
      setRestTimerVisible(true);
      // Only scroll to rest timer when keyboard is NOT visible — scrolling while
      // keyboard is open can silently unfocus the active TextInput on iOS.
      if (!keyboardVisibleRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: restTimerY.current - 16, animated: true });
        }, 150);
      }
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
    // Don't clear the rest timer here — if one is running from the last set it should
    // persist onto the next exercise so the user still gets their full rest period.
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
    // Exercises explicitly skipped by the user are considered handled
    if (ex.isSkipped) return true;
    if (ex.sets.length === 0) return false; // guard: [].every() is vacuously true
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
    // Prevent double-complete: this ref is set synchronously (before any await) so
    // JS's single-threaded event loop guarantees only the first caller proceeds.
    if (finishingRef.current) return;
    finishingRef.current = true;
    // Capture stable plan values NOW (before any await) to avoid stale closure issues
    const currentPlan = plan;
    const currentDayNumber = currentPlan?.currentDay ?? dayNumber;
    if (!currentPlan) { finishingRef.current = false; return; }
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
          setType: s.setType,
        })),
      }));

      // Save per-exercise notes — use ref to avoid stale closure capture
      await Promise.all(
        exerciseStatesRef.current
          .filter((ex) => ex.exerciseNotes.trim())
          .map((ex) => updateExerciseNotes(ex.logId, ex.exerciseNotes))
      );

      const result = await completeWorkout(planId, currentDayNumber, exercises);
      const currentRIR = exerciseStates.length > 0 ? exerciseStates[0].targetRIR : "";

      // Save session duration + notes; returns the DB-stamped completion timestamp
      const sessionCompletedAt = await finishWorkoutSession(planId, currentPlan.currentWeek, currentDayNumber, sessionNotes);

      // Fire a local notification for each PR (runs in background, non-blocking)
      if (result.prs.length > 0) {
        for (const pr of result.prs) {
          firePRNotification(pr.exerciseName, pr.newBest, pr.previousBest, unit).catch(() => {});
        }
      }

      // Count this completed session toward the free trial
      await incrementTrialWorkout();

      if (result.isMesoComplete) {
        // Clear activePlanId before navigating so a force-quit during meso-complete
        // doesn't leave a stale planId pointing at an inactive plan on next launch
        await AsyncStorage.removeItem("activePlanId");
        router.replace({ pathname: "/meso-complete", params: { planId } });
      } else {
        router.replace({
          pathname: "/summary",
          params: {
            planId,
            totalVolume: String(result.totalVolume),
            weekNumber: String(result.weekNumber),
            dayNumber: String(result.dayNumber),
            exerciseCount: String(exercises.length),
            nextWeekTargets: JSON.stringify(result.nextWeekTargets),
            currentRIR,
            prs: JSON.stringify(result.prs),
            completedAt: sessionCompletedAt,
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

  // Keep the ref pointing at the latest version so the auto-finish setTimeout
  // always calls the current handleConfirmRecovery (captures latest plan/state).
  handleConfirmRecoveryRef.current = handleConfirmRecovery;

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

    // Mark the exercise as skipped so isExerciseComplete() treats it as handled
    setExerciseStates((prev) =>
      prev.map((s, i) => i === exIndex ? { ...s, isSkipped: true } : s)
    );

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
              setType: s.setType ?? 'normal',
              myoGroupId: s.myoGroupId ?? null,
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
              setType: s.setType ?? 'normal',
              myoGroupId: s.myoGroupId ?? null,
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
                setType:       'normal' as SetType,
                myoGroupId:    null,
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

  // ── Myo-rep functions ────────────────────────────────────────────────────────

  async function activateMyoMode() {
    // Use the ref so we always read the latest state even in stale-closure contexts
    const idx = currentExerciseIndexRef.current;
    const ex = exerciseStatesRef.current[idx];
    if (!ex || myoActive) return;
    // Find the last incomplete set
    const incompleteIdx = [...ex.sets].map((s, i) => ({ s, i })).filter(({ s }) => !s.feedback).pop();
    if (!incompleteIdx) return;

    // Always show the explainer modal so the user gets a clear confirm step.
    // The modal's "Let's go" button calls activateMyoModeConfirmed().
    setMyoExplainVisible(true);
  }

  async function activateMyoModeConfirmed() {
    const idx = currentExerciseIndexRef.current;
    const ex = exerciseStatesRef.current[idx];
    if (!ex || myoActive) return;
    // Activate on the FIRST incomplete set (the one the user is about to do next).
    const incompleteIdx = [...ex.sets].map((s, i) => ({ s, i })).find(({ s }) => !s.feedback);
    if (!incompleteIdx) return;
    const { s: targetSet, i: setIndex } = incompleteIdx;
    const newGroupId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    try {
      await convertSetToMyoActivation(targetSet.setLogId, newGroupId);
    } catch (e) {
      Alert.alert("Myo Error", `Could not activate myo mode: ${String(e)}`);
      return;
    }
    // Drop all pending (no feedback) regular sets that come AFTER the activation set.
    // Without this, the rest-timer UI never shows (it requires the activation set to be
    // the last set), and mini-sets get appended after the dangling regular sets.
    const pendingAfter = ex.sets.slice(setIndex + 1).filter((s) => !s.feedback);
    for (let k = 0; k < pendingAfter.length; k++) {
      await removeLastSetFromLog(ex.logId);
    }
    // Cancel any regular rest timer that was already running
    setRestTimerVisible(false);
    setExerciseStates((prev) => {
      const next = [...prev];
      const exNext = { ...next[idx] };
      const setsNext = [...exNext.sets];
      setsNext[setIndex] = { ...setsNext[setIndex], setType: 'myo_activation', myoGroupId: newGroupId };
      // Remove the pending regular sets we deleted from the DB
      const filtered = setsNext.filter((s, i) => i <= setIndex || !!s.feedback);
      exNext.sets = filtered;
      exNext.targetSets = filtered.length;
      next[idx] = exNext;
      return next;
    });
    setMyoActive(true);
    setMyoGroupId(newGroupId);
    myoMiniCountRef.current = 0;
    setMyoMiniCount(0);
    setMyoRecommendVisible(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function startMyoRestTimer() {
    if (myoRestTimerRef.current) clearInterval(myoRestTimerRef.current);
    setMyoRestSecsLeft(MYO_REST_SECONDS);
    setMyoRestActive(true);
    myoRestTimerRef.current = setInterval(() => {
      setMyoRestSecsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(myoRestTimerRef.current!);
          setMyoRestActive(false);
          // Double haptic — distinct cue to start mini-set without looking
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 180);
          }
          appendMyoMiniSet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function appendMyoMiniSet() {
    const idx = currentExerciseIndexRef.current;
    const ex = exerciseStatesRef.current[idx];
    if (!ex || !myoGroupId) return;
    const newMini = await addMyoMiniSet(ex.logId, ex.targetWeight, myoGroupId);
    if (!newMini) return;
    const newCount = myoMiniCountRef.current + 1;
    myoMiniCountRef.current = newCount;
    setMyoMiniCount(newCount);
    setExerciseStates((prev) => {
      const next = [...prev];
      const exNext = { ...next[idx] };
      exNext.sets = [
        ...exNext.sets,
        {
          setLogId:      newMini.id,
          setNumber:     newMini.setNumber,
          targetWeight:  newMini.targetWeight,
          targetReps:    newMini.targetReps,
          repsCompleted: "",
          weightUsed:    String(ex.targetWeight), // pre-fill same weight
          feedback:      null,
          setType:       'myo_mini',
          myoGroupId:    myoGroupId,
        },
      ];
      next[idx] = exNext;
      return next;
    });
  }

  function terminateMyoBlock() {
    if (myoRestTimerRef.current) clearInterval(myoRestTimerRef.current);
    setMyoRestActive(false);
    setMyoActive(false);
    myoUsedThisSessionRef.current = true;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // Detect when a myo set gets feedback → drive the state machine
  useEffect(() => {
    if (!myoActive || !myoGroupId || myoRestActive) return;
    const ex = exerciseStatesRef.current[currentExerciseIndex];
    if (!ex) return;
    const myoSets = ex.sets.filter((s) => s.myoGroupId === myoGroupId);
    if (myoSets.length === 0) return;
    const last = myoSets[myoSets.length - 1];
    if (!last.feedback) return; // not completed yet
    if (last.setType === 'myo_activation') {
      startMyoRestTimer();
    } else if (last.setType === 'myo_mini') {
      const reps = parseInt(last.repsCompleted) || 0;
      if (reps < MYO_MIN_REPS || myoMiniCountRef.current >= MYO_MAX_MINI_SETS) {
        terminateMyoBlock();
      } else {
        startMyoRestTimer();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseStates, myoActive, myoRestActive]);

  // Reset active myo block when user navigates away from an exercise mid-block
  useEffect(() => {
    if (myoActive) {
      if (myoRestTimerRef.current) clearInterval(myoRestTimerRef.current);
      setMyoRestActive(false);
      setMyoActive(false);
      setMyoGroupId(null);
      myoMiniCountRef.current = 0;
      setMyoMiniCount(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExerciseIndex]);

  // Myo recommendation — check when current exercise changes
  useEffect(() => {
    setMyoRecommendVisible(false); // reset on every exercise change
    if (exerciseStates.length === 0 || myoActive || myoUsedThisSessionRef.current) return;
    const ex = exerciseStates[currentExerciseIndex];
    if (!ex) return;
    // Eligibility
    if (!isMyoEligible(ex.exercise.category, ex.exercise.name)) return;
    // Skip on deload week
    if (plan && ((plan.currentWeek - 1) % 4) + 1 === 4) return;
    // Check skip count from AsyncStorage
    AsyncStorage.getItem(`myo_skip_${ex.exerciseId}`).then((raw) => {
      const count = parseInt(raw ?? "0");
      if (count < 3) setMyoRecommendVisible(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExerciseIndex, exerciseStates.length]);

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

  /** Extract an 11-char YouTube video ID from youtu.be/..., youtube.com/watch?v=..., or youtube.com/shorts/... URLs */
  function extractYouTubeId(url: string): string | null {
    if (!url) return null;
    const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    const longMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (longMatch) return longMatch[1];
    const shortsMatch = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  }

  // In DP mode show "min–max" rep range instead of a fixed target.
  // Myo-mini sets always show their own target (e.g. "3") — never the DP range.
  function getRepDisplay(targetReps: number, isMyo = false): string {
    if (!isMyo && progressionMode === "double_progression" && plan) {
      const [minR, maxR] = getDPRepRange(currentEx.exercise.category, plan.goalType as any);
      return `${minR}–${maxR}`;
    }
    return String(targetReps);
  }
  const allSetsLogged = currentEx.sets.every((s) =>
    isBodyweight ? s.repsCompleted !== "" : s.repsCompleted !== "" && s.weightUsed !== ""
  );
  const setsRemaining = allSetsLogged ? 0 : currentEx.sets.filter((s) =>
    isBodyweight ? s.repsCompleted === "" : s.repsCompleted === "" || s.weightUsed === ""
  ).length;

  return (
    // Outer View holds safe-area insets so the KAV only adjusts the content area, not the header
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, paddingBottom: bottomInset }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>

      {/* ── Watch reminder banner ── */}
      {watchBannerVisible && (
        <Pressable
          onPress={() => setWatchBannerVisible(false)}
          style={{
            backgroundColor: Colors.bgAccent,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 18 }}>⌚</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, letterSpacing: 0.5 }}>
              Start Strength Training on your Apple Watch
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
              Open the Workout app → Strength Training · Tap to dismiss
            </Text>
          </View>
          <Ionicons name="close" size={16} color={Colors.textSecondary} />
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
        <Pressable
          onPress={() => {
            // Only prompt if the workout has started (at least one set logged)
            const anyLogged = exerciseStates.some((ex) =>
              ex.sets.some((s) => s.repsCompleted !== "")
            );
            if (!anyLogged || finishing) {
              router.canGoBack() ? router.back() : router.replace("/(tabs)");
              return;
            }
            Alert.alert(
              "Leave Workout?",
              "Your progress is saved and you can resume this workout later from the dashboard.",
              [
                { text: "Keep Going", style: "cancel" },
                {
                  text: "Leave",
                  style: "destructive",
                  onPress: () => router.canGoBack() ? router.back() : router.replace("/(tabs)"),
                },
              ]
            );
          }}
          hitSlop={12}
        >
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

      {/* ── Single ScrollView: exercise header + set table + ratings ──────────
           Merging into one scrollable area keeps set rows visible above the keyboard ── */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">

        {/* ── Exercise name row ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>
            {currentEx.exercise.name}
          </Text>
          {currentEx.supersetGroup !== null && (
            <SupersetIcon state="active" size={22} />
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
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
          {progressionMode === "double_progression" && (
            <>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>|</Text>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1 }}>
                DP
              </Text>
            </>
          )}
        </View>

        {/* ── Action bar: secondary actions + Watch video ── */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, alignItems: "center" }} ref={videoButtonRef}>
          {/* Edit */}
          <Pressable
            testID="edit-exercise-btn"
            onPress={openEditModal}
            style={({ pressed }) => ({
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
              height: 38, borderWidth: 1, borderColor: Colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Edit
            </Text>
          </Pressable>

          {/* Swap */}
          <Pressable
            testID="swap-exercise-btn"
            onPress={() => setSwapModalVisible(true)}
            style={({ pressed }) => ({
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
              height: 38, borderWidth: 1, borderColor: Colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Swap
            </Text>
          </Pressable>

          {/* Reset */}
          <Pressable
            testID="reset-workout-btn"
            onPress={() => setResetModalVisible(true)}
            style={({ pressed }) => ({
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
              height: 38, borderWidth: 1, borderColor: Colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
              Reset
            </Text>
          </Pressable>

          {/* Watch video — primary, red, only shown when URL exists */}
          {currentEx.exercise.defaultVideoUrl ? (
            <Pressable
              testID="video-link-btn"
              onPress={() => setVideoModalVisible(true)}
              style={({ pressed }) => ({
                flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                height: 38, backgroundColor: Colors.primary,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>
                Watch
              </Text>
            </Pressable>
          ) : (
            <View style={{
              flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              height: 38, borderWidth: 1, borderColor: Colors.border, opacity: 0.35,
            }}>
              <Ionicons name="play-outline" size={14} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Watch
              </Text>
            </View>
          )}
        </View>

        {/* ── Myo-rep Recommendation Card ── */}
        {myoRecommendVisible && !myoActive && (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: "#F59E0B55",
            borderLeftWidth: 3,
            borderLeftColor: "#F59E0B",
            backgroundColor: "#F59E0B0D",
          }}>
            <Text style={{ fontSize: 16 }}>〰</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1 }}>
                Classic Myo-rep exercise
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>
                Finish strong — activation set + mini-sets for maximum effective reps.
              </Text>
            </View>
            <Pressable
              onPress={() => { activateMyoMode(); }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F59E0B", marginLeft: 4 }}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: "#000", textTransform: "uppercase", letterSpacing: 1 }}>
                Try
              </Text>
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={() => {
                setMyoRecommendVisible(false);
                const exId = currentEx.exerciseId;
                AsyncStorage.getItem(`myo_skip_${exId}`).then((raw) => {
                  const count = parseInt(raw ?? "0") + 1;
                  AsyncStorage.setItem(`myo_skip_${exId}`, String(count));
                });
              }}
            >
              <Ionicons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

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
                ) : currentEx.exercise.equipment === "BARBELL" ? (
                  /* Barbell only — show plate calculator trigger */
                  <Pressable
                    onPress={() => {
                      const target = currentEx.targetWeight > 0 ? String(currentEx.targetWeight) : "";
                      setPlateCalcTarget(target);
                      setPlateCalcBar(null);
                      setPlateCalcInputKey(k => k + 1);
                      if (target) {
                        setPlateResult(calculatePlates(parseFloat(target), unit));
                      } else {
                        setPlateResult(null);
                      }
                      Keyboard.dismiss();
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
                ) : (
                  /* Cable / machine / other — plain unit label */
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    {unit}
                  </Text>
                )}
              </View>
            )}
            <View style={{ flex: 1, paddingVertical: 8, alignItems: "center" }}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 9, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Reps
              </Text>
            </View>
          </View>

          {(() => {
            // Index of the most recently completed myo set in the active group.
            // Used to show the amber rest countdown after the right row regardless
            // of how many sets remain in the list.
            const lastCompletedMyoIdx = (myoActive && myoGroupId)
              ? currentEx.sets.reduce<number>(
                  (last, s, i) => (s.myoGroupId === myoGroupId && s.feedback !== null ? i : last),
                  -1
                )
              : -1;
            return currentEx.sets.map((set, si) => {
            const isSetDone = isBodyweight
              ? set.repsCompleted !== ""
              : set.repsCompleted !== "" && set.weightUsed !== "";
            const isMyo = set.setType === 'myo_activation' || set.setType === 'myo_mini';
            const myoAccent = "#F59E0B";
            // Show rest countdown after the most recently completed myo set in the group
            const isLastMyoCompletedBeforeRest =
              myoRestActive &&
              si === lastCompletedMyoIdx;
            return (
              <View key={set.setLogId}>
                {/* Myo rest timer — inline amber countdown */}
                {isLastMyoCompletedBeforeRest && (
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: "#F59E0B11",
                    borderLeftWidth: 3,
                    borderLeftColor: myoAccent,
                    marginBottom: 2,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 14 }}>〰</Text>
                      <View>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: myoAccent, textTransform: "uppercase", letterSpacing: 1 }}>
                          Rest — breathe deep
                        </Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 }}>
                          Mini-set incoming · aim for 3–5 reps
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: myoAccent, fontVariant: ["tabular-nums"] }}>
                        {myoRestSecsLeft}s
                      </Text>
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          if (myoRestTimerRef.current) clearInterval(myoRestTimerRef.current);
                          setMyoRestActive(false);
                          appendMyoMiniSet();
                        }}
                      >
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: myoAccent, textTransform: "uppercase", letterSpacing: 1 }}>
                          Skip
                        </Text>
                      </Pressable>
                      <Pressable hitSlop={10} onPress={terminateMyoBlock}>
                        <Ionicons name="stop-circle-outline" size={18} color={Colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    borderBottomWidth: si < currentEx.sets.length - 1 || set.feedback ? 1 : 0,
                    borderBottomColor: isMyo ? myoAccent + "33" : Colors.border,
                    alignItems: "center",
                    borderLeftWidth: set.setType === 'myo_activation' ? 3 : set.setType === 'myo_mini' ? 2 : 0,
                    borderLeftColor: myoAccent,
                    backgroundColor: isMyo ? "#F59E0B07" : "transparent",
                  }}
                >
                  <View style={{ width: 40, paddingVertical: 10, alignItems: "center", borderRightWidth: 1, borderRightColor: isMyo ? "#F59E0B33" : Colors.border }}>
                    {set.setType === 'myo_activation' ? (
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 9, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>
                        ACT
                      </Text>
                    ) : set.setType === 'myo_mini' ? (
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: "#F59E0B", textTransform: "uppercase" }}>
                        {`M${currentEx.sets.slice(0, si + 1).filter(s => s.setType === 'myo_mini').length}`}
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 16, color: isSetDone ? Colors.success : Colors.text }}>
                        {set.setNumber}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderRightWidth: 1, borderRightColor: Colors.border }}>
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text }}>
                      {(() => {
                        const isMyo = set.setType === 'myo_activation' || set.setType === 'myo_mini';
                        const repStr = getRepDisplay(set.targetReps, isMyo);
                        if (isBodyweight) return `BW × ${repStr}`;
                        if (isWeightedBW) return set.targetWeight > 0 ? `BW+${set.targetWeight} × ${repStr}` : `BW × ${repStr}`;
                        return `${set.targetWeight} ${unit} × ${repStr}`;
                      })()}
                    </Text>
                  </View>

                  {!isBodyweight && (
                    <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: Colors.border }}>
                      <TextInput
                        ref={(r) => { weightInputRefs.current[`${currentExerciseIndex}-${si}`] = r; }}
                        value={set.weightUsed}
                        onChangeText={(v) => handleSetWeightChange(currentExerciseIndex, si, v)}
                        onFocus={() => { focusedFieldRef.current = { exIndex: currentExerciseIndex, si, field: "weight" }; }}
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
                      ref={(r) => { repsInputRefs.current[`${currentExerciseIndex}-${si}`] = r; }}
                      value={set.repsCompleted}
                      onChangeText={(v) => handleSetRepsChange(currentExerciseIndex, si, v)}
                      onFocus={() => { focusedFieldRef.current = { exIndex: currentExerciseIndex, si, field: "reps" }; }}
                      onBlur={() => handleFieldBlur(currentExerciseIndex, si)}
                      keyboardType="decimal-pad"
        
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
                    {/* Checkmark — always visible. Dim outline = waiting for input,
                        bright filled = ready to confirm (tap to log + dismiss keyboard),
                        coloured = set confirmed. This is the primary confirmation affordance. */}
                    <Pressable
                      onPress={() => {
                        if (set.feedback) return; // already logged
                        if (!isSetDone) return;   // values not yet entered
                        Keyboard.dismiss();
                        handleLogSet(currentExerciseIndex, si);
                      }}
                      hitSlop={12}
                      style={{ paddingRight: 10, paddingLeft: 4 }}
                    >
                      <Ionicons
                        name={set.feedback ? "checkmark-circle" : isSetDone ? "checkmark-circle" : "checkmark-circle-outline"}
                        size={24}
                        color={
                          set.feedback
                            ? set.feedback.color
                            : isSetDone
                            ? Colors.primary
                            : Colors.border
                        }
                      />
                    </Pressable>
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
          }); // close sets.map
          })()}  {/* close lastCompletedMyoIdx IIFE */}
        </View>

        {/* Plate calculator shortcut — barbell only */}
        {!isBodyweight && !isWeightedBW && currentEx.exercise.equipment === "BARBELL" && (
          <Pressable
            onPress={() => {
              const target = currentEx.targetWeight > 0 ? String(currentEx.targetWeight) : "";
              setPlateCalcTarget(target);
              setPlateCalcBar(null);
              setPlateCalcInputKey(k => k + 1);
              if (target) setPlateResult(calculatePlates(parseFloat(target), unit));
              else setPlateResult(null);
              Keyboard.dismiss();
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

              {/* Add set / Myo button */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* Myo-reps toggle */}
                {!myoActive && isMyoEligible(currentEx.exercise.category, currentEx.exercise.name) ? (
                  <Pressable
                    onPress={activateMyoMode}
                    hitSlop={12}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: "#F59E0B55",
                      backgroundColor: "#F59E0B0D",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: "#F59E0B", letterSpacing: 0.5 }}>〰 MYO</Text>
                  </Pressable>
                ) : myoActive ? (
                  <Pressable
                    onPress={terminateMyoBlock}
                    hitSlop={12}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: "#F59E0B",
                      backgroundColor: "#F59E0B22",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="stop-circle-outline" size={12} color="#F59E0B" />
                    <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: "#F59E0B", letterSpacing: 0.5 }}>STOP MYO</Text>
                  </Pressable>
                ) : null}
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
            </View>
          );
        })()}

        {/* Per-exercise ratings — appear once all sets are complete */}
        {isExerciseComplete(currentEx) && (
          <View
            style={{ marginTop: 20, borderWidth: 1, borderColor: Colors.primary + "66", padding: 16 }}
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
        onRequestClose={dismissSupersetIntro}
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
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
                  Supersets alternate two exercises back-to-back with no rest — saves ~30% time and boosts intensity.
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
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                    Suggested pairs for today
                  </Text>
                  <View style={{ gap: 8 }}>
                    {pairs.map(([a, b]) => (
                      <View key={`${a}-${b}`} style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, paddingHorizontal: 14, gap: 6 }}>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                          {exerciseStates[a]?.exercise.name}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 12, color: Colors.primary }}>↔</Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                        </View>
                        <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                          {exerciseStates[b]?.exercise.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {
                      const pairs = suggestSupersetPairs(exerciseStates);
                      // Apply all pairs in a single state update to avoid
                      // triggering the auto-finish useEffect once per pair
                      setExerciseStates((prev) => {
                        let next = [...prev];
                        pairs.forEach(([a, b]) => {
                          const groupId = supersetGroupCounterRef.current++;
                          next = next.map((ex, i) =>
                            i === a || i === b ? { ...ex, supersetGroup: groupId } : ex
                          );
                        });
                        return next;
                      });
                      dismissSupersetIntro();
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

            <Pressable onPress={dismissSupersetIntro} hitSlop={8}>
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.textSecondary, textAlign: "center" }}>
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


      {/* ── Myo-Rep Explainer Modal ── */}
      <Modal
        visible={myoExplainVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMyoExplainVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000000CC", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: "#F59E0B55", width: "100%", maxWidth: 420 }}>
            {/* Header */}
            <View style={{ backgroundColor: "#F59E0B18", borderBottomWidth: 1, borderBottomColor: "#F59E0B44", padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 18 }}>〰</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1.5 }}>
                  Myo-Rep Sets
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                  More effective reps in less time
                </Text>
              </View>
              <Pressable onPress={() => setMyoExplainVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ padding: 16, gap: 14 }}>
              {/* Step 1 */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#000" }}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Activation Set</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    Do your set to near failure — aim for 10–15 reps. This primes your motor units.
                  </Text>
                </View>
              </View>

              {/* Step 2 */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#000" }}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>15-Second Rest</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    A countdown timer appears automatically. Take 3–5 deep breaths — just enough to clear lactic acid.
                  </Text>
                </View>
              </View>

              {/* Step 3 */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: "#000" }}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Mini-Sets (M1, M2 …)</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    A new row appears — do 3–5 reps with the same weight and log it. Rest timer fires again automatically.
                  </Text>
                </View>
              </View>

              {/* Stop condition */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <Ionicons name="stop" size={11} color="#000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>Stop When …</Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    You can't hit 3 reps, or after 5 mini-sets. Tap STOP MYO anytime to end early.
                  </Text>
                </View>
              </View>

              {/* Tip */}
              <View style={{ backgroundColor: Colors.bg, borderLeftWidth: 3, borderLeftColor: "#F59E0B", padding: 10, marginTop: 2 }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 16 }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", color: Colors.text }}>Best for: </Text>
                  isolation exercises like curls, lateral raises, and tricep extensions — not heavy compounds.
                </Text>
              </View>
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border }}>
              <Pressable
                onPress={() => setMyoExplainVisible(false)}
                style={({ pressed }) => ({ flex: 1, paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.7 : 1, borderRightWidth: 1, borderRightColor: Colors.border })}
              >
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted }}>Maybe later</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await AsyncStorage.setItem("hasSeenMyoExplainer", "true");
                  setMyoExplainVisible(false);
                  await activateMyoModeConfirmed();
                }}
                style={({ pressed }) => ({ flex: 1.4, paddingVertical: 14, alignItems: "center", backgroundColor: "#F59E0B", opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: "#000", textTransform: "uppercase", letterSpacing: 1 }}>
                  Let's go →
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Plate Calculator Modal ── */}
      <Modal
        visible={plateCalcVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); setPlateCalcVisible(false); }}
      >
        {/* KeyboardAvoidingView pushes the sheet up when the decimal-pad appears */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable style={{ flex: 1, backgroundColor: "#00000088" }} onPress={() => { Keyboard.dismiss(); setPlateCalcVisible(false); }} />
          <View style={{ backgroundColor: Colors.bgAccent, borderTopWidth: 1, borderTopColor: Colors.border, padding: 20, paddingBottom: Math.max(bottomInset + 8, 24) }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Plate Calculator
              </Text>
              <Pressable onPress={() => { Keyboard.dismiss(); setPlateCalcVisible(false); }} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Results — shown ABOVE input so they stay visible when keyboard is open */}
            {plateResult ? (
              <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.primary, padding: 14, marginBottom: 16 }}>
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
            ) : (
              <View style={{ borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", padding: 14, marginBottom: 16, alignItems: "center" }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted }}>
                  Enter a weight to see plate breakdown
                </Text>
              </View>
            )}

            {/* Bar weight selector */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Bar
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
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

            {/* Target weight input — at the bottom, closest to the keyboard */}
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Target Weight ({unit})
            </Text>
            <TextInput
              key={plateCalcInputKey}
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
                textAlign: "center",
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── YouTube Video Modal ── */}
      <Modal
        visible={videoModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVideoModalVisible(false)}
      >
        {(() => {
          const videoId = extractYouTubeId(currentEx?.exercise.defaultVideoUrl ?? "");
          return (
            <View style={{ flex: 1, backgroundColor: "#000" }}>
              {/* Header */}
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
                backgroundColor: Colors.bg,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }} numberOfLines={1}>
                    {currentEx?.exercise.name}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                    {currentEx?.exercise.category} · {currentEx?.exercise.equipment}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setVideoModalVisible(false)}
                  hitSlop={12}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
                >
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              {videoId ? (
                <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#000" }}>
                  <YoutubePlayer
                    height={220}
                    videoId={videoId}
                    play
                    webViewStyle={{ backgroundColor: "#000" }}
                    webViewProps={{ allowsFullscreenVideo: true }}
                    initialPlayerParams={{ rel: false, modestbranding: true }}
                  />
                </View>
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <Ionicons name="videocam-off-outline" size={40} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 14, color: Colors.textMuted }}>
                    No video available for this exercise.
                  </Text>
                </View>
              )}

              {/* "Can't play? Open in YouTube" fallback */}
              {videoId && (
                <Pressable
                  onPress={() => Linking.openURL(currentEx?.exercise.defaultVideoUrl ?? "").catch(() => {})}
                  style={({ pressed }) => ({
                    backgroundColor: Colors.bg, paddingVertical: 14, alignItems: "center",
                    borderTopWidth: 1, borderTopColor: Colors.border, opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted }}>
                    Can't play?{" "}
                    <Text style={{ color: Colors.primary, textDecorationLine: "underline" }}>
                      Open in YouTube
                    </Text>
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })()}
      </Modal>
    </KeyboardAvoidingView>

    {/* Keyboard dismissed by tapping the ✓ on each row, or swiping down (keyboardDismissMode="interactive") */}
    </View>
  );
}

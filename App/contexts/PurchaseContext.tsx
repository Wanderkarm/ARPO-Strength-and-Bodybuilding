/**
 * PurchaseContext
 *
 * Manages a 3-workout action-based free trial and one-time unlock via RevenueCat.
 *
 * Trial model:
 *   • Users complete up to 3 workouts free (no time limit)
 *   • After the 3rd completion, isTrialExpired = true → hard paywall on next launch
 *   • incrementTrialWorkout() is called once per completed session in workout.tsx
 *
 * RevenueCat setup checklist (do this once before TestFlight / App Store):
 *   1. App Store Connect → In-App Purchases → Non-Consumable
 *        Product ID : com.powrlog.app.unlock
 *        Reference name: POWRLOG Unlock
 *        Price: $9.95 (founder tier — change when moving to standard price)
 *   2. revenuecat.com → Projects → New app (iOS)
 *        → Attach the product above → Entitlement ID: "pro"
 *        → Offerings → New offering (default) → Add package → link the product
 *   3. Paste your RevenueCat Public iOS SDK key below ↓
 *
 * Testing without RevenueCat (Simulator / Expo Go):
 *   Set BYPASS_PAYWALL_IN_DEV = true to skip all purchase logic.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

// ─── Configuration ────────────────────────────────────────────────────────────

const REVENUECAT_IOS_KEY    = "appl_NtywFdJvlsDyWsGxoutkBXqFaLk";
const ENTITLEMENT_ID        = "pro";
export const TRIAL_WORKOUTS = 3;
export const UNLOCK_PRICE_LABEL   = "$9.95";  // founder's price — raise to REGULAR_PRICE_LABEL after 500 sales
export const REGULAR_PRICE_LABEL  = "$29.95"; // standard price shown as "Regular price" on paywall
export const FOUNDING_TIER_COUNT  = 500;      // number of founding-member slots

/** Set true to skip all paywall logic during local dev / simulator testing */
const BYPASS_PAYWALL_IN_DEV = false;

// ─── AsyncStorage keys ────────────────────────────────────────────────────────

const TRIAL_COUNT_KEY = "trialWorkoutCount";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseContextType {
  isLoading:               boolean;
  isPurchased:             boolean;
  isTrialExpired:          boolean;
  /** How many free workouts the user has left (0 when trial is up) */
  trialWorkoutsRemaining:  number;
  /** Call once after each completed workout session */
  incrementTrialWorkout:   () => Promise<void>;
  purchaseUnlock:          () => Promise<{ success: boolean; error?: string }>;
  restorePurchases:        () => Promise<{ success: boolean; error?: string }>;
}

const PurchaseContext = createContext<PurchaseContextType>({
  isLoading:              true,
  isPurchased:            false,
  isTrialExpired:         false,
  trialWorkoutsRemaining: TRIAL_WORKOUTS,
  incrementTrialWorkout:  async () => {},
  purchaseUnlock:         async () => ({ success: false }),
  restorePurchases:       async () => ({ success: false }),
});

export function usePurchase() {
  return useContext(PurchaseContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const [isLoading,          setIsLoading]          = useState(true);
  const [isPurchased,        setIsPurchased]        = useState(false);
  const [completedWorkouts,  setCompletedWorkouts]  = useState(0);

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      // ── Dev bypass ──────────────────────────────────────────────────────────
      if (BYPASS_PAYWALL_IN_DEV) {
        setIsPurchased(true);
        setIsLoading(false);
        return;
      }

      // ── RevenueCat purchase check ──────────────────────────────────────────
      if (Platform.OS !== "web" && REVENUECAT_IOS_KEY !== "YOUR_REVENUECAT_IOS_API_KEY") {
        try {
          Purchases.setLogLevel(LOG_LEVEL.ERROR);
          Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
          const info = await Purchases.getCustomerInfo();
          if (info.entitlements.active[ENTITLEMENT_ID]) {
            setIsPurchased(true);
            setIsLoading(false);
            return;
          }
        } catch {
          // RevenueCat unavailable (no network, simulator, etc.) — fall through
          // to trial logic so the app still functions
        }
      }

      // ── Trial workout count ────────────────────────────────────────────────
      const raw = await AsyncStorage.getItem(TRIAL_COUNT_KEY);
      setCompletedWorkouts(raw ? parseInt(raw, 10) : 0);
    } catch (err) {
      console.error("[PurchaseContext] init error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // ─── increment ──────────────────────────────────────────────────────────────
  async function incrementTrialWorkout(): Promise<void> {
    if (isPurchased) return; // already unlocked — don't touch the counter
    const newCount = completedWorkouts + 1;
    setCompletedWorkouts(newCount);
    await AsyncStorage.setItem(TRIAL_COUNT_KEY, String(newCount));
  }

  // ─── purchase ───────────────────────────────────────────────────────────────
  async function purchaseUnlock(): Promise<{ success: boolean; error?: string }> {
    if (REVENUECAT_IOS_KEY === "YOUR_REVENUECAT_IOS_API_KEY") {
      return { success: false, error: "RevenueCat API key not configured. See PurchaseContext.tsx." };
    }
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages[0];
      if (!pkg) return { success: false, error: "Product unavailable. Try again later." };

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        setIsPurchased(true);
        return { success: true };
      }
      return { success: false, error: "Purchase completed but not activated. Tap Restore." };
    } catch (err: any) {
      if (err?.userCancelled) return { success: false };
      return { success: false, error: err?.message ?? "Purchase failed. Please try again." };
    }
  }

  // ─── restore ────────────────────────────────────────────────────────────────
  async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
    if (REVENUECAT_IOS_KEY === "YOUR_REVENUECAT_IOS_API_KEY") {
      return { success: false, error: "RevenueCat API key not configured." };
    }
    try {
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active[ENTITLEMENT_ID]) {
        setIsPurchased(true);
        return { success: true };
      }
      return { success: false, error: "No previous purchase found for this Apple ID." };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Restore failed. Please try again." };
    }
  }

  // ─── Derived values ──────────────────────────────────────────────────────────
  const trialWorkoutsRemaining = Math.max(0, TRIAL_WORKOUTS - completedWorkouts);
  const isTrialExpired         = trialWorkoutsRemaining === 0 && !isPurchased;

  return (
    <PurchaseContext.Provider value={{
      isLoading,
      isPurchased,
      isTrialExpired,
      trialWorkoutsRemaining,
      incrementTrialWorkout,
      purchaseUnlock,
      restorePurchases,
    }}>
      {children}
    </PurchaseContext.Provider>
  );
}

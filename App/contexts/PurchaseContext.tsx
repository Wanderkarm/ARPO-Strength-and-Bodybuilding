/**
 * PurchaseContext
 *
 * Manages the 7-day free trial and one-time unlock purchase via RevenueCat.
 *
 * Setup checklist:
 *   1. App Store Connect → create Non-Consumable IAP, product ID: com.powrlog.app.unlock
 *   2. revenuecat.com → new iOS app → attach product → entitlement ID: "pro"
 *   3. Paste your RevenueCat public iOS API key below ↓
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

const REVENUECAT_IOS_KEY = "YOUR_REVENUECAT_IOS_API_KEY"; // ← paste here
const ENTITLEMENT_ID     = "pro";
export const TRIAL_DAYS  = 7;
export const UNLOCK_PRICE_LABEL = "$6.99";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseContextType {
  isLoading:           boolean;
  isPurchased:         boolean;
  isTrialExpired:      boolean;
  trialDaysRemaining:  number;
  purchaseUnlock:      () => Promise<{ success: boolean; error?: string }>;
  restorePurchases:    () => Promise<{ success: boolean; error?: string }>;
}

const PurchaseContext = createContext<PurchaseContextType>({
  isLoading:          true,
  isPurchased:        false,
  isTrialExpired:     false,
  trialDaysRemaining: TRIAL_DAYS,
  purchaseUnlock:     async () => ({ success: false }),
  restorePurchases:   async () => ({ success: false }),
});

export function usePurchase() {
  return useContext(PurchaseContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const [isLoading,          setIsLoading]          = useState(true);
  const [isPurchased,        setIsPurchased]        = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(TRIAL_DAYS);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      if (Platform.OS !== "web") {
        Purchases.setLogLevel(LOG_LEVEL.ERROR);
        Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });

        const info = await Purchases.getCustomerInfo();
        if (info.entitlements.active[ENTITLEMENT_ID]) {
          setIsPurchased(true);
          return; // purchased — skip trial logic
        }
      }

      // Compute trial days remaining
      const raw = await AsyncStorage.getItem("firstLaunchDate");
      if (raw) {
        const elapsed = (Date.now() - new Date(raw).getTime()) / 86_400_000;
        setTrialDaysRemaining(Math.max(0, Math.ceil(TRIAL_DAYS - elapsed)));
      }
      // If no firstLaunchDate yet, trial hasn't started (user hasn't onboarded)
    } catch (err) {
      console.error("[PurchaseContext] init error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function purchaseUnlock(): Promise<{ success: boolean; error?: string }> {
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

  async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
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

  const isTrialExpired = trialDaysRemaining === 0 && !isPurchased;

  return (
    <PurchaseContext.Provider value={{
      isLoading,
      isPurchased,
      isTrialExpired,
      trialDaysRemaining,
      purchaseUnlock,
      restorePurchases,
    }}>
      {children}
    </PurchaseContext.Provider>
  );
}

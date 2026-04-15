import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserUnit } from "@/lib/local-db";

export type WeightUnit = "lbs" | "kg";

interface UnitContextType {
  unit: WeightUnit;
  /** Reload unit from DB (call after onboarding completes) */
  refreshUnit: () => Promise<void>;
}

const UnitContext = createContext<UnitContextType>({
  unit: "lbs",
  refreshUnit: async () => {},
});

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<WeightUnit>("lbs");

  async function refreshUnit() {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (userId) {
        const u = await getUserUnit(userId);
        setUnit(u);
      }
    } catch {
      // default lbs
    }
  }

  useEffect(() => {
    refreshUnit();
  }, []);

  return (
    <UnitContext.Provider value={{ unit, refreshUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit(): UnitContextType {
  return useContext(UnitContext);
}

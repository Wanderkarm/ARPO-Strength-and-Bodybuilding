import React from "react";
import { View } from "react-native";

/** Visual state of the superset icon in the exercise list. */
export type SupersetIconState =
  | "active"    // paired — crimson border, white dumbbells, red chain dots
  | "inactive"  // not paired — dark ghost border, barely visible
  | "picking";  // this row is the pick target — bright crimson border

interface Props {
  state: SupersetIconState;
  size?: number;
}

export default function SupersetIcon({ state, size = 28 }: Props) {
  const borderColor =
    state === "active"   ? "#c62828" :
    state === "picking"  ? "#e53935" :
    "#2e2e2e";

  const bgColor      = state === "active" ? "#1f0808" : "#161616";
  const dumbbellFill = state === "inactive" ? "#2e2e2e" : "#ffffff";
  const chainFill    = state === "inactive" ? "#252525" : "#c62828";

  const s = size / 28;

  const Dumbbell = () => (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 2 * s }}>
      {/* Left plate */}
      <View style={{ width: Math.max(4, 4 * s), height: Math.max(8, 9 * s), borderRadius: 2 * s, backgroundColor: dumbbellFill }} />
      {/* Bar */}
      <View style={{ flex: 1, height: Math.max(2, 3 * s), borderRadius: 1.5 * s, backgroundColor: dumbbellFill }} />
      {/* Right plate */}
      <View style={{ width: Math.max(4, 4 * s), height: Math.max(8, 9 * s), borderRadius: 2 * s, backgroundColor: dumbbellFill }} />
    </View>
  );

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: Math.round(6 * s),
      backgroundColor: bgColor,
      borderWidth: state === "inactive" ? 1.5 : 2,
      borderColor,
      alignItems: "stretch",
      justifyContent: "center",
      gap: Math.max(2, 3 * s),
      paddingVertical: 4 * s,
    }}>
      <Dumbbell />
      {/* Chain dots */}
      <View style={{ flexDirection: "row", gap: 3 * s, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: Math.max(3, 3 * s), height: Math.max(3, 3 * s), borderRadius: 99, backgroundColor: chainFill }} />
        <View style={{ width: Math.max(3, 3 * s), height: Math.max(3, 3 * s), borderRadius: 99, backgroundColor: chainFill }} />
      </View>
      <Dumbbell />
    </View>
  );
}

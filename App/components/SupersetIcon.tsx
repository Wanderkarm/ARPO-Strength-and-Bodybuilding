import React from "react";
import Svg, { Rect, Circle } from "react-native-svg";

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

  const bgColor     = state === "active" ? "#1f0808" : "#161616";
  const dumbbellFill = state === "inactive" ? "#2e2e2e" : "white";
  const chainFill    = state === "inactive" ? "#252525" : "#c62828";

  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {/* Outer shadow ring */}
      <Rect x="0" y="0" width="56" height="56" rx="12" fill="#000" />
      {/* Background panel */}
      <Rect
        x="2" y="2" width="52" height="52" rx="10"
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={state === "inactive" ? "1.5" : "2.5"}
      />

      {/* ── Dumbbell 1 (top) ── */}
      {/* Bar */}
      <Rect x="15" y="14" width="26" height="4" rx="2" fill={dumbbellFill} />
      {/* Left plate */}
      <Rect x="9"  y="10" width="9" height="12" rx="3.5" fill={dumbbellFill} />
      {/* Right plate */}
      <Rect x="38" y="10" width="9" height="12" rx="3.5" fill={dumbbellFill} />

      {/* ── Chain dots ── */}
      <Circle cx="28" cy="26.5" r="2.5" fill={chainFill} />
      <Circle cx="28" cy="32.5" r="2.5" fill={chainFill} />

      {/* ── Dumbbell 2 (bottom) ── */}
      {/* Bar */}
      <Rect x="15" y="38" width="26" height="4" rx="2" fill={dumbbellFill} />
      {/* Left plate */}
      <Rect x="9"  y="34" width="9" height="12" rx="3.5" fill={dumbbellFill} />
      {/* Right plate */}
      <Rect x="38" y="34" width="9" height="12" rx="3.5" fill={dumbbellFill} />
    </Svg>
  );
}

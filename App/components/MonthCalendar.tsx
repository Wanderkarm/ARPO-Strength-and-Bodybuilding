import React from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type CalendarData, type CalendarDayData } from "@/lib/local-db";
import { getWeekStartDay, getOrderedDays, DAY_LETTERS } from "@/utils/weekStart";

interface Props {
  year: number;
  month: number; // 1-indexed
  calendarData: CalendarData;
  onDayPress: (dateStr: string, data: CalendarDayData | undefined) => void;
  onMonthChange: (year: number, month: number) => void;
}

// Note: CELL and TODAY are intentionally NOT module-level constants — they are
// computed inside the component so they stay accurate after orientation changes
// (CELL) and across midnight boundaries (TODAY).
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad(n: number) { return String(n).padStart(2, "0"); }

export default function MonthCalendar({ year, month, calendarData, onDayPress, onMonthChange }: Props) {
  // Computed per-render so they stay fresh after orientation changes / midnight
  const CELL = Math.floor(Dimensions.get("window").width / 7);
  const TODAY = new Date().toISOString().slice(0, 10);

  const orderedDays = getOrderedDays();
  const weekStart = getWeekStartDay();

  // Build grid: weeks × 7 cells (null = empty padding)
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Offset: how many empty cells before day 1
  const startOffset = (firstOfMonth.getDay() - weekStart + 7) % 7;

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const canGoForward = !(year === new Date().getFullYear() && month === new Date().getMonth() + 1);

  function goBack() {
    if (month === 1) onMonthChange(year - 1, 12);
    else onMonthChange(year, month - 1);
  }
  function goForward() {
    if (!canGoForward) return;
    if (month === 12) onMonthChange(year + 1, 1);
    else onMonthChange(year, month + 1);
  }

  return (
    <View>
      {/* Month navigation header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 12 }}>
        <Pressable onPress={goBack} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
        <Pressable onPress={goForward} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Ionicons name="chevron-forward" size={20} color={canGoForward ? Colors.text : Colors.textMuted} />
        </Pressable>
      </View>

      {/* Day-of-week labels */}
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border }}>
        {orderedDays.map((dow) => (
          <View key={dow} style={{ width: CELL, alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 }}>
              {DAY_LETTERS[dow]}
            </Text>
          </View>
        ))}
      </View>

      {/* Date grid */}
      <View style={{ borderTopWidth: 1, borderTopColor: Colors.border }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            {week.map((day, di) => {
              if (day === null) {
                return <View key={di} style={{ width: CELL, height: 56 }} />;
              }
              const dateStr = `${year}-${pad(month)}-${pad(day)}`;
              const isToday = dateStr === TODAY;
              const isFuture = dateStr > TODAY;
              const data = calendarData[dateStr];

              const workoutDone = data?.workoutDone ?? false;
              const weighInDone = data?.weighInDone ?? false;
              const stepsGoalHit = data?.stepsGoalHit ?? false;
              const isScheduled = data?.isScheduled ?? false;
              const hasActivity = workoutDone || weighInDone || stepsGoalHit;

              return (
                <Pressable
                  key={di}
                  onPress={() => { if (!isFuture || isScheduled) onDayPress(dateStr, data); }}
                  style={({ pressed }) => ({
                    width: CELL,
                    height: 56,
                    alignItems: "center",
                    paddingTop: 6,
                    backgroundColor: pressed && hasActivity ? Colors.bgAccent : "transparent",
                    borderRightWidth: di < 6 ? 1 : 0,
                    borderRightColor: Colors.border,
                  })}
                >
                  {/* Date number */}
                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: workoutDone ? Colors.primary : isToday ? Colors.bgAccent : "transparent",
                    borderWidth: isToday && !workoutDone ? 1 : 0,
                    borderColor: Colors.border,
                    justifyContent: "center",
                    alignItems: "center",
                  }}>
                    <Text style={{
                      fontFamily: workoutDone ? "Rubik_700Bold" : "Rubik_400Regular",
                      fontSize: 11,
                      color: isFuture && !isScheduled ? Colors.textMuted : Colors.text,
                    }}>
                      {day}
                    </Text>
                  </View>

                  {/* Activity dots */}
                  <View style={{ flexDirection: "row", gap: 3, marginTop: 4, height: 5 }}>
                    {weighInDone && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textSecondary }} />
                    )}
                    {stepsGoalHit && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.success }} />
                    )}
                    {isScheduled && !workoutDone && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 12 }}>
        {[
          { color: Colors.primary, label: "Workout" },
          { color: Colors.textSecondary, label: "Weigh-in" },
          { color: Colors.success, label: "Steps" },
          { color: Colors.textMuted, label: "Scheduled" },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

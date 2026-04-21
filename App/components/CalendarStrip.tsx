import React from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import Colors from "@/constants/colors";
import { type CalendarData } from "@/lib/local-db";
import { getOrderedDays, DAY_LETTERS, weekStartDate, weekEndDate } from "@/utils/weekStart";

interface Props {
  calendarData: CalendarData;
  trainingDays: number[] | null;   // null = no schedule set
  onSchedulePromptPress: () => void;
  onDayPress: (dateStr: string) => void;
}

const CELL = Math.floor(Dimensions.get("window").width / 7);
const TODAY = new Date().toISOString().slice(0, 10);

export default function CalendarStrip({ calendarData, trainingDays, onSchedulePromptPress, onDayPress }: Props) {
  const orderedDays = getOrderedDays(); // [0..6] in locale order

  // Build the 7 date strings for the current week
  const weekStart = weekStartDate(new Date());
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }

  const hasSchedule = trainingDays !== null && trainingDays.length > 0;

  return (
    <View>
      {/* Day cells */}
      <View style={{ flexDirection: "row" }}>
        {weekDates.map((dateStr, i) => {
          const dayOfWeek = orderedDays[i];
          const isToday = dateStr === TODAY;
          const isPast = dateStr < TODAY;
          const isFuture = dateStr > TODAY;
          const data = calendarData[dateStr];

          const workoutDone = data?.workoutDone ?? false;
          const weighInDone = data?.weighInDone ?? false;
          const stepsGoalHit = data?.stepsGoalHit ?? false;
          const isScheduled = isFuture && hasSchedule && trainingDays!.includes(dayOfWeek);

          // Circle fill
          let circleBg = "transparent";
          let circleBorder = "transparent";
          if (workoutDone) {
            circleBg = Colors.primary;
          } else if (isToday) {
            circleBg = Colors.bgAccent;
            circleBorder = Colors.border;
          } else if (isScheduled) {
            circleBorder = Colors.textMuted;
          }

          const hasAnyActivity = workoutDone || weighInDone || stepsGoalHit;

          return (
            <Pressable
              key={dateStr}
              onPress={() => { if (isPast || isToday) onDayPress(dateStr); }}
              style={{ width: CELL, alignItems: "center", paddingVertical: 10 }}
            >
              {/* Today indicator */}
              <Text style={{
                fontFamily: isToday ? "Rubik_700Bold" : "Rubik_400Regular",
                fontSize: 9,
                color: isToday ? Colors.text : Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}>
                {DAY_LETTERS[dayOfWeek]}
              </Text>

              {/* Circle */}
              <View style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: circleBg,
                borderWidth: circleBorder !== "transparent" ? 1 : 0,
                borderColor: circleBorder,
                justifyContent: "center",
                alignItems: "center",
              }}>
                {isToday && !workoutDone && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary }} />
                )}
              </View>

              {/* Activity dots */}
              <View style={{ flexDirection: "row", gap: 3, marginTop: 5, height: 5, alignItems: "center" }}>
                {weighInDone && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textSecondary }} />
                )}
                {stepsGoalHit && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.success }} />
                )}
                {!hasAnyActivity && !isScheduled && (isPast || isToday) && (
                  <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted + "55" }} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Legend dots */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary }} />
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 }}>Workout</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textSecondary }} />
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 }}>Weigh-in</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success }} />
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 }}>Steps</Text>
        </View>
      </View>

      {/* Schedule prompt — only shown if no schedule is set */}
      {!hasSchedule && (
        <Pressable
          onPress={onSchedulePromptPress}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{
            fontFamily: "Rubik_500Medium",
            fontSize: 10,
            color: Colors.primary,
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}>
            Set training schedule →
          </Text>
        </Pressable>
      )}
    </View>
  );
}

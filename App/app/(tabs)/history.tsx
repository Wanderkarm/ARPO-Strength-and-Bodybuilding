import React, { useCallback, useState } from "react";
import {
  View, Text, Pressable, Platform, ActivityIndicator,
  FlatList, Alert, ScrollView,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  getCompletedWorkoutHistory, getCalendarData, getTrainingSchedule,
  type HistoryEntry, type CalendarData, type CalendarDayData,
} from "@/lib/local-db";
import MonthCalendar from "@/components/MonthCalendar";
import DayDetailSheet from "@/components/DayDetailSheet";
import { unSkipSession } from "@/lib/local-db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTonnage(value: number, unit: string): string {
  if (unit === "kg") return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${Math.round(value)} kg`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K lbs` : `${Math.round(value)} lbs`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type ViewMode = "calendar" | "list";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");

  // ── Calendar state ─────────────────────────────────────────────────────────
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [calendarData, setCalendarData] = useState<CalendarData>({});
  const [calLoading, setCalLoading] = useState(true);

  // ── Day detail sheet ───────────────────────────────────────────────────────
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<CalendarDayData | null>(null);

  // ── List state ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [undoingSkip, setUndoingSkip] = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  // Re-load calendar data whenever month changes
  const loadCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) return;
      const pad = (n: number) => String(n).padStart(2, "0");
      const daysInMonth = new Date(year, month, 0).getDate();
      const start = `${year}-${pad(month)}-01`;
      const end = `${year}-${pad(month)}-${pad(daysInMonth)}`;
      const data = await getCalendarData(userId, start, end);
      setCalendarData(data);
    } catch (err) {
      console.error("Calendar load error:", err);
    } finally {
      setCalLoading(false);
    }
  }, []);

  async function loadAll() {
    loadCalendar(calYear, calMonth);
    setListLoading(true);
    try {
      const data = await getCompletedWorkoutHistory();
      setHistory(data);
    } catch (err) {
      console.error("History load error:", err);
    } finally {
      setListLoading(false);
    }
  }

  function handleMonthChange(year: number, month: number) {
    setCalYear(year);
    setCalMonth(month);
    loadCalendar(year, month);
  }

  function handleDayPress(dateStr: string, data: CalendarDayData | undefined) {
    if (!data || (!data.workoutDone && !data.weighInDone && !data.stepsGoalHit)) return;
    setSheetDate(dateStr);
    setSheetData(data ?? null);
  }

  // ── List helpers ───────────────────────────────────────────────────────────

  function toggleExpand(index: number) {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  async function handleUndoSkip(item: HistoryEntry) {
    Alert.alert(
      "Undo Skip",
      `This will restore W${item.weekNumber} Day ${item.dayNumber} so you can log your sets. Your plan will roll back to that session.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo Skip",
          style: "default",
          onPress: async () => {
            setUndoingSkip(item.planId);
            try {
              await unSkipSession(item.planId, item.weekNumber, item.dayNumber);
              await AsyncStorage.setItem("activePlanId", item.planId);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace("/(tabs)");
            } catch (err) {
              console.error(err);
            } finally {
              setUndoingSkip(null);
            }
          },
        },
      ]
    );
  }

  // ── Render: list item ──────────────────────────────────────────────────────

  function renderItem({ item, index }: { item: HistoryEntry; index: number }) {
    const isExpanded = expandedIndex === index;
    return (
      <Pressable
        testID={`history-row-${index}`}
        onPress={() => toggleExpand(index)}
        style={{
          borderBottomWidth: 1, borderBottomColor: Colors.border,
          paddingHorizontal: 24, paddingVertical: 16,
          backgroundColor: isExpanded ? Colors.bgCard : Colors.bg,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              {formatDate(item.date)}
            </Text>
            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 14, color: Colors.text }} numberOfLines={1}>
              {item.routineName}
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                {" "}— W{item.weekNumber}, Day {item.dayNumber}
              </Text>
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {item.isSkipped ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Skipped
                  </Text>
                </View>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleUndoSkip(item); }}
                  disabled={undoingSkip === item.planId}
                  style={({ pressed }) => ({ borderWidth: 1, borderColor: Colors.primary + "88", paddingHorizontal: 8, paddingVertical: 2, opacity: pressed || undoingSkip === item.planId ? 0.6 : 1 })}
                >
                  {undoingSkip === item.planId
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 10, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>Undo</Text>
                  }
                </Pressable>
              </View>
            ) : (
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.primary }}>
                {formatTonnage(item.totalTonnage, unit)}
              </Text>
            )}
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
          </View>
        </View>

        {isExpanded && !item.isSkipped && (
          <View style={{ marginTop: 16 }}>
            {item.exercises.map((ex, exIdx) => (
              <View key={exIdx} style={{ marginBottom: exIdx < item.exercises.length - 1 ? 12 : 0 }}>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.text, marginBottom: 6 }}>
                  {ex.exerciseName}
                </Text>
                {ex.sets.length > 0 ? (
                  <View>
                    <View style={{ flexDirection: "row", marginBottom: 4 }}>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, width: 40 }}>Set</Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, flex: 1, textAlign: "center" }}>Weight</Text>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, flex: 1, textAlign: "right" }}>Reps</Text>
                    </View>
                    {ex.sets.map((set, setIdx) => (
                      <View key={setIdx} style={{ flexDirection: "row", paddingVertical: 3, borderTopWidth: setIdx === 0 ? 1 : 0, borderTopColor: Colors.border }}>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, width: 40 }}>{set.setNumber}</Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.text, flex: 1, textAlign: "center" }}>{set.weight} {unit}</Text>
                        <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.text, flex: 1, textAlign: "right" }}>{set.reps}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>No sets recorded</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {isExpanded && item.isSkipped && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted }}>
              Session was skipped. Targets carried to next week.
            </Text>
          </View>
        )}
      </Pressable>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>

      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View>
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 22, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
              History
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>
              {viewMode === "calendar" ? "Training Calendar" : "Past Sessions"}
            </Text>
          </View>

          {/* Toggle */}
          <View style={{ flexDirection: "row", borderWidth: 1, borderColor: Colors.border }}>
            {(["calendar", "list"] as ViewMode[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8,
                  backgroundColor: viewMode === mode ? Colors.primary : Colors.bg,
                }}
              >
                <Ionicons
                  name={mode === "calendar" ? "calendar-outline" : "list-outline"}
                  size={16}
                  color={viewMode === mode ? Colors.text : Colors.textMuted}
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {calLoading ? (
            <View style={{ paddingTop: 60, alignItems: "center" }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <MonthCalendar
              year={calYear}
              month={calMonth}
              calendarData={calendarData}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
            />
          )}

          {/* Empty state for calendar */}
          {!calLoading && Object.keys(calendarData).length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 48 }}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginTop: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                No activity this month
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 6 }}>
                Complete a workout, log your weight, or hit your step goal to see activity here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* List view */}
      {viewMode === "list" && (
        listLoading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : history.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 48 }}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center", marginTop: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              No sessions logged yet
            </Text>
            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 6 }}>
              Complete a workout to see it here
            </Text>
          </View>
        ) : (
          <FlatList
            data={history}
            renderItem={renderItem}
            keyExtractor={(_, index) => index.toString()}
            contentContainerStyle={{ paddingBottom: 24 }}
            scrollEnabled={history.length > 0}
          />
        )
      )}

      {/* Day detail bottom sheet */}
      <DayDetailSheet
        visible={sheetDate !== null}
        dateStr={sheetDate}
        data={sheetData}
        weightUnit={unit}
        onClose={() => { setSheetDate(null); setSheetData(null); }}
      />
    </View>
  );
}

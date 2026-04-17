import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  SectionList,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  getAllExercises,
  createCustomTemplate,
  getCustomTemplateCount,
  type Exercise,
} from "@/lib/local-db";

interface DayState {
  dayNumber: number;
  exercises: Exercise[];
}

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function CustomBuilderScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [routineName, setRoutineName] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [dayStates, setDayStates] = useState<DayState[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    getAllExercises().then(setAllExercises);
  }, []);

  useEffect(() => {
    setDayStates(
      Array.from({ length: daysPerWeek }, (_, i) => ({
        dayNumber: i + 1,
        exercises: dayStates[i]?.exercises || [],
      }))
    );
  }, [daysPerWeek]);

  const categories = useMemo(() => {
    if (!allExercises.length) return [];
    const cats = [...new Set(allExercises.map((ex) => ex.category))];
    cats.sort();
    return cats;
  }, [allExercises]);

  const sections = useMemo(() => {
    if (!allExercises.length) return [];
    const cats = selectedCategory ? [selectedCategory] : categories;
    return cats
      .map((cat) => ({
        title: cat,
        data: allExercises.filter((ex) => {
          if (ex.category !== cat) return false;
          if (searchText) {
            return ex.name.toLowerCase().includes(searchText.toLowerCase());
          }
          return true;
        }),
      }))
      .filter((s) => s.data.length > 0);
  }, [allExercises, searchText, selectedCategory, categories]);

  function isExerciseInDay(exerciseId: string): boolean {
    if (activeDayIndex === null) return false;
    return dayStates[activeDayIndex].exercises.some((e) => e.id === exerciseId);
  }

  function toggleExercise(exercise: Exercise) {
    if (activeDayIndex === null) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayStates((prev) => {
      const updated = [...prev];
      const day = { ...updated[activeDayIndex] };
      const exists = day.exercises.some((e) => e.id === exercise.id);
      if (exists) {
        day.exercises = day.exercises.filter((e) => e.id !== exercise.id);
      } else {
        day.exercises = [...day.exercises, exercise];
      }
      updated[activeDayIndex] = day;
      return updated;
    });
  }

  function removeExerciseFromDay(dayIndex: number, exerciseId: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayStates((prev) => {
      const updated = [...prev];
      const day = { ...updated[dayIndex] };
      day.exercises = day.exercises.filter((e) => e.id !== exerciseId);
      updated[dayIndex] = day;
      return updated;
    });
  }

  function canSave(): boolean {
    if (!routineName.trim()) return false;
    if (dayStates.length === 0) return false;
    return dayStates.every((d) => d.exercises.length > 0);
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;

      const count = await getCustomTemplateCount(uid);
      if (count >= 3) {
        Alert.alert(
          "Routine Slots Full",
          "You can save up to 3 custom routines. Delete one from the routines screen to create a new one.",
          [{ text: "OK" }]
        );
        return;
      }

      await createCustomTemplate(
        uid,
        routineName.trim(),
        dayStates.map((d) => ({
          dayNumber: d.dayNumber,
          exerciseIds: d.exercises.map((e) => e.id),
        }))
      );

      router.replace("/templates");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset, paddingBottom: bottomInset }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/templates")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            Custom Routine
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
          Routine Name
        </Text>
        <TextInput
          testID="routine-name-input"
          value={routineName}
          onChangeText={setRoutineName}
          placeholder="e.g. PUSH PULL LEGS"
          placeholderTextColor={Colors.textMuted}
          style={{
            fontFamily: "Rubik_600SemiBold",
            fontSize: 16,
            color: Colors.text,
            borderWidth: 1,
            borderColor: Colors.border,
            paddingHorizontal: 14,
            paddingVertical: 14,
            backgroundColor: Colors.bgInput,
            marginBottom: 20,
          }}
        />

        <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
          Days Per Week
        </Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 24 }}>
          {DAYS_OPTIONS.map((d) => (
            <Pressable
              key={d}
              testID={`days-${d}`}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDaysPerWeek(d);
              }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: daysPerWeek === d ? Colors.primary : Colors.border,
                backgroundColor: daysPerWeek === d ? Colors.bgAccent : Colors.bg,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 18, color: daysPerWeek === d ? Colors.primary : Colors.textMuted }}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        {dayStates.map((day, dayIndex) => (
          <View key={day.dayNumber} style={{ borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgAccent }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                Day {day.dayNumber}
              </Text>
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                {day.exercises.length} exercise{day.exercises.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {day.exercises.map((ex, exIndex) => (
              <View key={ex.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: exIndex < day.exercises.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}>
                <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.primary, width: 20 }}>
                  {exIndex + 1}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {ex.name}
                  </Text>
                  <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    {ex.category} · {ex.equipment}
                  </Text>
                </View>
                <Pressable onPress={() => removeExerciseFromDay(dayIndex, ex.id)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={Colors.textMuted} />
                </Pressable>
              </View>
            ))}

            <Pressable
              testID={`add-exercise-day-${day.dayNumber}`}
              onPress={() => {
                setActiveDayIndex(dayIndex);
                setSearchText("");
                setSelectedCategory(null);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                borderTopWidth: day.exercises.length > 0 ? 1 : 0,
                borderTopColor: Colors.border,
                backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
              })}
            >
              <Ionicons name="add" size={16} color={Colors.primary} />
              <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                Add Exercise
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
        <Pressable
          testID="save-custom-routine"
          onPress={handleSave}
          disabled={!canSave() || saving}
          style={({ pressed }) => ({
            backgroundColor: canSave() ? Colors.primary : Colors.bgAccent,
            paddingVertical: 16,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {saving ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: canSave() ? Colors.text : Colors.textMuted, textAlign: "center", textTransform: "uppercase", letterSpacing: 2 }}>
              Save Custom Routine
            </Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={activeDayIndex !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveDayIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, maxHeight: "75%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 14, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                Add Exercises — Day {activeDayIndex !== null ? dayStates[activeDayIndex]?.dayNumber : ""}
              </Text>
              <Pressable
                testID="close-exercise-modal"
                onPress={() => setActiveDayIndex(null)}
                hitSlop={12}
              >
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.primary, textTransform: "uppercase", letterSpacing: 2 }}>
                  Done
                </Text>
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgInput, paddingHorizontal: 10 }}>
                <Ionicons name="search" size={16} color={Colors.textMuted} />
                <TextInput
                  testID="exercise-search-input"
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search exercises..."
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    flex: 1,
                    fontFamily: "Rubik_400Regular",
                    fontSize: 14,
                    color: Colors.text,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                  }}
                />
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
              <Pressable
                onPress={() => setSelectedCategory(null)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: selectedCategory === null ? Colors.primary : Colors.border,
                  backgroundColor: selectedCategory === null ? Colors.bgAccent : Colors.bg,
                }}
              >
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: selectedCategory === null ? Colors.primary : Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                  All
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: selectedCategory === cat ? Colors.primary : Colors.border,
                    backgroundColor: selectedCategory === cat ? Colors.bgAccent : Colors.bg,
                  }}
                >
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: selectedCategory === cat ? Colors.primary : Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }}
              renderSectionHeader={({ section }) => (
                <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: Colors.bgAccent, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 2 }}>
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => {
                const selected = isExerciseInDay(item.id);
                return (
                  <Pressable
                    onPress={() => toggleExercise(item)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
                    })}
                  >
                    <View style={{ width: 24, height: 24, borderWidth: 1, borderColor: selected ? Colors.primary : Colors.border, backgroundColor: selected ? Colors.primary : Colors.bg, justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                      {selected && <Ionicons name="checkmark" size={16} color={Colors.text} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
                        {item.equipment}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Ionicons name="barbell-outline" size={32} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 12, color: Colors.textMuted, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    No exercises found
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

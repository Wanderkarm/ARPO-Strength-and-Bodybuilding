import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  createCustomExercise,
  getCustomExercises,
  deleteCustomExercise,
} from "@/lib/local-db";

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "HORIZONTAL PUSH",
  "INCLINE PUSH",
  "VERTICAL PUSH",
  "HORIZONTAL BACK",
  "VERTICAL BACK",
  "BICEPS",
  "TRICEPS",
  "REAR DELTS",
  "TRAPS",
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "CALVES",
  "ABS",
];

const EQUIPMENT_OPTIONS = [
  { value: "BARBELL",    label: "Barbell" },
  { value: "DUMBBELL",   label: "Dumbbell" },
  { value: "MACHINE",    label: "Machine" },
  { value: "CABLE",      label: "Cable" },
  { value: "BODYWEIGHT",          label: "Bodyweight" },
  { value: "WEIGHTED_BODYWEIGHT", label: "Weighted BW (belt/dumbbell)" },
  { value: "BAND",                label: "Band" },
  { value: "OTHER",      label: "Other" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CustomExerciseScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [exercises, setExercises] = useState<{ id: string; name: string; category: string; equipment: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [equipment, setEquipment] = useState("BARBELL");

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const list = await getCustomExercises();
    setExercises(list);
    if (list.length === 0) setShowForm(true);
    setLoading(false);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createCustomExercise(trimmed, category, equipment);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName("");
      setCategory(CATEGORIES[0]);
      setEquipment("BARBELL");
      setShowForm(false);
      await load();
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
        Alert.alert(t('customExercise.alerts.duplicateTitle'), t('customExercise.alerts.duplicateMessage'));
      } else {
        console.error(err);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, exerciseName: string) {
    Alert.alert(
      t('customExercise.alerts.deleteTitle'),
      t('customExercise.alerts.deleteMessage', { name: exerciseName }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('customExercise.alerts.deleteConfirm'),
          style: "destructive",
          onPress: async () => {
            await deleteCustomExercise(id);
            await load();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: topInset }}>
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/settings")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
            {t('customExercise.title')}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowForm(!showForm)}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name={showForm ? "chevron-up" : "add"} size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>

          {/* Create form */}
          {showForm && (
            <View style={{ borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20 }}>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
                {t('customExercise.form.title')}
              </Text>

              {/* Name */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 7 }}>
                {t('customExercise.form.exerciseName')}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('customExercise.form.exerciseNamePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.bgAccent,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 15,
                  color: Colors.text,
                  marginBottom: 16,
                }}
              />

              {/* Category */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                {t('customExercise.form.muscleGroup')}
              </Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
                contentContainerStyle={{ gap: 6 }}
              >
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: category === cat ? Colors.primary : Colors.border,
                      backgroundColor: category === cat ? Colors.primary + "15" : Colors.bg,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{
                      fontFamily: "Rubik_600SemiBold",
                      fontSize: 10,
                      color: category === cat ? Colors.primary : Colors.textMuted,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Equipment */}
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                {t('customExercise.form.equipment')}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {EQUIPMENT_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setEquipment(opt.value)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: equipment === opt.value ? Colors.primary : Colors.border,
                      backgroundColor: equipment === opt.value ? Colors.primary + "15" : Colors.bg,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{
                      fontFamily: "Rubik_600SemiBold",
                      fontSize: 11,
                      color: equipment === opt.value ? Colors.primary : Colors.textMuted,
                    }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleCreate}
                disabled={saving || !name.trim()}
                style={({ pressed }) => ({
                  backgroundColor: name.trim() ? Colors.primary : Colors.bgAccent,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                {saving
                  ? <ActivityIndicator color={Colors.text} />
                  : <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: name.trim() ? Colors.text : Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                      {t('customExercise.form.addExercise')}
                    </Text>
                }
              </Pressable>
            </View>
          )}

          {/* Exercise list */}
          {exercises.length > 0 && (
            <>
              <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
                Your Custom Exercises ({exercises.length})
              </Text>
              <View style={{ borderWidth: 1, borderColor: Colors.border }}>
                {exercises.map((ex, i) => (
                  <View
                    key={ex.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 14,
                      borderTopWidth: i > 0 ? 1 : 0,
                      borderTopColor: Colors.border,
                    }}
                  >
                    <View style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: Colors.primary,
                      marginRight: 12,
                    }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                        {ex.name}
                      </Text>
                      <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>
                        {ex.category} · {ex.equipment}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDelete(ex.id, ex.name)}
                      hitSlop={12}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={{ borderWidth: 1, borderColor: Colors.border, borderTopWidth: 0, padding: 12, backgroundColor: Colors.bgAccent }}>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, lineHeight: 17 }}>
                  Custom exercises appear in the exercise swap picker during workouts and in the mesocycle builder.
                </Text>
              </View>
            </>
          )}

          {exercises.length === 0 && !showForm && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 12, textAlign: "center" }}>
                {t('customExercise.empty')}
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

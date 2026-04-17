import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { GOAL_META } from "@/utils/volumeLandmarks";
import {
  getPreBuiltTemplates,
  getCustomTemplates,
  getAllExercises,
  getWorkoutPlan,
  createWorkoutPlan,
  deleteCustomTemplate,
  type Template,
  type Exercise,
} from "@/lib/local-db";

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isOnboarding = from === "onboarding";

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showGymModal, setShowGymModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<"strength" | "powerbuilding" | "hypertrophy" | null>(null);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customTemplatesList, setCustomTemplatesList] = useState<Template[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Existing plan guard
  const [activePlanInfo, setActivePlanInfo] = useState<{ name: string; week: number } | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingIsHome, setPendingIsHome] = useState(false);

  // Custom template delete
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const MAX_CUSTOM_SLOTS = 3;

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setIsLoading(true);
    try {
      const uid = await AsyncStorage.getItem("userId");
      setUserId(uid);
      setTemplates(await getPreBuiltTemplates());
      setAllExercises(await getAllExercises());
      if (uid) {
        setCustomTemplatesList(await getCustomTemplates(uid));
      }
      // Load current active plan so we can warn before switching
      const pid = await AsyncStorage.getItem("activePlanId");
      if (pid) {
        const plan = await getWorkoutPlan(pid);
        if (plan && plan.isActive) {
          setActivePlanInfo({ name: plan.template.name, week: plan.currentWeek });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleTemplatePress(template: Template) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTemplate(template);
    setSelectedGoal(null);
    setShowGoalModal(true);
  }

  async function handleGymChoice(isHome: boolean) {
    if (!selectedTemplate) return;
    // If there's already an active plan, ask for confirmation first
    if (activePlanInfo) {
      setPendingIsHome(isHome);
      setShowGymModal(false);
      setShowSwitchConfirm(true);
      return;
    }
    await doCreatePlan(isHome);
  }

  async function doCreatePlan(isHome: boolean) {
    if (!selectedTemplate) return;
    setShowSwitchConfirm(false);
    setCreating(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const uid = await AsyncStorage.getItem("userId");
      if (!uid) return;

      await AsyncStorage.setItem("gymType", isHome ? "HOME" : "GYM");

      let exerciseSwaps: Record<string, string> | undefined;
      if (isHome) {
        const swapMap: Record<string, string> = {};
        for (const day of selectedTemplate.days) {
          for (const te of day.exercises) {
            const ex = te.exercise;
            if (ex.equipment === "BARBELL" || ex.equipment === "MACHINE") {
              const alt = allExercises.find(
                (e) =>
                  e.category === ex.category &&
                  (e.equipment === "DUMBBELL" || e.equipment === "BODYWEIGHT") &&
                  e.id !== ex.id &&
                  !Object.values(swapMap).includes(e.id)
              );
              if (alt) swapMap[ex.id] = alt.id;
            }
          }
        }
        exerciseSwaps = swapMap;
        await AsyncStorage.setItem("exerciseSwaps", JSON.stringify(swapMap));
      }

      const gymType = isHome ? "HOME" : "GYM";
      const plan = await createWorkoutPlan(uid, selectedTemplate.id, exerciseSwaps, selectedGoal ?? "hypertrophy", gymType);
      await AsyncStorage.setItem("activePlanId", plan.id);
      setShowGymModal(false);
      router.replace(isOnboarding ? "/post-onboarding" : "/(tabs)");
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function confirmDeleteTemplate(template: Template) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTemplateToDelete(template);
    setShowDeleteConfirm(true);
  }

  async function doDeleteTemplate() {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      const deletedPlanIds = await deleteCustomTemplate(templateToDelete.id);
      // If the active plan was linked to this template, clear it
      const activePlanId = await AsyncStorage.getItem("activePlanId");
      if (activePlanId && deletedPlanIds.includes(activePlanId)) {
        await AsyncStorage.removeItem("activePlanId");
        await AsyncStorage.removeItem("exerciseSwaps");
      }
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  function handleCreatePress(route: "/custom-builder" | "/auto-builder") {
    if (customTemplatesList.length >= MAX_CUSTOM_SLOTS) {
      Alert.alert(
        "Routine Slots Full",
        `You can save up to ${MAX_CUSTOM_SLOTS} custom routines. Delete one to create a new one.`,
        [{ text: "OK" }]
      );
      return;
    }
    router.push(route);
  }

  function getDayLabel(mesoType: number): string {
    return `${mesoType} days/week`;
  }

  function getCategoryIcon(name: string) {
    if (name.includes("Upper/Lower")) return "body" as const;
    if (name.includes("Push/Pull")) return "swap-horizontal" as const;
    if (name.includes("Full Body")) return "fitness" as const;
    if (name.includes("Bro")) return "barbell" as const;
    if (name.includes("Arnold")) return "trophy" as const;
    return "barbell" as const;
  }

  const renderTemplate = ({ item }: { item: Template }) => (
    <Pressable
      onPress={() => handleTemplatePress(item)}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
        marginBottom: 8,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <View
              style={{
                width: 40,
                height: 40,
                backgroundColor: Colors.bgAccent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={getCategoryIcon(item.name)}
                size={20}
                color={Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 15,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {item.name}
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 12,
                  color: Colors.textSecondary,
                  marginTop: 2,
                }}
              >
                {getDayLabel(item.mesoType)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </View>

        <View
          style={{
            marginTop: 12,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingTop: 12,
          }}
        >
          {item.days.slice(0, 3).map((day) => (
            <View key={day.id} style={{ marginBottom: 4 }}>
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 11,
                  color: Colors.textMuted,
                }}
              >
                <Text style={{ color: Colors.primary, fontFamily: "Rubik_500Medium" }}>
                  D{day.dayNumber}
                </Text>
                {"  "}
                {day.exercises.map((e) => e.exercise.name).join(" / ")}
              </Text>
            </View>
          ))}
          {item.days.length > 3 && (
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 11,
                color: Colors.textMuted,
                marginTop: 2,
              }}
            >
              +{item.days.length - 3} more days
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: topInset,
        paddingBottom: bottomInset,
      }}
    >
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        {/* Progress bar — only shown during onboarding flow */}
        {isOnboarding && (
          <View style={{ flexDirection: "row", gap: 3, marginBottom: 16 }}>
            {Array.from({ length: 11 }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  backgroundColor: i < 9 ? Colors.primary : Colors.border,
                }}
              />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => {
            if (isOnboarding) {
              router.replace("/nutrition-setup?from=onboarding");
            } else {
              router.canGoBack() ? router.back() : router.replace("/(tabs)");
            }
          }}
          hitSlop={12}
          style={{ marginBottom: isOnboarding ? 8 : 16 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>

        {isOnboarding && (
          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
            Step 9 of 11
          </Text>
        )}

        <Text
          style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 24,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Choose Routine
        </Text>
        <Text
          style={{
            fontFamily: "Rubik_400Regular",
            fontSize: 13,
            color: Colors.textSecondary,
            marginTop: 4,
          }}
        >
          {isOnboarding ? "Pick a mesocycle — ARPO will set your Week 1 targets." : "Select a mesocycle template"}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {/* Create routine — two paths */}
          {customTemplatesList.length < MAX_CUSTOM_SLOTS ? (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
              <Pressable
                testID="create-custom-routine"
                onPress={() => handleCreatePress("/custom-builder")}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingVertical: 18,
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Ionicons name="list" size={22} color={Colors.textSecondary} />
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.text, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  Build{"\n"}Manually
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", lineHeight: 14, paddingHorizontal: 4 }}>
                  Pick exercises{"\n"}day by day
                </Text>
              </Pressable>

              <Pressable
                testID="generate-routine"
                onPress={() => handleCreatePress("/auto-builder")}
                style={({ pressed }) => ({
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.primary,
                  paddingVertical: 18,
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: pressed ? Colors.primary + "22" : Colors.bg,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Ionicons name="sparkles" size={22} color={Colors.primary} />
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 11, color: Colors.primary, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                  Generate{"\n"}with ARPO
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", lineHeight: 14, paddingHorizontal: 4 }}>
                  Set priorities,{"\n"}we build it
                </Text>
              </Pressable>
            </View>
          ) : (
            /* Slots full — show locked state */
            <View style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderLeftWidth: 3,
              borderLeftColor: Colors.warning,
              backgroundColor: Colors.warning + "08",
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                  Routine Slots Full
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Delete a custom routine below to create a new one.
                </Text>
              </View>
            </View>
          )}

          {/* Custom routines section */}
          {customTemplatesList.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              {/* Section header with slot counter */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2 }}>
                  My Custom Routines
                </Text>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {Array.from({ length: MAX_CUSTOM_SLOTS }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: i < customTemplatesList.length ? Colors.primary : Colors.border,
                      }}
                    />
                  ))}
                  <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 10, color: Colors.textMuted, marginLeft: 6 }}>
                    {customTemplatesList.length}/{MAX_CUSTOM_SLOTS}
                  </Text>
                </View>
              </View>

              {customTemplatesList.map((item) => (
                <View key={item.id} style={{ marginBottom: 8 }}>
                  {/* Custom template card with delete button */}
                  <Pressable
                    onPress={() => handleTemplatePress(item)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: Colors.border,
                      backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <View style={{ padding: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                          <View style={{ width: 40, height: 40, backgroundColor: Colors.bgAccent, justifyContent: "center", alignItems: "center" }}>
                            <Ionicons name="person" size={20} color={Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 1 }}>
                              {item.name}
                            </Text>
                            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>
                              {getDayLabel(item.mesoType)} · Custom
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                          <Pressable
                            onPress={(e) => { e.stopPropagation(); confirmDeleteTemplate(item); }}
                            hitSlop={12}
                            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                          >
                            <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
                          </Pressable>
                          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                        </View>
                      </View>

                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 }}>
                        {item.days.slice(0, 3).map((day) => (
                          <View key={day.id} style={{ marginBottom: 4 }}>
                            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted }}>
                              <Text style={{ color: Colors.primary, fontFamily: "Rubik_500Medium" }}>D{day.dayNumber}</Text>
                              {"  "}
                              {day.exercises.map((e) => e.exercise.name).join(" / ")}
                            </Text>
                          </View>
                        ))}
                        {item.days.length > 3 && (
                          <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                            +{item.days.length - 3} more days
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
            Pre-Built Templates
          </Text>
          {templates.map((item) => (
            <View key={item.id}>{renderTemplate({ item })}</View>
          ))}
          {templates.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
              <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>
                No templates available
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={showGoalModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: Colors.bgCard,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 24 + bottomInset,
          }}>
            {/* Header */}
            <Text style={{
              fontFamily: "Rubik_700Bold",
              fontSize: 20,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 4,
            }}>
              Choose Your Goal
            </Text>
            <Text style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 13,
              color: Colors.textSecondary,
              lineHeight: 19,
              marginBottom: 24,
            }}>
              This sets your rep targets, weekly volume range, and how aggressively ARPO progresses your weights.
            </Text>

            {GOAL_META.map((goal) => (
              <Pressable
                key={goal.key}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedGoal(goal.key);
                  setShowGoalModal(false);
                  setShowGymModal(true);
                }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: selectedGoal === goal.key ? goal.accentColor : Colors.border,
                  borderLeftWidth: 3,
                  borderLeftColor: goal.accentColor,
                  marginBottom: 10,
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: pressed ? Colors.bgAccent : Colors.bg,
                  overflow: "hidden",
                })}
              >
                {/* Card header row */}
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 14,
                  paddingTop: 14,
                  paddingBottom: 10,
                }}>
                  <View>
                    <Text style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 15,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}>
                      {goal.label}
                    </Text>
                    <Text style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 11,
                      color: Colors.textSecondary,
                      marginTop: 2,
                    }}>
                      {goal.tagline}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={goal.accentColor} />
                </View>

                {/* Spec grid */}
                <View style={{
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                  flexDirection: "row",
                }}>
                  {[
                    { label: "Reps",        value: goal.repRange },
                    { label: "Sets / wk",   value: goal.setsPerWeek.replace(" sets / week", "") },
                    { label: "RIR Wk 1→4",  value: goal.rirProgression },
                  ].map((spec, i) => (
                    <View key={i} style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      borderRightWidth: i < 2 ? 1 : 0,
                      borderRightColor: Colors.border,
                    }}>
                      <Text style={{
                        fontFamily: "Rubik_400Regular",
                        fontSize: 8,
                        color: Colors.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 4,
                      }}>
                        {spec.label}
                      </Text>
                      <Text style={{
                        fontFamily: "Rubik_700Bold",
                        fontSize: 11,
                        color: Colors.text,
                        lineHeight: 15,
                      }}>
                        {spec.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Best-for footer */}
                <View style={{
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 6,
                }}>
                  <Ionicons name="person-outline" size={11} color={Colors.textMuted} style={{ marginTop: 1 }} />
                  <Text style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 10,
                    color: Colors.textMuted,
                    flex: 1,
                    lineHeight: 15,
                  }}>
                    {goal.bestFor}
                  </Text>
                </View>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setShowGoalModal(false)}
              style={{ marginTop: 4, alignSelf: "center" }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 13,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGymModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGymModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              backgroundColor: Colors.bgCard,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
          >
            <View style={{ padding: 24 }}>
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 20,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                Training Location
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 13,
                  color: Colors.textSecondary,
                  marginBottom: 24,
                }}
              >
                Home gym mode swaps barbell and machine exercises for dumbbell
                and bodyweight alternatives
              </Text>

              <Pressable
                onPress={() => handleGymChoice(false)}
                disabled={creating}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.primary,
                  paddingVertical: 18,
                  marginBottom: 12,
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: Colors.primary,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons
                    name="barbell"
                    size={20}
                    color={Colors.text}
                  />
                  <Text
                    style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 14,
                      color: Colors.text,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}
                  >
                    Full Gym
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleGymChoice(true)}
                disabled={creating}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingVertical: 18,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="home" size={20} color={Colors.textSecondary} />
                  <Text
                    style={{
                      fontFamily: "Rubik_700Bold",
                      fontSize: 14,
                      color: Colors.textSecondary,
                      textTransform: "uppercase",
                      letterSpacing: 2,
                    }}
                  >
                    Home Gym
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setShowGymModal(false)}
                style={{ marginTop: 16, alignSelf: "center" }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_400Regular",
                    fontSize: 13,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>

            {creating && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.7)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete Custom Template Confirmation ── */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, width: "100%", padding: 24 }}>
            <Ionicons name="trash-outline" size={26} color={Colors.danger} style={{ alignSelf: "center", marginBottom: 12 }} />

            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, textAlign: "center", marginBottom: 8 }}>
              Delete Routine?
            </Text>

            {templateToDelete && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.danger, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                  {templateToDelete.name}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  {getDayLabel(templateToDelete.mesoType)} · Custom
                </Text>
              </View>
            )}

            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 24 }}>
              This will permanently delete the routine and all associated workout history. This cannot be undone. Your slot will be freed up for a new routine.
            </Text>

            <Pressable
              onPress={doDeleteTemplate}
              disabled={deleting}
              style={({ pressed }) => ({
                backgroundColor: Colors.danger,
                paddingVertical: 14,
                alignItems: "center",
                marginBottom: 10,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {deleting ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Delete Permanently
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setShowDeleteConfirm(false); setTemplateToDelete(null); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: "center", paddingVertical: 8 })}
            >
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Switch Plan Confirmation ── */}
      <Modal
        visible={showSwitchConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSwitchConfirm(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: Colors.bgAccent, borderWidth: 1, borderColor: Colors.border, width: "100%", padding: 24 }}>
            <Ionicons name="warning-outline" size={28} color={Colors.warning} style={{ alignSelf: "center", marginBottom: 12 }} />

            <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 15, color: Colors.text, textTransform: "uppercase", letterSpacing: 2, textAlign: "center", marginBottom: 8 }}>
              End Current Plan?
            </Text>

            {activePlanInfo && (
              <View style={{ borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.warning, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 }}>
                <Text style={{ fontFamily: "Rubik_600SemiBold", fontSize: 13, color: Colors.text }}>
                  {activePlanInfo.name}
                </Text>
                <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Week {activePlanInfo.week} · In progress
                </Text>
              </View>
            )}

            <Text style={{ fontFamily: "Rubik_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 24 }}>
              Starting a new plan will end this mesocycle. Your completed workout history is saved, but targets and progression will reset to the new template.
            </Text>

            <Pressable
              onPress={() => doCreatePlan(pendingIsHome)}
              disabled={creating}
              style={({ pressed }) => ({
                backgroundColor: Colors.danger,
                paddingVertical: 14,
                alignItems: "center",
                marginBottom: 10,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {creating ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={{ fontFamily: "Rubik_700Bold", fontSize: 13, color: Colors.text, textTransform: "uppercase", letterSpacing: 2 }}>
                  Start New Plan
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setShowSwitchConfirm(false)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: "center", paddingVertical: 8 })}
            >
              <Text style={{ fontFamily: "Rubik_500Medium", fontSize: 13, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>
                Keep Current Plan
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

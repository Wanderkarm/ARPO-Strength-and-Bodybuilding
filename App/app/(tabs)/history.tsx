import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useUnit } from "@/contexts/UnitContext";
import {
  getCompletedWorkoutHistory,
  type HistoryEntry,
} from "@/lib/local-db";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatTonnage(value: number, unit: string): string {
  if (unit === "kg") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${Math.round(value)} kg`;
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K lbs` : `${Math.round(value)} lbs`;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { unit } = useUnit();

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  async function loadHistory() {
    setIsLoading(true);
    try {
      const data = await getCompletedWorkoutHistory();
      setHistory(data);
    } catch (err) {
      console.error("History load error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleExpand(index: number) {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  function renderItem({ item, index }: { item: HistoryEntry; index: number }) {
    const isExpanded = expandedIndex === index;

    return (
      <Pressable
        testID={`history-row-${index}`}
        onPress={() => toggleExpand(index)}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
          paddingHorizontal: 24,
          paddingVertical: 16,
          backgroundColor: isExpanded ? Colors.bgCard : Colors.bg,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 11,
                color: Colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              {formatDate(item.date)}
            </Text>
            <Text
              style={{
                fontFamily: "Rubik_600SemiBold",
                fontSize: 14,
                color: Colors.text,
              }}
              numberOfLines={1}
            >
              {item.routineName}
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 12,
                  color: Colors.textSecondary,
                }}
              >
                {" "}— W{item.weekNumber}, Day {item.dayNumber}
              </Text>
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {item.isSkipped ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_500Medium",
                    fontSize: 10,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Skipped
                </Text>
              </View>
            ) : (
              <Text
                style={{
                  fontFamily: "Rubik_700Bold",
                  fontSize: 14,
                  color: Colors.primary,
                }}
              >
                {formatTonnage(item.totalTonnage, unit)}
              </Text>
            )}
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors.textMuted}
            />
          </View>
        </View>

        {isExpanded && !item.isSkipped && (
          <View style={{ marginTop: 16 }}>
            {item.exercises.map((ex, exIdx) => (
              <View
                key={exIdx}
                style={{
                  marginBottom: exIdx < item.exercises.length - 1 ? 12 : 0,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Rubik_500Medium",
                    fontSize: 12,
                    color: Colors.text,
                    marginBottom: 6,
                  }}
                >
                  {ex.exerciseName}
                </Text>
                {ex.sets.length > 0 ? (
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 10,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          width: 40,
                        }}
                      >
                        Set
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 10,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          flex: 1,
                          textAlign: "center",
                        }}
                      >
                        Weight
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Rubik_500Medium",
                          fontSize: 10,
                          color: Colors.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          flex: 1,
                          textAlign: "right",
                        }}
                      >
                        Reps
                      </Text>
                    </View>
                    {ex.sets.map((set, setIdx) => (
                      <View
                        key={setIdx}
                        style={{
                          flexDirection: "row",
                          paddingVertical: 3,
                          borderTopWidth: setIdx === 0 ? 1 : 0,
                          borderTopColor: Colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Rubik_400Regular",
                            fontSize: 12,
                            color: Colors.textSecondary,
                            width: 40,
                          }}
                        >
                          {set.setNumber}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Rubik_400Regular",
                            fontSize: 12,
                            color: Colors.text,
                            flex: 1,
                            textAlign: "center",
                          }}
                        >
                          {set.weight} {unit}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Rubik_400Regular",
                            fontSize: 12,
                            color: Colors.text,
                            flex: 1,
                            textAlign: "right",
                          }}
                        >
                          {set.reps}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: "Rubik_400Regular",
                      fontSize: 11,
                      color: Colors.textMuted,
                    }}
                  >
                    No sets recorded
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {isExpanded && item.isSkipped && (
          <View style={{ marginTop: 12 }}>
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 12,
                color: Colors.textMuted,
              }}
            >
              Session was skipped. Targets carried to next week.
            </Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: topInset,
      }}
    >
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}
      >
        <Text
          style={{
            fontFamily: "Rubik_700Bold",
            fontSize: 22,
            color: Colors.text,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          History
        </Text>
        <Text
          style={{
            fontFamily: "Rubik_400Regular",
            fontSize: 12,
            color: Colors.textSecondary,
            marginTop: 2,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Past Sessions
        </Text>
      </View>

      {isLoading ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : history.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 48,
          }}
        >
          <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
          <Text
            style={{
              fontFamily: "Rubik_500Medium",
              fontSize: 14,
              color: Colors.textMuted,
              textAlign: "center",
              marginTop: 16,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            No sessions logged yet
          </Text>
          <Text
            style={{
              fontFamily: "Rubik_400Regular",
              fontSize: 12,
              color: Colors.textMuted,
              textAlign: "center",
              marginTop: 6,
            }}
          >
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
      )}
    </View>
  );
}

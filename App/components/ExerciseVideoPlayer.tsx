import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // Handles:
  //   https://youtu.be/VIDEO_ID
  //   https://www.youtube.com/watch?v=VIDEO_ID
  //   https://www.youtube.com/embed/VIDEO_ID
  //   https://m.youtube.com/watch?v=VIDEO_ID&...
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

interface ExerciseVideoPlayerProps {
  visible: boolean;
  onClose: () => void;
  videoUrl: string;
  exerciseName: string;
}

export default function ExerciseVideoPlayer({
  visible,
  onClose,
  videoUrl,
  exerciseName,
}: ExerciseVideoPlayerProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const videoId = extractYouTubeId(videoUrl);
  const playerWidth = Math.min(width - 32, 600);
  const playerHeight = Math.round(playerWidth * (9 / 16));

  const embedUri = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&modestbranding=1&rel=0&controls=1`
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.9)",
          justifyContent: "center",
          alignItems: "center",
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 16,
        }}
      >
        {/* Header */}
        <View
          style={{
            width: playerWidth,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Rubik_600SemiBold",
              fontSize: 13,
              color: Colors.text,
              textTransform: "uppercase",
              letterSpacing: 1,
              flex: 1,
              marginRight: 12,
            }}
            numberOfLines={1}
          >
            {exerciseName}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              backgroundColor: Colors.bgAccent,
              width: 32,
              height: 32,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: Colors.border,
            })}
          >
            <Ionicons name="close" size={18} color={Colors.text} />
          </Pressable>
        </View>

        {/* Player */}
        {embedUri ? (
          <View
            style={{
              width: playerWidth,
              height: playerHeight,
              backgroundColor: "#000",
              overflow: "hidden",
            }}
          >
            {Platform.OS === "web" ? (
              // On web use an iframe directly
              <iframe
                src={embedUri}
                width={playerWidth}
                height={playerHeight}
                allow="autoplay; fullscreen"
                style={{ border: "none" }}
              />
            ) : (
              <WebView
                source={{ uri: embedUri }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
              />
            )}
          </View>
        ) : (
          <View
            style={{
              width: playerWidth,
              height: playerHeight,
              backgroundColor: Colors.bgAccent,
              borderWidth: 1,
              borderColor: Colors.border,
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle-outline" size={32} color={Colors.textMuted} />
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 12,
                color: Colors.textMuted,
                textAlign: "center",
              }}
            >
              Couldn't load video.{"\n"}Check the URL in exercise settings.
            </Text>
          </View>
        )}

        {/* Dismiss hint */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: 20,
            opacity: pressed ? 0.6 : 1,
            paddingVertical: 8,
            paddingHorizontal: 24,
            borderWidth: 1,
            borderColor: Colors.border,
          })}
        >
          <Text
            style={{
              fontFamily: "Rubik_500Medium",
              fontSize: 12,
              color: Colors.textSecondary,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Close
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  useWindowDimensions,
  Linking,
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
  const [embedFailed, setEmbedFailed] = useState(false);

  // Reset failure state whenever the video URL changes (different exercise)
  const prevVideoUrlRef = React.useRef(videoUrl);
  if (videoUrl !== prevVideoUrlRef.current) {
    prevVideoUrlRef.current = videoUrl;
    setEmbedFailed(false);
  }

  const videoId = extractYouTubeId(videoUrl);
  const playerWidth = Math.min(width - 32, 600);
  const playerHeight = Math.round(playerWidth * (9 / 16));

  // Use youtube-nocookie for better embed compatibility
  const embedUri = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&modestbranding=1&rel=0&controls=1`
    : null;

  // Direct YouTube URL for opening in the app/browser
  const youtubeAppUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;

  function openInYouTube() {
    if (youtubeAppUrl) Linking.openURL(youtubeAppUrl).catch(() => {});
  }

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
        <View
          style={{
            width: playerWidth,
            height: playerHeight,
            backgroundColor: "#000",
            overflow: "hidden",
          }}
        >
          {!embedUri || embedFailed ? (
            // Embed blocked or no URL — show open-in-YouTube CTA
            <Pressable
              onPress={openInYouTube}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: Colors.bgAccent,
                borderWidth: 1,
                borderColor: Colors.border,
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="logo-youtube" size={40} color="#FF0000" />
              <Text
                style={{
                  fontFamily: "Rubik_600SemiBold",
                  fontSize: 13,
                  color: Colors.text,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Watch on YouTube
              </Text>
              <Text
                style={{
                  fontFamily: "Rubik_400Regular",
                  fontSize: 11,
                  color: Colors.textMuted,
                  textAlign: "center",
                  paddingHorizontal: 20,
                }}
              >
                {embedFailed
                  ? "This video can't be embedded — tap to open in YouTube."
                  : "Tap to open in the YouTube app."}
              </Text>
            </Pressable>
          ) : Platform.OS === "web" ? (
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
              onError={() => setEmbedFailed(true)}
              onHttpError={(e) => {
                // Error 153 / any 4xx from YouTube means embedding blocked
                if (e.nativeEvent.statusCode >= 400) setEmbedFailed(true);
              }}
            />
          )}
        </View>

        {/* Open in YouTube link (always visible as fallback) */}
        {!embedFailed && embedUri && (
          <Pressable
            onPress={openInYouTube}
            hitSlop={8}
            style={({ pressed }) => ({
              marginTop: 10,
              opacity: pressed ? 0.6 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            })}
          >
            <Ionicons name="open-outline" size={13} color={Colors.textMuted} />
            <Text
              style={{
                fontFamily: "Rubik_400Regular",
                fontSize: 11,
                color: Colors.textMuted,
                textDecorationLine: "underline",
              }}
            >
              Open in YouTube
            </Text>
          </Pressable>
        )}

        {/* Dismiss */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: embedFailed ? 20 : 12,
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

import "@/lib/i18n"; // initialise i18n before anything renders — side-effect only
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UnitProvider } from "@/contexts/UnitContext";
import { PurchaseProvider } from "@/contexts/PurchaseContext";
import { initializeDatabase } from "@/lib/local-db";
import React, { useEffect, useState } from "react";
import {
  useFonts,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from "@expo-google-fonts/rubik";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Rest-timer notifications fire ~1 s after the in-app countdown ends.
    // When the app is in the foreground we suppress the phone banner and duplicate
    // sound, but iOS still *delivers* the notification → Apple Watch receives it
    // and fires its own haptic without interrupting the phone UI.
    const isRestTimer =
      notification.request.content.categoryIdentifier === "rest-timer";
    return {
      shouldShowAlert:  !isRestTimer,
      shouldShowBanner: !isRestTimer,
      shouldShowList:   !isRestTimer,
      shouldPlaySound:  !isRestTimer,
      shouldSetBadge:   false,
    };
  },
});

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000000" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="templates" />
      <Stack.Screen name="custom-builder" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="meso-complete" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen
        name="workout"
        options={{ animation: "slide_from_bottom", gestureEnabled: false }}
      />
      <Stack.Screen
        name="summary"
        options={{ animation: "fade", gestureEnabled: false }}
      />
      <Stack.Screen
        name="paywall"
        options={{ animation: "fade", gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
  });

  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initializeDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("DB init error:", err?.message || String(err), err?.stack || "");
        setDbReady(true);
      });
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) {
    return <View style={{ flex: 1, backgroundColor: "#000000" }} />;
  }

  return (
    <ErrorBoundary>
      <PurchaseProvider>
        <UnitProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </UnitProvider>
      </PurchaseProvider>
    </ErrorBoundary>
  );
}

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UnitProvider } from "@/contexts/UnitContext";
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
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
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
      <UnitProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </UnitProvider>
    </ErrorBoundary>
  );
}

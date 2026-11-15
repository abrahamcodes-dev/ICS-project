export default {
  expo: {
    name: "CallADoc",
    slug: "calladoc",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "calladoc",
    // Firebase uses the JS SDK: Android Google sign-in autolinks and receives an
    // explicit web client ID, without adding a second native Firebase app.
    plugins: [["expo-image-picker", { photosPermission: "Choose an optional profile picture." }], "expo-status-bar", "@config-plugins/react-native-webrtc", "@config-plugins/react-native-pdf", "./plugins/withPrivatePdfSpike.cjs",
      ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ? [["@react-native-google-signin/google-signin", {iosUrlScheme:process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME}]] : [])],
    // TODO: icon/splash paths once design assets (Figma, per dev-tools list) are exported
    ios: { supportsTablet: false, bundleIdentifier: "com.calladoc.app" },
    android: {
      package: "com.calladoc.app",
      permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"],
      // The PDF spike uses application-private cache files, never shared storage.
      blockedPermissions: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.DOWNLOAD_WITHOUT_NOTIFICATION"],
    },
    extra: {
      // Loaded from .env via babel-plugin or expo-constants — fill in .env
    },
  },
};

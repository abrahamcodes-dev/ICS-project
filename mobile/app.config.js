export default {
  expo: {
    name: "CallADoc",
    slug: "calladoc",
    version: "0.1.0",
    orientation: "portrait",
    scheme: "calladoc",
    plugins: ["expo-status-bar"],
    // TODO: icon/splash paths once design assets (Figma, per dev-tools list) are exported
    ios: { supportsTablet: false, bundleIdentifier: "com.calladoc.app" },
    android: { package: "com.calladoc.app" },
    extra: {
      // Loaded from .env via babel-plugin or expo-constants — fill in .env
    },
  },
};

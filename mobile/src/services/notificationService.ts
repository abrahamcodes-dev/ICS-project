import * as Notifications from "expo-notifications";

// Sprint 3 — Firebase Cloud Messaging registration.
// NOTE: requires the `expo-notifications` package (not yet in package.json —
// add it when this module is implemented) and platform-specific FCM setup.
export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    return null;
  }
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
  // TODO: persist token against the user's Firestore document so
  // functions/src/notifications can target it.
}

import * as Notifications from "expo-notifications";

// Sprint 3 — Firebase Cloud Messaging registration.
// NOTE: expo-notifications is installed for this existing module.
// Platform-specific notification setup and token persistence remain deferred.
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

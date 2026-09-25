import { logger } from "firebase-functions/v2";
import { getMessaging } from "firebase-admin/messaging";
import { usersCol } from "../shared/firestoreRefs";

// Sprint 3 — sends an FCM push notification to a user by uid.
// Assumes the client has stored an FCM token on the user document
// (see mobile/src/services/notificationService.ts — token persistence is a TODO there).
export async function sendNotificationToUser(uid: string, title: string, body: string) {
  const snap = await usersCol.doc(uid).get();
  const token = snap.data()?.fcmToken;

  if (!token) {
    logger.warn(`No FCM token on file for user ${uid}; skipping notification.`);
    return;
  }

  await getMessaging().send({
    token,
    notification: { title, body },
  });
}

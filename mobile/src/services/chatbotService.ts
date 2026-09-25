// Sprint 5 — thin client for the rule-based chatbot.
// The actual matching logic lives server-side (functions/src/chatbot)
// so the knowledge base can be updated without an app release.
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebaseConfig";

export async function askChatbot(query: string, userId?: string) {
  const functions = getFunctions(app);
  const matchRule = httpsCallable(functions, "matchChatbotRule");
  const result = await matchRule({ query, userId });
  return result.data as { response: string; matchedRuleId?: string };
}

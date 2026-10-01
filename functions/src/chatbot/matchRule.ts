import { onCall } from "firebase-functions/v2/https";
import { chatbotInteractionsCol } from "../shared/firestoreRefs";
import { FALLBACK_RESPONSE } from "./knowledgeBase";
import { findMatchingRule } from "./findMatchingRule";
export { findMatchingRule } from "./findMatchingRule";

export const MEDICAL_DISCLAIMER =
  "This information is general guidance only and is not a medical diagnosis. " +
  "Please book a consultation with a verified doctor for personal medical advice.";

// Sprint 5 — callable used by mobile/src/services/chatbotService.ts.
// Available to guests (no auth check) per the proposal's guest-accessible chatbot.
export const matchChatbotRule = onCall(async (request) => {
  const query: string = request.data?.query ?? "";
  const userId: string | undefined = request.data?.userId;

  const rule = findMatchingRule(query);
  const response = rule
    ? `${rule.response} ${MEDICAL_DISCLAIMER}`
    : `${FALLBACK_RESPONSE} ${MEDICAL_DISCLAIMER}`;

  await chatbotInteractionsCol.add({
    userId: userId ?? null,
    query,
    matchedRuleId: rule?.id ?? null,
    respondedAt: new Date().toISOString(),
  });

  return { response, matchedRuleId: rule?.id };
});

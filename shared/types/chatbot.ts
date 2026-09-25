export interface ChatbotRule {
  id: string;
  keywords: string[];
  category: "symptoms" | "disease_info" | "maternal_child_health" | "nutrition" | "mental_health" | "medication_guidance";
  response: string;
}

export interface ChatbotInteraction {
  id: string;
  userId?: string;      // absent for guest users
  query: string;
  matchedRuleId?: string;
  respondedAt: string;
}

export const MEDICAL_DISCLAIMER =
  "This information is general guidance only and is not a medical diagnosis. " +
  "Please book a consultation with a verified doctor for personal medical advice.";

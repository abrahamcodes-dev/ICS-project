export interface ChatbotRule {
  id: string;
  keywords: string[];
  category:
    | "symptoms"
    | "disease_info"
    | "maternal_child_health"
    | "nutrition"
    | "mental_health"
    | "medication_guidance";
  response: string;
}

// Starter knowledge base only — the proposal names WHO, Kenya MOH and
// peer-reviewed literature as sources but does not publish the actual rule
// set. Expand this list; keep it reviewable by a clinician before real use.
export const KNOWLEDGE_BASE: ChatbotRule[] = [
  {
    id: "fever_001",
    keywords: ["fever", "temperature", "hot body"],
    category: "symptoms",
    response:
      "A fever can have many causes. Rest, stay hydrated, and monitor your temperature. " +
      "If it stays above 39°C, lasts more than 2 days, or comes with severe symptoms, book a consultation.",
  },
  {
    id: "pregnancy_checkup_001",
    keywords: ["pregnant", "pregnancy", "antenatal"],
    category: "maternal_child_health",
    response:
      "Regular antenatal checkups are important throughout pregnancy. " +
      "Book a consultation with a doctor to discuss a checkup schedule suited to you.",
  },
  {
    id: "nutrition_general_001",
    keywords: ["diet", "nutrition", "healthy eating"],
    category: "nutrition",
    response:
      "A balanced diet includes vegetables, fruits, whole grains, and adequate protein and water. " +
      "For a plan suited to a specific condition, book a consultation.",
  },
  {
    id: "mental_health_stress_001",
    keywords: ["stress", "anxious", "anxiety", "overwhelmed"],
    category: "mental_health",
    response:
      "Feeling stressed or anxious is common and support is available. " +
      "Consider talking to someone you trust, and book a consultation with a doctor if it persists.",
  },
  {
    id: "medication_general_001",
    keywords: ["medication", "dosage", "side effects"],
    category: "medication_guidance",
    response:
      "Medication dosage and interactions should always be confirmed with a healthcare professional. " +
      "Book a consultation before starting, stopping, or combining medications.",
  },
];

export const FALLBACK_RESPONSE =
  "I don't have specific guidance on that yet. For anything beyond general information, " +
  "please book a consultation with a verified doctor.";

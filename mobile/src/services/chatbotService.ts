/** Local English-only rules. No Firebase, records, analytics or network calls. */
export const CHATBOT_LIMIT = 500;
export const CHATBOT_DISCLAIMER = 'I am a rule-based information assistant, not a doctor. I cannot examine you, diagnose illness or recommend treatment. Do not share names, medical records or other identifying details.';
export const EMERGENCY_GUIDANCE = 'If these symptoms are happening now, seek immediate professional help: contact your local emergency services or go to the nearest emergency department. Ask someone nearby to help. Do not wait for this assistant or a CallADoc appointment.';
export type HealthReply = { intent: string; response: string; emergency: boolean };
const rules: { intent: string; pattern: RegExp; response: string }[] = [
  { intent: 'medication', pattern: /\b(medicines?|medications?|dosage|doses?|dosing|tablets?|pills?|prescri\w*|antibiotics?|paracetamol|ibuprofen|mg|side effects)\b/,
    response: 'I cannot choose medicines, recommend doses or check interactions. Ask a qualified clinician or pharmacist about medicines, including changes to an existing prescription.' },
  { intent: 'diagnosis', pattern: /\b(diagnos\w*|what (illness|disease)|do i have|treat\w*|cure)\b/,
    response: 'I cannot identify an illness or recommend treatment. A qualified clinician needs to assess your concerns. Arrange professional advice, especially if symptoms persist or worsen.' },
  { intent: 'nutrition', pattern: /\b(nutrition|diet|healthy eating|balanced meals?|vegetables?|fruit)\b/,
    response: 'General healthy eating includes varied foods such as vegetables, fruit, whole grains and pulses. Individual dietary needs differ; ask a clinician about advice for a medical condition.' },
  { intent: 'hygiene', pattern: /\b(hygiene|handwashing|wash(ing)? (my |your )?hands)\b/,
    response: 'Handwashing with soap and water helps reduce the spread of infections. Clean hands before preparing food and after using the toilet.' },
  { intent: 'sleep', pattern: /\b(sleep|bedtime|insomnia)\b/,
    response: 'A regular sleep routine can support wellbeing. If sleep difficulties persist or affect daily life, discuss them with a healthcare professional.' },
  { intent: 'stress', pattern: /\b(stress\w*|anxious|anxiety|overwhelmed)\b/,
    response: 'Support is available for stress and anxiety. Talking with someone you trust may help. Seek professional support if distress persists or affects daily life. If you cannot stay safe, seek emergency help now.' },
  { intent: 'pregnancy', pattern: /\b(pregnan\w*|antenatal|baby|babies|infant)\b/,
    response: 'Pregnancy and infant health concerns need appropriate professional advice. Contact a qualified healthcare professional for checkups or any concerning symptoms; this assistant cannot assess their urgency.' },
  { intent: 'symptoms', pattern: /\b(fever|cough|headache|pain|rash|vomit\w*|diarrh\w*|dizz\w*|symptoms?)\b/,
    response: 'Symptoms can have different causes, and I cannot assess yours. Contact a healthcare professional for advice, particularly if symptoms persist, worsen or concern you. For severe or sudden symptoms, seek urgent in-person help.' },
  { intent: 'consultation', pattern: /\b(book|appointment|consultation|doctor|professional advice)\b/,
    response: 'For non-emergency advice, use Find a doctor after signing in as a patient. Choose an approved doctor and an available appointment. Availability depends on the connected backend; this chat does not book appointments.' },
  { intent: 'greeting', pattern: /\b(hi|hello|help|topics)\b/,
    response: 'I can share general information about nutrition, hand hygiene, sleep and stress, or explain how to find professional care. Please keep questions general and in English.' },
];
// Conservative keyword safety net, not triage. Negations intentionally do not suppress alerts.
const emergency = /\b(chest (pain|pressure|tightness)|short(ness)? of breath|difficulty (in )?breathing|trouble breathing|can ?not breathe|can t breathe|unable to breathe|choking|unconscious|unresponsive|passed out|seizures?|stroke|face droop\w*|slurred speech|sudden weakness|severe bleeding|bleeding heavily|overdose|poison\w*|suicid\w*|self harm|kill myself|hurt myself|end my life|can t stay safe|cannot stay safe|swollen (tongue|throat)|throat swelling)\b/;
export function askChatbot(query: string): HealthReply {
  if (typeof query !== 'string' || !query.trim() || query.length > CHATBOT_LIMIT) {
    throw new Error(`Enter a question of 1-${CHATBOT_LIMIT} characters.`);
  }
  const normalized = query.normalize('NFKC').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  if (emergency.test(normalized)) return { intent: 'emergency', response: EMERGENCY_GUIDANCE, emergency: true };
  const rule = rules.find(r => r.pattern.test(normalized));
  return rule ? { intent: rule.intent, response: rule.response, emergency: false } : {
    intent: 'unknown', emergency: false,
    response: 'I do not recognize that question. I only offer limited general information in English, and cannot rule out a serious problem. Try a general topic or contact a qualified healthcare professional. Seek immediate help if you feel seriously unwell.',
  };
}

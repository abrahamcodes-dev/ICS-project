/** Local English-only rules. No Firebase, records, analytics or network calls. */
import { MEDICAL_DISCLAIMER } from '../constants/disclaimers';
import { HEALTH_KNOWLEDGE_BASE, type HealthKnowledgeEntry, type FollowUpKind } from '../knowledge/healthKnowledgeBase';
import { canonicalHealthText, normalizeHealthText, selectHealthKnowledge, followUpKind, isReferentialFollowUp, hasUnresolvedTopicReference } from './healthMatcher';
import { NUTRITION_PERSONAL_REQUEST } from '../knowledge/nutritionKnowledge';
import { hasCompetingQuestionIntents } from './healthQuestionIntent';

export const CHATBOT_LIMIT = 500;
export const CHATBOT_DISCLAIMER = 'I am a rule-based information assistant, not a doctor. I cannot examine you, diagnose illness or recommend treatment. Do not share names, medical records or other identifying details.';
export const EMERGENCY_GUIDANCE = 'For a possible emergency, seek immediate professional help: contact your local emergency services or go to the nearest emergency department. For a possible overdose or poisoning, seek help even if there are no symptoms. Ask someone nearby to help. Do not wait for this assistant or a CallADoc appointment. Routine consultation advice is for non-emergency concerns only.';
export type HealthReply = { intent: string; response: string; emergency: boolean; knowledgeId?: string; contentVersion?: string; followUp?: FollowUpKind };
export type HealthContext = Readonly<{knowledgeId?: string}>;
/** Compose once in the engine; the UI must not append another copy. */
export function withMedicalDisclaimer(response: string): string {
  return response.includes(MEDICAL_DISCLAIMER) ? response : `${response}\n\n${MEDICAL_DISCLAIMER}`;
}
export const CHATBOT_WELCOME = withMedicalDisclaimer("Hi! I'm CallADoc's rule-based health information assistant. I match general questions to predefined information and wellness tips. How can I help you today?");
function reply(intent: string, response: string, emergency = false): HealthReply {
  return {intent, response: withMedicalDisclaimer(response), emergency};
}
const rules: { intent: string; pattern: RegExp; response: string }[] = [
  { intent: 'medication', pattern: /\b(medicines?|medications?|dosage|doses?|dosing|tablets?|pills?|prescri\w*|antibiotics?|paracetamol|ibuprofen|mg|side effects|what should i take|what can i take)\b|\b\d+\s*(mg|ml|mcg)\b/,
    response: 'I cannot choose medicines, recommend doses or check interactions. Ask a qualified clinician or pharmacist about medicines, including changes to an existing prescription.' },
  { intent: 'diagnosis', pattern: /\b(diagnos\w*|what (illness|disease)|do i have|could i have|might i have|have i got|is this|does (my|our) (child|baby) have|treat\w*|cure)\b/,
    response: 'I cannot identify an illness or recommend treatment. A qualified clinician needs to assess your concerns. Arrange professional advice, especially if symptoms persist or worsen.' },
  { intent: 'symptoms', pattern: /\b(fever|cough|headache|pain|rash|vomit\w*|diarrh\w*|dizz\w*|symptoms?)\b/,
    response: 'Symptoms can have different causes, and I cannot assess yours. Contact a healthcare professional for advice, particularly if symptoms persist, worsen or concern you. For severe or sudden symptoms, seek urgent in-person help.' },
  { intent: 'consultation', pattern: /\b(book|appointment|consultation|doctor|professional advice)\b/,
    response: 'For non-emergency advice, use Find a doctor after signing in as a patient. Choose an approved doctor and an available appointment. Availability depends on the connected backend; this chat does not book appointments.' },
  { intent: 'greeting', pattern: /\b(hi|hello|help|topics)\b/,
    response: 'I share predefined general information about symptoms, common diseases, maternal and child health, nutrition, mental wellbeing and medication safety. Content is pending clinical review. I cannot diagnose or recommend treatment. Please keep questions general and in English.' },
];
// Conservative keyword safety net, not triage. Negations intentionally do not suppress alerts.
const emergency = /\b(chest (pain|pressure|tightness)|short(ness)? of breath|difficulty (in )?breathing|trouble breathing|can ?not breathe|can t breathe|unable to breathe|choking|unconscious|unresponsive|passed out|seizures?|stroke|face droop\w*|slurred speech|sudden weakness|severe bleeding|bleeding heavily|overdose|poison\w*|suicid\w*|self harm|kill myself|hurt myself|end my life|can t stay safe|cannot stay safe|swollen (tongue|throat)|throat swelling)\b/;
// Bounded paraphrases for the documented missed cases. This safety net does not
// assess urgency or understand negation; alerts remain conservative, even when
// a phrase is hypothetical or negated. No medicine quantities are interpreted.
const emergencyParaphrases = [
  /\b(not|isn t|aren t|stopped|no longer) breathing\b/,
  /\b(pain|pressure|tightness) (in|across|around|on) ((my|your|the|his|her|our|their) )?chest\b/,
  /\b(take|took|taken|taking|swallowed|swallowing) (too many|too much) ([a-z]+ ){0,2}(pills?|tablets?|medicines?|medications?|paracetamol|ibuprofen)\b/,
  /\b(tongue|throat) (is |feels |is getting )?(swelling|swollen)\b/,
];
function knowledgeReply(entry: HealthKnowledgeEntry, response = entry.response, followUp?: FollowUpKind): HealthReply {
  return {...reply(entry.intent, response), knowledgeId:entry.id, contentVersion:entry.contentVersion, ...(followUp ? {followUp} : {})};
}
function clarify(labels: readonly string[] = []): HealthReply {
  return reply('clarification', labels.length > 1
    ? `I found more than one possible topic: ${labels.join(', ')}. Please ask about one topic at a time. I can only use predefined general information. For personal advice, consult a verified CallADoc doctor.`
    : 'Please name the health topic and ask one general question. I do not have a supported answer for that follow-up or enough information to choose a topic. For personal advice, consult a verified CallADoc doctor.');
}
function unsupported(): HealthReply {
  return reply('unknown', 'I do not recognize that question. I only offer limited general information in English, and cannot rule out a serious problem. For non-emergency advice, consult a verified CallADoc doctor. Seek immediate professional help if you feel seriously unwell; do not wait for a CallADoc appointment.');
}
export function askChatbot(query: string, context?: HealthContext): HealthReply {
  if (typeof query !== 'string' || !query.trim() || query.length > CHATBOT_LIMIT) {
    throw new Error(`Enter a question of 1-${CHATBOT_LIMIT} characters.`);
  }
  const original = normalizeHealthText(query);
  const normalized = canonicalHealthText(original);
  if ([original,normalized].some(text => emergency.test(text) || emergencyParaphrases.some(pattern => pattern.test(text)))) {
    return reply('emergency', EMERGENCY_GUIDANCE, true);
  }
  const medication = HEALTH_KNOWLEDGE_BASE.find(entry => entry.category === 'medication_guidance' && entry.patterns.some(pattern => pattern.test(original)));
  // Only complete educational medication questions may pass the broad medicine
  // guard. Adding a personal/dosing request makes these anchored patterns fail.
  const boundary = rules.find(r => (r.intent === 'diagnosis' ||
    (r.intent === 'medication' && !medication)) && [original,normalized].some(text => r.pattern.test(text)));
  if (boundary) return reply(boundary.intent, boundary.response);
  if (NUTRITION_PERSONAL_REQUEST.test(normalized)) return reply('nutrition_boundary', 'I cannot provide restrictive diets, personal meal plans or food-based treatment. For individual nutrition concerns, including eating difficulties, consult a qualified health professional or a verified CallADoc doctor.');
  if (hasCompetingQuestionIntents(normalized)) return clarify();
  const selection = selectHealthKnowledge(normalized, medication?.id);
  if (selection.kind === 'clarify') return clarify(selection.labels);
  if (selection.kind === 'match' && selection.entry.category === 'nutrition' &&
      /\b(cancer|allerg\w*|intoleran\w*)\b|^how (much|many)\b/.test(normalized)) {
    return reply('nutrition_boundary', 'I cannot assess food safety for an individual, calculate personal quantities or recommend food for a medical condition. Consult a qualified health professional or a verified CallADoc doctor.');
  }
  const facet = followUpKind(normalized);
  if (selection.kind === 'match') {
    const statedAge = normalized.match(/\b(?:i am|i m|aged?) (\d{1,2})\b|\b(\d{1,2}) years? old\b/);
    if (selection.entry.id === 'general-sleep' && facet === 'duration' &&
        (/\b(children|child|baby|babies|infant|toddler|newborn|teen|teens|teenager|teenagers|teenage)\b/.test(normalized) ||
         (statedAge && Number(statedAge[1] ?? statedAge[2]) < 18))) {
      return reply('clarification', 'I have only an adult sleep-duration answer here. Children and teenagers have different sleep recommendations. Ask a qualified health professional for age-appropriate guidance; consult a verified CallADoc doctor for individual concerns.');
    }
    if (facet === 'definition') return knowledgeReply(selection.entry,selection.entry.followUps.definition ?? selection.entry.response);
    if (facet) {
      const response = selection.entry.followUps[facet];
      return response ? knowledgeReply(selection.entry,response,facet) : unsupported();
    }
    return knowledgeReply(selection.entry);
  }
  if (isReferentialFollowUp(normalized)) {
    const previous = HEALTH_KNOWLEDGE_BASE.find(entry => entry.id === context?.knowledgeId);
    const response = facet === 'definition' ? previous?.followUps.definition ?? previous?.response : facet && previous?.followUps[facet];
    return previous && response ? knowledgeReply(previous,response,facet) : clarify();
  }
  if (hasUnresolvedTopicReference(normalized)) return clarify();
  if (facet) return unsupported();
  const rule = rules.find(r => r.pattern.test(normalized));
  return rule ? reply(rule.intent, rule.response) : unsupported();
}

/** Per-conversation, memory-only topic. Never use a shared/global session. */
export function createHealthChatSession() {
  let context: HealthContext = {};
  return {
    ask(query: string): HealthReply {
      const result = askChatbot(query, context);
      // Ambiguity, unsupported queries and safety responses invalidate old topics.
      context = result.knowledgeId ? {knowledgeId:result.knowledgeId} : {};
      return result;
    },
    reset() { context = {}; },
  };
}

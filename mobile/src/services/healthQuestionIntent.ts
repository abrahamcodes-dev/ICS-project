import type { FollowUpKind } from '../knowledge/healthKnowledgeBase';

/** Ordered, explicit English forms. These classify the question, not the user. */
const forms: readonly [FollowUpKind, RegExp][] = [
  ['duration', /\bhow (many (hours?|minutes?)|much sleep|long)\b|\b(recommended sleep duration|hours of sleep|sleep duration)\b/],
  ['frequency', /\bhow often\b|\bhow many times\b/],
  ['alternatives', /\bhealthier (alternatives?|options?|choices?)\b|\balternatives? to\b|\bmake\b.*\bhealthier\b/],
  ['signs', /\b(signs|symptoms) of\b|^what (are|could be) (the )?(signs|symptoms)\b/],
  ['benefits', /\bbenefits? of\b|\bhealth benefits?\b|\bbenefits?$|^why (is|are) (it|they) good$|^(is|are)\b.*\b(healthy|good for (me|you|us))$/],
  ['nutrients', /^(what|which) (nutrients?|vitamins?|minerals?)\b|\b(nutrient content|nutritional value)\b|^what does (it|that) contain$/],
  ['preparation', /\bhow (can|should|do) (i|we|you) (prepare|cook|wash|store)\b|\bhow to (prepare|cook|wash|store)\b/],
  ['safety', /^(is|are)\b.*\bsafe\b|^tell me if .+ (is|are) safe\b|\bsafety of\b/],
  ['limitations', /^(any limitations|what (are|about) (the )?(limitations|downsides)( of .+)?|are there any (limitations|downsides)( to .+)?)$|\b(limitations|downsides) of\b/],
  ['causes', /^(what causes?|what is the cause of)\b|\bcauses? of\b/],
  ['prevention', /\bhow (can|do) (i|we|you) prevent\b|\bhow to prevent\b|^how can it be prevented$|\bprevention\b/],
  ['children', /^what about (children|kids|babies)( (and|or) infants)?$/],
  ['care', /^(when should (i|we|someone) (see|consult) a doctor|when (to|should i) seek (medical )?(help|care))$/],
  ['definition', /^(what (is|are)|explain|tell me about)\b/],
];
export function classifyHealthQuestion(query: string): FollowUpKind | undefined {
  return forms.find(([,pattern]) => pattern.test(query))?.[0];
}

/** Multiple requested facets are not silently answered by just the first one. */
export function hasCompetingQuestionIntents(query: string): boolean {
  if (!/\b(and|or)\b/.test(query)) return false;
  const markers = [/\bcauses?\b/,/\b(signs|symptoms)\b/,/\bbenefits?\b/,/\b(nutrients?|vitamins?|minerals?)\b/,/\bhow often\b/,/\bhow long\b/,/\b(safety|safe)\b/,/\b(limitations|downsides)\b/,/\balternatives?\b/];
  return markers.filter(pattern => pattern.test(query)).length > 1;
}

/** Only complete, bounded pronoun/ellipsis forms may use session context. */
export function isIntentOnlyFollowUp(query: string): boolean {
  return /^(how many hours|how much sleep|how long|how often|how often should (i|we) eat (it|them)|is (it|that) safe|are they safe|are there (any )?healthier alternatives|what are (the )?(signs|symptoms)|what are (the )?(signs|symptoms) of (it|that)|what is (it|that))$/.test(query);
}

import { HEALTH_KNOWLEDGE_BASE, type HealthKnowledgeEntry, type FollowUpKind } from '../knowledge/healthKnowledgeBase';

export function normalizeHealthText(query: string): string {
  return query.normalize('NFKC').toLowerCase().replace(/[\u2019']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
// Exact, audited substitutions only: no edit-distance search, stemming, learned
// synonyms or correction of unknown words. Safety checks inspect both versions.
const SPELLINGS: Readonly<Record<string, string>> = {
  maleria:'malaria', malairia:'malaria', diabetis:'diabetes', diabtes:'diabetes',
  hypertention:'hypertension', hypertensoin:'hypertension', anxety:'anxiety',
  anxiery:'anxiety', diahorrea:'diarrhoea', diarhoea:'diarrhoea',
  headace:'headache', headach:'headache', vaccintion:'vaccination',
  brething:'breathing', breathng:'breathing', dosge:'dosage',
  paracetemol:'paracetamol', antibiotcs:'antibiotics', medicaton:'medication',
};
const PHRASES: readonly [RegExp, string][] = [
  [/\bhigh bp\b/g,'high blood pressure'], [/\bsugar disease\b/g,'diabetes'],
  [/\braised blood pressure\b/g,'high blood pressure'],
  [/\bclean(ing)? (my|your) hands\b/g,'wash my hands'],
  [/\bhand washing\b/g,'handwashing'], [/\bbreast feeding\b/g,'breastfeeding'],
  [/\brunny stools?\b/g,'loose stools'], [/\btummy runs\b/g,'diarrhoea'],
  [/\bfeeling worried\b/g,'anxiety'], [/\bdifficulty sleeping\b/g,'sleep'],
  [/\btrouble sleeping\b/g,'sleep'], [/\bcannot catch (my|your|his|her) breath\b/g,'cannot breathe'],
  [/\bcan t catch (my|your|his|her) breath\b/g,'cannot breathe'],
];
export function canonicalHealthText(normalized: string): string {
  let text = normalized.split(' ').map(word => SPELLINGS[word] ?? word).join(' ');
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text;
}
const STOP_WORDS = new Set('a an the is are what why how when can could should i my me you your it this that about tell explain information general on of for to and or in with please some tips help understand do does part simple words'.split(' '));
const words = (text: string) => new Set(text.split(' ').filter(word => word && !STOP_WORDS.has(word)));
const contains = (query: string, phrase: string) => ` ${query} `.includes(` ${phrase} `);
export type RankedKnowledge = {entry: HealthKnowledgeEntry; score: number; coverage: number};
export type KnowledgeSelection = {kind:'match'; entry:HealthKnowledgeEntry} |
  {kind:'clarify'; labels:readonly string[]} | {kind:'none'};

export function rankHealthKnowledge(query: string, medicationId?: string,
  entries: readonly HealthKnowledgeEntry[] = HEALTH_KNOWLEDGE_BASE): RankedKnowledge[] {
  const meaningful = words(query);
  return entries.flatMap(entry => {
    // Medication education must pass the original, uncorrected full-question allowlist.
    if (entry.category === 'medication_guidance' && entry.id !== medicationId) return [];
    const {phrases, keywords, priority} = entry.matching;
    const matchedPhrases = phrases.filter(phrase => contains(query, phrase));
    const matchedKeywords = keywords.filter(keyword => contains(query, keyword));
    const regexEvidence = entry.patterns.flatMap(pattern => query.match(pattern)?.[0] ?? []);
    const regexMatch = regexEvidence.length > 0;
    if (!regexMatch && !matchedPhrases.length && !matchedKeywords.length) return [];
    const evidence = words([...matchedPhrases, ...matchedKeywords, ...regexEvidence].join(' '));
    const coverage = meaningful.size ? [...meaningful].filter(word => evidence.has(word)).length / meaningful.size : 0;
    const specificity = Math.max(0, ...matchedPhrases.map(phrase => phrase.split(' ').length));
    const score = 6 + priority + specificity * 4 + Math.min(matchedKeywords.length, 3) * 3 + Math.round(coverage * 8);
    return [{entry, score, coverage}];
  }).sort((a,b) => b.score-a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
}

export function selectHealthKnowledge(query: string, medicationId?: string): KnowledgeSelection {
  // "Nursing" can mean feeding or care. A generic baby match must not resolve
  // that ambiguity. Explicit breastfeeding terminology may identify the topic.
  if (/\bnursing\b/.test(query) && !/\b(breastfeed\w*|breast milk)\b/.test(query)) {
    return {kind:'clarify',labels:[]};
  }
  const ranked = rankHealthKnowledge(query, medicationId);
  const superseded = new Set(ranked.flatMap(item => item.entry.matching.supersedes ?? []));
  const candidates = ranked.filter(item => !superseded.has(item.entry.id));
  if (!candidates.length) {
    // These words have multiple possible health meanings; never map them alone.
    return /\b(pressure|sugar|nursing|health|sick|unwell)\b/.test(query)
      ? {kind:'clarify',labels:[]} : {kind:'none'};
  }
  const top = candidates[0];
  const clauses = query.split(/\b(?:and|or|but|versus|vs|compare)\b/).map(part => part.trim()).filter(Boolean);
  const unsupportedClause = clauses.length > 1 && clauses.some(part =>
    words(part).size > 0 && rankHealthKnowledge(part, medicationId).length === 0);
  // Independent supported topics are not merged, regardless of score. Sparse
  // evidence and near ties also require clarification rather than forced advice.
  if (unsupportedClause || candidates.length > 1 || top.score < 10 || (top.coverage < 0.15 && top.score < 18)) {
    return {kind:'clarify',labels:candidates.slice(0,3).map(item => item.entry.matching.label)};
  }
  return {kind:'match',entry:top.entry};
}

/** Recognize only bounded, supported question forms, not arbitrary pronouns. */
export function followUpKind(query: string): FollowUpKind | undefined {
  if (/^(what causes?|what is the cause of)\b/.test(query)) return 'causes';
  if (/^(how (can|do) (i|we|you) prevent|how to prevent|how can it be prevented|prevention of)\b/.test(query)) return 'prevention';
  if (/^what about (children|kids|babies)( (and|or) infants)?$/.test(query)) return 'children';
  if (/^(when should (i|we|someone) (see|consult) a doctor|when (to|should i) seek (medical )?(help|care))$/.test(query)) return 'care';
  return undefined;
}
export function isReferentialFollowUp(query: string): boolean {
  return /^(what causes? (it|that)|what is the cause of (it|that)|how (can|do) (i|we|you) prevent (it|that)|how to prevent (it|that)|how can it be prevented|what about (children|kids|babies))$/.test(query) || followUpKind(query) === 'care';
}

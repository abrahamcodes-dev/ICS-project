import { KNOWLEDGE_BASE } from "./knowledgeBase";

// Pure matching logic; importing it does not initialize Firebase.
export function findMatchingRule(query: string) {
  const normalized = query.toLowerCase();
  return KNOWLEDGE_BASE.find((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );
}

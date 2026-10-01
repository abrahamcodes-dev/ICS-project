import { findMatchingRule } from "../src/chatbot/findMatchingRule";

describe("chatbot rule matching", () => {
  it("matches a fever-related query", () => {
    const rule = findMatchingRule("I have a fever since yesterday");
    expect(rule?.id).toBe("fever_001");
  });

  it("matches regardless of case", () => {
    const rule = findMatchingRule("FEVER and chills");
    expect(rule?.id).toBe("fever_001");
  });

  it("returns undefined when nothing matches", () => {
    const rule = findMatchingRule("what is the weather like today");
    expect(rule).toBeUndefined();
  });
});

import { isValidEmail, isNonEmpty } from "../src/utils/validators";

describe("validators", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("patient@example.com")).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("flags empty strings as not non-empty", () => {
    expect(isNonEmpty("   ")).toBe(false);
  });
});

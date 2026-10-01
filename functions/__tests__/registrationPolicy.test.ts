import { planRegistration, RegistrationPolicyError, MAX_FULL_NAME_LENGTH } from "../src/auth/registrationPolicy";

const context = { uid: "trusted-uid", email: "verified-source@example.test", timestamp: "2026-09-30T12:00:00.000Z" };
const patient = { role: "patient", fullName: "  Amina O’Neil  " };
const doctor = { role: "doctor", fullName: "Dr Amina" };
const identity = () => planRegistration(context, patient).identity;

function rejects(run: () => unknown, code: RegistrationPolicyError["code"]) {
  try { run(); throw new Error("Expected rejection"); }
  catch (error) {
    expect(error).toBeInstanceOf(RegistrationPolicyError);
    expect((error as RegistrationPolicyError).code).toBe(code);
  }
}

test("creates patient using trusted identity and timestamps, normalizing only surrounding name whitespace", () => {
  expect(planRegistration(context, patient)).toEqual({ action: "create", identity: {
    uid: context.uid, email: context.email, fullName: "Amina O’Neil", role: "patient",
    status: "active", createdAt: context.timestamp, updatedAt: context.timestamp, schemaVersion: 1,
  } });
});
test("creates doctor safely as pending", () => {
  expect(planRegistration(context, doctor).identity).toEqual({
    ...identity(), fullName: "Dr Amina", role: "doctor", verificationStatus: "pending",
  });
});
test.each(["administrator", "admin", "unknown", "Doctor", " doctor", "", undefined, null, 4, true, [], {}])("rejects role %p", role => {
  rejects(() => planRegistration(context, { ...patient, role }), "invalid-request");
});
test("rejects absent role", () => rejects(() => planRegistration(context, { fullName: "Name" }), "invalid-request"));
test.each([undefined, null, 12, {}, [], "", " \t\n ", "a".repeat(MAX_FULL_NAME_LENGTH + 1)])("rejects name %p", fullName => {
  rejects(() => planRegistration(context, { ...patient, fullName }), "invalid-request");
});
test("rejects absent name", () => rejects(() => planRegistration(context, { role: "patient" }), "invalid-request"));
test("allows maximum length and culturally unrestricted names", () => {
  expect(planRegistration(context, { ...patient, fullName: "名".repeat(200) }).identity.fullName).toHaveLength(200);
});
test.each(["uid", "email", "status", "verificationStatus", "createdAt", "updatedAt", "schemaVersion", "admin", "administrator", "credentials", "extra"])("rejects injected field %s instead of trusting it", field => {
  rejects(() => planRegistration(context, { ...doctor, [field]: "attacker-value" }), "invalid-request");
});
test.each([null, undefined, [], "patient", 1])("rejects malformed request %p", input => {
  rejects(() => planRegistration(context, input), "invalid-request");
});
test("same-role retry preserves every stored field without mutation", () => {
  const existing = Object.freeze(identity());
  const result = planRegistration({ ...context, timestamp: "2026-10-01T12:00:00.000Z" }, { ...patient, fullName: "Changed" }, existing);
  expect(result).toEqual({ action: "existing", identity: existing });
  expect(result.identity).not.toBe(existing);
});
test.each(["pending", "approved", "rejected"])("doctor retry preserves stored verification %s", verificationStatus => {
  const existing = { ...planRegistration(context, doctor).identity, verificationStatus };
  expect(planRegistration(context, doctor, existing)).toEqual({ action: "existing", identity: existing });
});
test("different role cannot overwrite existing identity", () => rejects(() => planRegistration(context, doctor, identity()), "role-conflict"));
test("administrator cannot be modified by public registration", () => {
  rejects(() => planRegistration(context, patient, { ...identity(), role: "administrator" }), "administrator-protected");
});
test("disabled identity cannot be reactivated", () => {
  rejects(() => planRegistration(context, patient, { ...identity(), status: "disabled" }), "account-disabled");
});
test.each([
  {}, [], "identity", { ...identity(), uid: "someone-else" },
  { ...identity(), role: "admin" }, { ...identity(), status: "unknown" },
  { ...identity(), schemaVersion: 2 }, { ...identity(), email: "" },
  { ...identity(), fullName: " " }, { ...identity(), createdAt: "yesterday" },
  { ...identity(), updatedAt: "2020-01-01T00:00:00.000Z" },
  { ...identity(), verificationStatus: "approved" },
  { ...identity(), role: "doctor" },
  { ...identity(), role: "doctor", verificationStatus: "unknown" },
  { ...identity(), unexpected: true },
])("malformed existing record fails closed (%#)", existing => {
  rejects(() => planRegistration(context, patient, existing), "invalid-existing-identity");
});
test.each(["uid", "email", "timestamp"])("invalid trusted %s is rejected", field => {
  rejects(() => planRegistration({ ...context, [field]: "" }, patient), "invalid-trusted-context");
});

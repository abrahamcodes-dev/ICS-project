import { HttpsError } from "firebase-functions/v2/https";

const mockGetUser = jest.fn();
const mockDoc = jest.fn((uid: string) => `users/${uid}`);
const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockRunTransaction = jest.fn();
jest.mock("firebase-admin/auth", () => ({ getAuth: () => ({ getUser: mockGetUser }) }));
jest.mock("../src/shared/firestoreRefs", () => ({
  usersCol: { doc: (uid: string) => mockDoc(uid) },
  db: { runTransaction: (callback: unknown) => mockRunTransaction(callback) },
}));
// Exercise the production handler and transaction adapter without an HTTP server.
jest.mock("firebase-functions/v2/https", () => ({
  ...jest.requireActual("firebase-functions/v2/https"),
  onCall: (handler: unknown) => handler,
}));
import { completeRegistration } from "../src/auth/completeRegistration";
import { createRegistrationHandler } from "../src/auth/registrationHandler";
const call = completeRegistration as unknown as ReturnType<typeof createRegistrationHandler>;
const request = (data: unknown = { role: "patient", fullName: " Amina " }) => ({ auth: { uid: "auth-uid" }, data });
const stored = () => ({ uid: "auth-uid", email: "original@example.test", fullName: "Original", role: "patient", status: "active", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z", schemaVersion: 1 });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ uid: "auth-uid", email: "authoritative@example.test", disabled: false });
  mockGet.mockResolvedValue({ exists: false });
  mockRunTransaction.mockImplementation(async callback => callback({ get: mockGet, create: mockCreate }));
});

test("unauthenticated request is rejected before infrastructure access", async () => {
  await expect(call({ data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRunTransaction).not.toHaveBeenCalled();
});
test.each(["patient", "doctor"])("creates %s using authenticated UID, Admin email and consistent ISO timestamps", async role => {
  const result = await call(request({ role, fullName: " Amina " }));
  expect(mockGetUser).toHaveBeenCalledWith("auth-uid");
  expect(mockDoc).toHaveBeenCalledWith("auth-uid");
  expect(mockGet).toHaveBeenCalledWith("users/auth-uid");
  expect(mockCreate).toHaveBeenCalledWith("users/auth-uid", result);
  expect(result).toMatchObject({ uid: "auth-uid", email: "authoritative@example.test", fullName: "Amina", role, status: "active", schemaVersion: 1 });
  expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
  expect(result.updatedAt).toBe(result.createdAt);
  if (role === "doctor") expect(result).toHaveProperty("verificationStatus", "pending");
  else expect(result).not.toHaveProperty("verificationStatus");
});
test.each(["uid", "email", "verificationStatus", "status"])("rejects spoofed %s", async field => {
  await expect(call(request({ role: "doctor", fullName: "Name", [field]: "spoof" }))).rejects.toMatchObject({ code: "invalid-argument" });
  expect(mockRunTransaction).not.toHaveBeenCalled();
});
test.each(["administrator", "admin", "unknown", null, 12, {}, undefined])("rejects role %p", async role => {
  await expect(call(request({ role, fullName: "Name" }))).rejects.toMatchObject({ code: "invalid-argument" });
});
test.each([undefined, null, 12, "", "  ", "a".repeat(201)])("rejects name %p", async fullName => {
  await expect(call(request({ role: "patient", fullName }))).rejects.toMatchObject({ code: "invalid-argument" });
});
test.each([undefined, "", "  ", "not-email"])("rejects unusable Auth email %p", async email => {
  mockGetUser.mockResolvedValue({ uid: "auth-uid", email, disabled: false });
  await expect(call(request())).rejects.toMatchObject({ code: "failed-precondition" });
  expect(mockRunTransaction).not.toHaveBeenCalled();
});
test("disabled Auth account is denied", async () => {
  mockGetUser.mockResolvedValue({ uid: "auth-uid", email: "a@example.test", disabled: true });
  await expect(call(request())).rejects.toMatchObject({ code: "permission-denied" });
});
test("same-role retry preserves stored data with no write", async () => {
  const existing = Object.freeze(stored());
  mockGet.mockResolvedValue({ exists: true, data: () => existing });
  await expect(call(request())).resolves.toEqual(existing);
  expect(mockCreate).not.toHaveBeenCalled();
});
test.each([
  [{ ...stored(), role: "doctor", verificationStatus: "pending" }, "failed-precondition"],
  [{ ...stored(), role: "administrator" }, "permission-denied"],
  [{ ...stored(), status: "disabled" }, "permission-denied"],
  [{}, "failed-precondition"],
  [undefined, "failed-precondition"],
])("existing record rejection (%#)", async (existing, code) => {
  mockGet.mockResolvedValue({ exists: true, data: () => existing });
  await expect(call(request())).rejects.toMatchObject({ code });
  expect(mockCreate).not.toHaveBeenCalled();
});
test.each(["auth", "read", "commit"])("sanitizes %s infrastructure errors", async source => {
  const error = new HttpsError("permission-denied", "PRIVATE database details");
  if (source === "auth") mockGetUser.mockRejectedValue(error);
  if (source === "read") mockGet.mockRejectedValue(error);
  if (source === "commit") mockRunTransaction.mockRejectedValue(error);
  await expect(call(request())).rejects.toMatchObject({ code: "internal", message: "Registration could not be completed. Please retry later." });
});
test("transaction retry rereads a competing identity and does not overwrite it", async () => {
  const winner = { ...stored(), fullName: "Concurrent winner" };
  mockRunTransaction.mockImplementation(async callback => {
    // First attempt loses its commit; Firestore re-executes the callback.
    await callback({ get: async () => ({ exists: false }), create: jest.fn() });
    return callback({ get: async () => ({ exists: true, data: () => winner }), create: mockCreate });
  });
  await expect(call(request())).resolves.toEqual(winner);
  expect(mockCreate).not.toHaveBeenCalled();
});
test("different-role concurrent winner causes rejection on transaction retry", async () => {
  mockRunTransaction.mockImplementation(async callback => {
    await callback({ get: async () => ({ exists: false }), create: jest.fn() });
    return callback({ get: async () => ({ exists: true, data: () => ({ ...stored(), role: "doctor", verificationStatus: "pending" }) }), create: mockCreate });
  });
  await expect(call(request())).rejects.toMatchObject({ code: "failed-precondition" });
  expect(mockCreate).not.toHaveBeenCalled();
});

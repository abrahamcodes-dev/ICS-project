jest.mock("../src/services/firebaseConfig", () => ({ auth: { currentUser: null }, db: {}, app: {} }));
jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(), signInWithEmailAndPassword: jest.fn(), signOut: jest.fn(),
}));
jest.mock("firebase/functions", () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn() }));
jest.mock("firebase/firestore", () => ({ doc: jest.fn((_db, _collection, uid) => uid), getDoc: jest.fn(), setDoc: jest.fn() }));

import { auth } from "../src/services/firebaseConfig";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getDoc, setDoc, doc } from "firebase/firestore";
import { registerUser, completeUserRegistration, logoutUser, onIdentityRefresh } from "../src/services/authService";
import { loadOwnIdentity } from "../src/services/identityService";
const mockIdentity = { uid: "u1", email: "test@example.test", fullName: "Test", role: "patient", status: "active",
  schemaVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
const mockCallable = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = null;
  createUserWithEmailAndPassword.mockImplementation(async () => {
    auth.currentUser = { uid: "u1" };
    return { user: auth.currentUser };
  });
  httpsCallable.mockReturnValue(mockCallable);
  mockCallable.mockResolvedValue({ data: mockIdentity });
  getDoc.mockResolvedValue({ exists: () => true, data: () => mockIdentity });
  signOut.mockImplementation(async () => { auth.currentUser = null; });
});
test.each(["patient", "doctor"])("%s registration calls Auth then callable and reads identity", async role => {
  const identity = { ...mockIdentity, role, ...(role === "doctor" ? { verificationStatus: "pending" } : {}) };
  mockCallable.mockImplementation(async () => {
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(auth.currentUser.uid).toBe("u1");
    return { data: identity };
  });
  getDoc.mockResolvedValue({ exists: () => true, data: () => identity });
  await expect(registerUser("test@example.test", "password", " Test ", role)).resolves.toEqual(identity);
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "completeRegistration");
  expect(mockCallable).toHaveBeenCalledWith({ role, fullName: "Test" });
  expect(doc).toHaveBeenCalledWith(expect.anything(), "users", "u1");
  expect(setDoc).not.toHaveBeenCalled();
});
test.each(["administrator", "admin", "unknown"])("%s public role rejected before Auth", async role => {
  await expect(registerUser("test@example.test", "password", "Test", role)).rejects.toThrow();
  expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
});
test("failure preserves Auth and retry does not recreate it", async () => {
  mockCallable.mockRejectedValueOnce(new Error("offline"));
  await expect(registerUser("test@example.test", "password", "Test", "patient")).rejects.toMatchObject({ code: "registration-incomplete" });
  expect(auth.currentUser.uid).toBe("u1");
  expect(signOut).not.toHaveBeenCalled();
  mockCallable.mockResolvedValue({ data: mockIdentity });
  await expect(completeUserRegistration("Test", "patient")).resolves.toEqual(mockIdentity);
  expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
  expect(setDoc).not.toHaveBeenCalled();
});
test("existing signed-in user must use completion", async () => {
  auth.currentUser = { uid: "u1" };
  await expect(registerUser("test@example.test", "password", "Test", "patient")).rejects.toThrow("Already signed in");
  expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
});
test("signed-out completion rejected", async () => {
  await expect(completeUserRegistration("Test", "patient")).rejects.toThrow("Sign in");
  expect(mockCallable).not.toHaveBeenCalled();
});
test("missing identity after callable remains recoverable", async () => {
  getDoc.mockResolvedValue({ exists: () => false });
  await expect(registerUser("test@example.test", "password", "Test", "patient")).rejects.toMatchObject({ code: "registration-incomplete" });
  expect(auth.currentUser.uid).toBe("u1");
});
test("malformed callable response rejected", async () => {
  mockCallable.mockResolvedValue({ data: { ...mockIdentity, role: "admin" } });
  await expect(registerUser("test@example.test", "password", "Test", "patient")).rejects.toMatchObject({ code: "registration-incomplete" });
});
test("identity reads never target another user", async () => {
  auth.currentUser = { uid: "u1" };
  await expect(loadOwnIdentity("other")).rejects.toThrow();
  expect(getDoc).not.toHaveBeenCalled();
});
test("missing identity differs from read failure", async () => {
  auth.currentUser = { uid: "u1" };
  getDoc.mockResolvedValueOnce({ exists: () => false });
  await expect(loadOwnIdentity("u1")).resolves.toBeNull();
  getDoc.mockRejectedValueOnce(new Error("offline"));
  await expect(loadOwnIdentity("u1")).rejects.toThrow("offline");
});
test("logout signs out and requests state refresh", async () => {
  auth.currentUser = { uid: "u1" };
  const listener = jest.fn();
  const stop = onIdentityRefresh(listener);
  await logoutUser();
  expect(auth.currentUser).toBeNull();
  expect(signOut).toHaveBeenCalledWith(auth);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
});

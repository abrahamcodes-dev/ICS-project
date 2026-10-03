import { readFileSync } from "fs";
import { resolve } from "path";
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Firestore, Timestamp as AdminTimestamp, CollectionReference } from "firebase-admin/firestore";
import type { DoctorProfile } from "../../../shared/types/profiles";
import { createDoctorDraftHandler } from "../../src/profiles/doctorDraftHandler";
import { createDoctorDraftStore } from "../../src/profiles/doctorDraftStore";

let env: RulesTestEnvironment;
let admin: Firestore;
const identity = (extra = {}) => ({ uid: "owner", email: "doctor@example.test", fullName: "Doctor", role: "doctor",
  status: "active", verificationStatus: "pending", schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra });
const profile = (extra = {}) => ({ uid: "owner", revision: 1, activeRequestId: null, approvedRequestId: null,
  schemaVersion: 1, createdAt: Timestamp.fromMillis(1700000000000), updatedAt: Timestamp.fromMillis(1700000000000), ...extra });
const client = (uid = "owner") => env.authenticatedContext(uid).firestore();
const ref = () => doc(client(), "doctorProfiles/owner");
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), path), data); });
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085") throw new Error("Requires local demo emulator.");
  env = await initializeTestEnvironment({ projectId: "demo-calladoc-rules", firestore: { host: "127.0.0.1", port: 8085,
    rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8") } });
  admin = new Firestore({ projectId: "demo-calladoc-rules", host: "127.0.0.1:8085", ssl: false });
});
beforeEach(async () => { await env.clearFirestore(); await seed("users/owner", identity()); });
afterAll(async () => { if (env) await env.cleanup(); if (admin) await admin.terminate(); });

test.each(["pending", "rejected", "approved"])("active %s doctor reads own valid profile", async verificationStatus => {
  await seed("users/owner", identity({ verificationStatus })); await seed("doctorProfiles/owner", profile());
  await assertSucceeds(getDoc(ref()));
});
test("cross-doctor and guest access denied", async () => {
  await seed("users/other", identity({ uid: "other" })); await seed("doctorProfiles/owner", profile());
  for (const db of [client("other"), env.unauthenticatedContext().firestore()])
    await assertFails(getDoc(doc(db, "doctorProfiles/owner")));
});
test.each(["patient", "administrator", "admin", "unknown"])("%s has no private doctor access", async role => {
  const { verificationStatus, ...user } = identity({ role }); await seed("users/owner", user);
  await seed("doctorProfiles/owner", profile()); await assertFails(getDoc(ref()));
});
test.each([null, {}, identity({ status: "disabled" }), identity({ uid: "wrong" }), identity({ fullName: "\u00a0Doctor" }),
  identity({ verificationStatus: "other" }), identity({ createdAt: "2026-02-30T00:00:00.000Z" }), identity({ schemaVersion: 2 })])
  ("missing/malformed/disabled identity %# denied", async user => {
    await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), "users/owner")); });
    if (user) await seed("users/owner", user);
    await seed("doctorProfiles/owner", profile()); await assertFails(getDoc(ref()));
  });
test("owner cannot create/update/delete or list", async () => {
  await assertFails(setDoc(ref(), profile())); await seed("doctorProfiles/owner", profile());
  await assertFails(updateDoc(ref(), { specialty: "Surgery" })); await assertFails(deleteDoc(ref()));
  await assertFails(getDocs(collection(client(), "doctorProfiles")));
});
test.each([{ uid: "wrong" }, { revision: 0 }, { revision: 1.5 }, { unknown: true }, { schemaVersion: 2 },
  { createdAt: { seconds: 1, nanoseconds: 0 } }, { specialty: "x".repeat(121) }, { activeRequestId: "request" },
  { approvedRequestId: "../request" }])("malformed private profile %# cannot be read", async extra => {
  await seed("doctorProfiles/owner", profile(extra)); await assertFails(getDoc(ref()));
});
test.each(["doctorPublicProfiles", "doctorCredentials", "verificationRequests", "verificationAudits"])
  ("later %s remains closed", async name => {
    await seed(name + "/owner", { uid: "owner" });
    await assertFails(getDoc(doc(client(), name + "/owner")));
    await assertFails(setDoc(doc(client(), name + "/owner"), { uid: "owner" }));
  });

function backend() {
  return createDoctorDraftHandler(createDoctorDraftStore(admin,
    admin.collection("doctorProfiles") as CollectionReference<DoctorProfile>));
}
test("real transaction creates trusted Timestamps and retry is a no-op", async () => {
  const save = backend(); const request = { auth: { uid: "owner" }, data: { specialty: " Medicine " } };
  expect(await save(request)).toEqual({ revision: 1, changed: true });
  expect(await save(request)).toEqual({ revision: 1, changed: false });
  const data = (await admin.doc("doctorProfiles/owner").get()).data()!;
  expect(data.createdAt).toBeInstanceOf(AdminTimestamp); expect(data.updatedAt).toBeInstanceOf(AdminTimestamp);
  await assertSucceeds(getDoc(ref()));
});
test("concurrent identical creates produce one revision", async () => {
  const save = backend(); const request = { auth: { uid: "owner" }, data: { specialty: "Medicine" } };
  const results = await Promise.all([save(request), save(request)]);
  expect(results.map(result => result.changed).sort()).toEqual([false, true]);
  expect((await admin.doc("doctorProfiles/owner").get()).data()?.revision).toBe(1);
});
test("concurrent distinct edits serialize without lost revision increments", async () => {
  const save = backend(); await save({ auth: { uid: "owner" }, data: {} });
  const results = await Promise.all(["Medicine", "Surgery"].map(specialty => save({ auth: { uid: "owner" }, data: { specialty } })));
  expect(results.map(result => result.revision).sort()).toEqual([2, 3]);
});
test("stored timestamp maps fail closed without mutation", async () => {
  await seed("doctorProfiles/owner", profile({ createdAt: { seconds: 1, nanoseconds: 0 } }));
  await expect(backend()({ auth: { uid: "owner" }, data: {} })).rejects.toMatchObject({ code: "failed-precondition" });
  expect((await admin.doc("doctorProfiles/owner").get()).data()?.revision).toBe(1);
});
test("transaction exception rolls back a staged write", async () => {
  const store = createDoctorDraftStore(admin, admin.collection("doctorProfiles") as CollectionReference<DoctorProfile>);
  await expect(store.transact("owner", async tx => {
    await tx.readIdentity(); await tx.readProfile();
    tx.writeProfile({ uid: "owner", revision: 1, activeRequestId: null, approvedRequestId: null,
      schemaVersion: 1, createdAt: AdminTimestamp.now(), updatedAt: AdminTimestamp.now() });
    throw new Error("test abort");
  })).rejects.toThrow("test abort");
  expect((await admin.doc("doctorProfiles/owner").get()).exists).toBe(false);
});

test("approved contact persistence preserves trusted creation time, revision and reference", async () => {
  await seed("users/owner", identity({ verificationStatus: "approved" }));
  await seed("doctorProfiles/owner", profile({ professionalName: "Doctor", specialty: "Medicine",
    registrationNumber: "REG-1", issuingAuthority: "Board", approvedRequestId: "approved", phoneNumber: "123" }));
  const save = backend();
  await save({ auth: { uid: "owner" }, data: { phoneNumber: "456" } });
  await save({ auth: { uid: "owner" }, data: {} });
  const data = (await admin.doc("doctorProfiles/owner").get()).data()!;
  expect(data).toMatchObject({ revision: 1, approvedRequestId: "approved", specialty: "Medicine" });
  expect(data).not.toHaveProperty("phoneNumber");
  expect(data.createdAt.toMillis()).toBe(1700000000000);
  expect(data.updatedAt.toMillis()).toBeGreaterThan(data.createdAt.toMillis());
  await assertSucceeds(getDoc(ref()));
});

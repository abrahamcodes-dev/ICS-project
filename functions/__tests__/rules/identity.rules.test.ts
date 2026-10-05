import { readFileSync } from "fs";
import { resolve } from "path";
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const identity = (uid: string, role = "patient", extra = {}) => ({
  uid, email: "test@example.test", fullName: "Test User", role, status: "active",
  schemaVersion: 1, createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z", ...extra,
});
const client = (uid: string) => env.authenticatedContext(uid).firestore();
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), path), data); });
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085") {
    throw new Error("Rules tests require the loopback demo emulator via npm run test:rules.");
  }
  env = await initializeTestEnvironment({
    projectId: "demo-calladoc-rules", firestore: {
      host: "127.0.0.1", port: 8085,
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed("users/owner", identity("owner"));
  await seed("users/other", identity("other"));
  await seed("availabilitySlots/slot", { doctorId: "other", isBooked: false });
});
afterAll(async () => { if (env) await env.cleanup(); });

test("unauthenticated identity read denied", async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/owner")));
});
test("owner can get own identity", async () => { await assertSucceeds(getDoc(doc(client("owner"), "users/owner"))); });
test("other identity read denied", async () => { await assertFails(getDoc(doc(client("owner"), "users/other"))); });
test("user collection listing denied", async () => { await assertFails(getDocs(collection(client("owner"), "users"))); });
test.each(["patient", "doctor", "administrator", "admin"])("direct %s creation denied", async role => {
  await assertFails(setDoc(doc(client("new"), "users/new"), identity("new", role)));
});
test.each([
  { role: "doctor" }, { role: "administrator" }, { role: "admin" }, { status: "disabled" },
  { email: "spoof@example.test" }, { uid: "other" }, { fullName: "Changed" },
  { schemaVersion: 2 }, { createdAt: "spoof" }, { updatedAt: "spoof" },
])("identity update denied (%#)", async update => { await assertFails(updateDoc(doc(client("owner"), "users/owner"), update)); });
test("doctor cannot self-approve", async () => {
  await seed("users/owner", identity("owner", "doctor", { verificationStatus: "pending" }));
  await assertFails(updateDoc(doc(client("owner"), "users/owner"), { verificationStatus: "approved" }));
});
test("delete denied", async () => { await assertFails(deleteDoc(doc(client("owner"), "users/owner"))); });
test("other identity modification denied", async () => { await assertFails(updateDoc(doc(client("owner"), "users/other"), { role: "administrator" })); });
test("administrator clients have no identity bypass", async () => {
  await seed("users/owner", identity("owner", "administrator"));
  await assertFails(getDoc(doc(client("owner"), "users/other")));
  await assertFails(getDocs(collection(client("owner"), "users")));
  await assertFails(updateDoc(doc(client("owner"), "users/owner"), { fullName: "Changed" }));
});
test.each([
  identity("owner", "patient", { fullName: " Leading" }),
  identity("owner", "patient", { fullName: " " }),
  identity("owner", "patient", { updatedAt: "2000-01-01T00:00:00.000Z" }),
  identity("owner", "patient", { schemaVersion: 2 }),
  identity("owner", "patient", { email: "" }),
  identity("owner", "patient", { fullName: 123 }),
  identity("owner", "patient", { createdAt: "not-a-timestamp" }),
  identity("owner", "patient", { extraField: true }),
  identity("owner", "administrator", { verificationStatus: "approved" }),
  null, {}, { uid: "owner", status: "active" }, { uid: "owner", role: "patient" },
  identity("owner", "unknown"), identity("owner", "admin"), identity("wrong"),
  identity("owner", "patient", { status: "disabled" }),
  identity("owner", "doctor"), identity("owner", "doctor", { verificationStatus: "pending" }),
  identity("owner", "doctor", { verificationStatus: "rejected" }),
  identity("owner", "doctor", { verificationStatus: true }),
  identity("owner", "doctor", { verificationStatus: "unknown" }),
])("malformed/unprivileged identity cannot read availability (%#)", async data => {
  await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), "users/owner")); });
  if (data !== null) await seed("users/owner", data);
  await assertFails(getDoc(doc(client("owner"), "availabilitySlots/slot")));
});
test("unauthenticated availability denied", async () => { await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "availabilitySlots/slot"))); });
test.each(["patient", "administrator", "doctor"])("active %s cannot read retired legacy availability", async role => {
  await seed("users/owner", identity("owner", role, role === "doctor" ? { verificationStatus: "approved" } : {}));
  await assertFails(getDoc(doc(client("owner"), "availabilitySlots/slot")));
  await assertFails(updateDoc(doc(client("owner"), "availabilitySlots/slot"), { isBooked: true }));
});
test.each(["appointments", "consultations", "prescriptions", "ratings", "chatbotInteractions", "verification", "unknown"])("later collection %s is closed", async name => {
  await seed(`${name}/record`, { patientId: "owner", doctorId: "owner" });
  await assertFails(getDoc(doc(client("owner"), `${name}/record`)));
  await assertFails(setDoc(doc(client("owner"), `${name}/new`), { patientId: "owner" }));
});

import { Timestamp } from "firebase-admin/firestore";
import { createDoctorDraftHandler, DraftTransaction } from "../src/profiles/doctorDraftHandler";
import type { DoctorProfile } from "../../shared/types/profiles";

const time = new Timestamp(1800000000, 0);
const professional = { professionalName: "Doctor", specialty: "Medicine", registrationNumber: "REG-1", issuingAuthority: "Board" };
const identity = (extra = {}) => ({ uid: "doctor", email: "doctor@example.test", fullName: "Doctor", role: "doctor",
  status: "active", verificationStatus: "pending", schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra });
const profile = (extra = {}): DoctorProfile => ({ uid: "doctor", ...professional, phoneNumber: "123", revision: 3,
  activeRequestId: null, approvedRequestId: null, schemaVersion: 1, createdAt: time, updatedAt: time, ...extra });
function fixture(initial: DoctorProfile | null = null, user: unknown = identity()) {
  let stored = initial;
  const write = jest.fn();
  const handler = createDoctorDraftHandler({ now: () => new Timestamp(time.seconds + 1, 0),
    transact: async (_uid, action) => {
      let staged: DoctorProfile | undefined;
      const result = await action({ readIdentity: async () => user, readProfile: async () => stored,
        writeProfile: data => { staged = data; } });
      if (staged) { stored = staged; write(staged); }
      return result;
    } });
  return { save: (data: unknown = {}, auth: { uid: string } | undefined = { uid: "doctor" }) => handler({ auth, data }),
    handler, write, stored: () => stored };
}

test("unauthenticated is rejected before storage", async () => {
  await expect(fixture().handler({ data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
});
test.each([null, {}, identity({ uid: "other" }), identity({ status: "disabled" }), identity({ role: "patient" }),
  identity({ role: "administrator" }), identity({ role: "admin" }), identity({ role: "unknown" }),
  identity({ schemaVersion: 2 }), identity({ verificationStatus: "unknown" }), identity({ createdAt: "invalid" })])
  ("invalid/non-doctor identity %# denied", async user => {
    const f = fixture(null, user); await expect(f.save()).rejects.toMatchObject({ code: "permission-denied" });
    expect(f.write).not.toHaveBeenCalled();
  });
test("canonical patient and administrator denied", async () => {
  for (const role of ["patient", "administrator"]) {
    const { verificationStatus, ...user } = identity({ role });
    await expect(fixture(null, user).save()).rejects.toMatchObject({ code: "permission-denied" });
  }
});
test("pending doctor creates an incomplete revision 1 with backend timestamps", async () => {
  const f = fixture(); expect(await f.save({ specialty: " Medicine " })).toEqual({ revision: 1, changed: true });
  expect(f.stored()).toEqual({ uid: "doctor", specialty: "Medicine", revision: 1, activeRequestId: null,
    approvedRequestId: null, schemaVersion: 1, createdAt: { seconds: time.seconds + 1, nanoseconds: 0 },
    updatedAt: { seconds: time.seconds + 1, nanoseconds: 0 } });
});
test("replacement edits increment once, clear omissions and preserve creation time", async () => {
  const f = fixture(profile()); await f.save({ specialty: "Surgery" });
  expect(f.stored()).toMatchObject({ specialty: "Surgery", revision: 4,
    createdAt: { seconds: time.seconds, nanoseconds: time.nanoseconds } });
  expect(f.stored()).not.toHaveProperty("professionalName"); expect(f.stored()).not.toHaveProperty("phoneNumber");
});
test("identical normalized retry is a no-op", async () => {
  const f = fixture(); await f.save({ specialty: "Medicine" });
  expect(await f.save({ specialty: " Medicine " })).toEqual({ revision: 1, changed: false });
  expect(f.write).toHaveBeenCalledTimes(1);
});
test.each(["uid", "role", "verificationStatus", "revision", "expectedRevision", "activeRequestId", "approvedRequestId",
  "schemaVersion", "createdAt", "updatedAt", "approvedRevision", "reviewerUid", "state", "credentials", "unknown"])
  ("client cannot supply %s", async key => {
    const f = fixture(); await expect(f.save({ [key]: "spoof" })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.write).not.toHaveBeenCalled();
  });
test.each([null, [], { phoneNumber: "bad" }, { specialty: "x".repeat(121) }, { professionalName: "" }])
  ("invalid public input %#", async data => {
    await expect(fixture().save(data)).rejects.toMatchObject({ code: "invalid-argument" });
  });
test("submitted draft locks both professional and contact saves, including retries", async () => {
  const f = fixture(profile({ activeRequestId: "request" }));
  for (const data of [{ specialty: "Surgery" }, { ...professional, phoneNumber: "123" }])
    await expect(f.save(data)).rejects.toMatchObject({ code: "failed-precondition" });
  expect(f.write).not.toHaveBeenCalled();
});
test("rejected doctor edits eligible existing draft", async () => {
  const f = fixture(profile(), identity({ verificationStatus: "rejected" }));
  await f.save(professional); expect(f.stored()?.revision).toBe(4);
});
test.each(["approved", "rejected"])("missing %s profile fails closed under 3B policy", async verificationStatus => {
  await expect(fixture(null, identity({ verificationStatus })).save()).rejects.toMatchObject({ code: "failed-precondition" });
});
test.each(Object.keys(professional))("approved doctor cannot change %s", async key => {
  const f = fixture(profile({ approvedRequestId: "approved" }), identity({ verificationStatus: "approved" }));
  await expect(f.save({ [key]: "Changed" })).rejects.toMatchObject({ code: "failed-precondition" });
  expect(f.write).not.toHaveBeenCalled();
});
test("approved phone update/removal preserves professional revision and history", async () => {
  const f = fixture(profile({ approvedRequestId: "approved" }), identity({ verificationStatus: "approved" }));
  await f.save({ phoneNumber: "456" });
  expect(f.stored()).toMatchObject({ ...professional, phoneNumber: "456", revision: 3, approvedRequestId: "approved" });
  await f.save({}); expect(f.stored()).not.toHaveProperty("phoneNumber");
  expect(f.stored()).toMatchObject({ ...professional, revision: 3, approvedRequestId: "approved" });
});
test.each([{ uid: "other" }, { revision: 0 }, { unknown: true }, { createdAt: "invalid" },
  { professionalName: " Untrimmed" }, { approvedRequestId: "unexpected" }, { revision: Number.MAX_SAFE_INTEGER }])
  ("malformed/conflicting profile %# denied", async extra => {
    const f = fixture(profile(extra)); await expect(f.save({})).rejects.toBeDefined(); expect(f.write).not.toHaveBeenCalled();
  });
test("transaction retry recomputes revision from the winning stored state", async () => {
  const writes: DoctorProfile[] = [];
  const handler = createDoctorDraftHandler({ now: () => time, transact: async (_uid, action) => {
    for (const revision of [3, 4]) {
      const result = await action({ readIdentity: async () => identity(), readProfile: async () => profile({ revision }),
        writeProfile: data => writes.push(data) });
      if (revision === 4) return result;
    }
    throw new Error("unreachable");
  } });
  expect(await handler({ auth: { uid: "doctor" }, data: { specialty: "Surgery" } })).toMatchObject({ revision: 5 });
  expect(writes.map(data => data.revision)).toEqual([4, 5]); // First attempt is discarded by Firestore.
});
test.each(["disabled", "approved", "submitted"])("retry rechecks %s state before writing", async state => {
  const handler = createDoctorDraftHandler({ now: () => time, transact: async (_uid, action) => {
    const attempt: DraftTransaction = { readIdentity: async () => identity(), readProfile: async () => profile(), writeProfile: () => {} };
    await action(attempt); // simulated conflict: discard attempt, reread changed state
    attempt.readIdentity = async () => identity(state === "disabled" ? { status: "disabled" }
      : state === "approved" ? { verificationStatus: "approved" } : {});
    attempt.readProfile = async () => profile(state === "submitted" ? { activeRequestId: "submitted" }
      : state === "approved" ? { approvedRequestId: "approved" } : {});
    attempt.writeProfile = () => { throw new Error("must not write"); };
    return action(attempt);
  } });
  await expect(handler({ auth: { uid: "doctor" }, data: { specialty: "Changed" } })).rejects.toMatchObject({
    code: state === "disabled" ? "permission-denied" : "failed-precondition" });
});
test("commit failure returns sanitized error without claiming success", async () => {
  const handler = createDoctorDraftHandler({ now: () => time, transact: async (_uid, action) => {
    await action({ readIdentity: async () => identity(), readProfile: async () => null, writeProfile: () => {} });
    throw new Error("private infrastructure detail");
  } });
  await expect(handler({ auth: { uid: "doctor" }, data: {} })).rejects.toMatchObject({ code: "internal",
    message: "Doctor draft could not be saved. Please retry later." });
});

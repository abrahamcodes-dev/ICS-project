import { createCredentialHandlers, CredentialDependencies, CredentialTransaction } from "../src/profiles/credentialHandlers";
import { fail } from "../src/profiles/domainValidation";
import type { DoctorCredentialRecord } from "../../shared/types/verification";
import { readFileSync } from "fs";
import { resolve } from "path";

const time = { seconds: 1800000000, nanoseconds: 0 };
const user = (extra = {}) => ({ uid: "doctor", email: "doctor@example.test", fullName: "Doctor", role: "doctor", status: "active",
  verificationStatus: "pending", schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra });
const draft = (extra = {}) => ({ uid: "doctor", revision: 1, activeRequestId: null, approvedRequestId: null,
  schemaVersion: 1 as const, createdAt: time, updatedAt: time, ...extra });
const input = { category: "medical_license", contentType: "application/pdf", sizeBytes: 3 };
function fixture() {
  let record: DoctorCredentialRecord | null = null;
  const state = { identity: user() as unknown, profile: null as ReturnType<typeof draft> | null, now: time,
    observed: { generation: "12345678901234567", checksum: "a".repeat(64), sizeBytes: 3, contentType: "application/pdf" } };
  const inspect = jest.fn(async () => state.observed);
  const assertUnchanged = jest.fn(async () => {});
  const deps: CredentialDependencies = { now: () => state.now, newId: () => "backend-id", inspect, assertUnchanged,
    transact: async (_uid, _id, action) => {
      let staged: DoctorCredentialRecord | undefined;
      const result = await action({ identity: async () => state.identity, profile: async () => state.profile,
        credential: async () => record, create: data => { staged = data; }, replace: data => { staged = data; } });
      if (staged) record = staged; return result;
    } };
  const handlers = createCredentialHandlers(deps);
  return { ...handlers, state, deps, inspect, assertUnchanged, stored: () => record,
    alter: (extra: Record<string, unknown>) => { record = { ...record!, ...extra }; },
    prepare: (data: unknown = input) => handlers.prepare({ auth: { uid: "doctor" }, data }),
    finalize: (data: unknown = { credentialId: "backend-id" }) => handlers.finalize({ auth: { uid: "doctor" }, data }) };
}
test.each(["prepare", "finalize"] as const)("%s requires authentication", async method => {
  const f = fixture(); await expect(createCredentialHandlers(f.deps)[method]({ data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
});
test.each([null, {}, user({ uid: "other" }), user({ status: "disabled" }), user({ verificationStatus: "approved" }),
  user({ verificationStatus: "unknown" }), user({ schemaVersion: 2 }), user({ fullName: " invalid" })])
  ("canonical invalid/ineligible identity %# denied for both operations", async identity => {
    const f = fixture(); await f.prepare(); f.state.identity = identity;
    await expect(f.prepare()).rejects.toMatchObject({ code: "permission-denied" });
    await expect(f.finalize()).rejects.toMatchObject({ code: "permission-denied" }); expect(f.inspect).not.toHaveBeenCalled();
  });
test.each(["patient", "administrator", "admin", "unknown"])("%s cannot act as doctor", async role => {
  const f = fixture(); const { verificationStatus, ...identity } = user({ role }); f.state.identity = identity;
  await expect(f.prepare()).rejects.toMatchObject({ code: "permission-denied" });
});
test("prepare owns ID/path, expires in 15 minutes, has no request or observed facts", async () => {
  const f = fixture(); const result = await f.prepare();
  expect(result).toMatchObject({ credentialId: "backend-id", storagePath: "doctorCredentials/doctor/backend-id/document",
    state: "prepared", expiresAt: { seconds: time.seconds + 900, nanoseconds: 0 }, generation: null, checksum: null });
  expect(f.stored()).toMatchObject({ createdAt: time, updatedAt: time, requestId: null });
});
test("rejected doctor with an eligible draft may prepare", async () => {
  const f = fixture(); f.state.identity = user({ verificationStatus: "rejected" }); f.state.profile = draft();
  await expect(f.prepare()).resolves.toMatchObject({ state: "prepared" });
});
test("rejected doctor without draft fails closed", async () => {
  const f = fixture(); f.state.identity = user({ verificationStatus: "rejected" });
  await expect(f.prepare()).rejects.toMatchObject({ code: "failed-precondition" });
});
test.each([{ activeRequestId: "submitted" }, { approvedRequestId: "approved" }, { uid: "other" }, { revision: 0 }])
  ("locked/malformed draft %# denied", async extra => {
    const f = fixture(); f.state.profile = draft(extra); await expect(f.prepare()).rejects.toMatchObject({ code: "failed-precondition" });
  });
test.each([{ category: "other" }, { contentType: "text/plain" }, { sizeBytes: 0 }, { sizeBytes: 5242881 }, { sizeBytes: 1.5 }])
  ("invalid declared facts %# rejected", async extra => { await expect(fixture().prepare({ ...input, ...extra })).rejects.toMatchObject({ code: "invalid-argument" }); });
test.each(["credentialId", "doctorUid", "storagePath", "state", "generation", "checksum", "createdAt", "updatedAt", "expiresAt", "requestId", "originalFilename", "unknown"])
  ("prepare rejects trusted/unknown %s", async key => { await expect(fixture().prepare({ ...input, [key]: "spoof" })).rejects.toMatchObject({ code: "invalid-argument" }); });
test.each(["generation", "checksum", "sizeBytes", "contentType", "doctorUid", "storagePath", "state"])
  ("finalize rejects client-observed %s", async key => { await expect(fixture().finalize({ credentialId: "backend-id", [key]: "spoof" })).rejects.toMatchObject({ code: "invalid-argument" }); });
test("successful finalization and unchanged repeat preserve finalization time", async () => {
  const f = fixture(); await f.prepare(); f.state.now = { ...time, seconds: time.seconds + 1 };
  const first = await f.finalize(); const finalizedTime = f.stored()!.updatedAt;
  f.state.now = { ...time, seconds: time.seconds + 1000 }; // Ready retry is valid after upload expiry.
  expect(await f.finalize()).toEqual(first); expect(f.stored()!.updatedAt).toEqual(finalizedTime);
  expect(first).toMatchObject({ state: "ready", generation: f.state.observed.generation, checksum: "a".repeat(64) });
});
test.each([{ sizeBytes: 4 }, { contentType: "image/jpeg" }, { generation: "invalid" }, { checksum: "not-sha256" }])
  ("object mismatch %# leaves prepared state intact", async extra => {
    const f = fixture(); await f.prepare(); Object.assign(f.state.observed, extra);
    await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.state).toBe("prepared");
  });
test.each([{ doctorUid: "other" }, { storagePath: "wrong" }, { category: "invalid" }, { state: "attached" }, { schemaVersion: 2 }])
  ("malformed/foreign metadata %# denied", async extra => {
    const f = fixture(); await f.prepare(); f.alter(extra);
    await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.inspect).not.toHaveBeenCalled();
  });
test("missing object and expired slot fail without finalizing", async () => {
  const f = fixture(); await f.prepare(); f.inspect.mockImplementation(async () => fail("object-missing"));
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" });
  f.state.now = { ...time, seconds: time.seconds + 900 };
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.state).toBe("prepared");
});
test("changed finalized object fails closed", async () => {
  const f = fixture(); await f.prepare(); await f.finalize(); f.state.observed.generation = "999";
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.generation).not.toBe("999");
});
test("change between inspection and commit fails without partial ready metadata", async () => {
  const f = fixture(); await f.prepare(); f.assertUnchanged.mockImplementation(async () => fail("object-changed"));
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.state).toBe("prepared");
});
test("authorization is rechecked after Storage inspection", async () => {
  const f = fixture(); await f.prepare(); f.inspect.mockImplementation(async () => {
    f.state.identity = user({ status: "disabled" }); return f.state.observed;
  });
  await expect(f.finalize()).rejects.toMatchObject({ code: "permission-denied" }); expect(f.stored()!.state).toBe("prepared");
});
test("prepare ID collision never replaces a slot", async () => {
  const f = fixture(); await f.prepare(); await expect(f.prepare()).rejects.toMatchObject({ code: "failed-precondition" });
  expect(f.stored()!.state).toBe("prepared");
});
test("unexpected storage errors are sanitized", async () => {
  const f = fixture(); await f.prepare(); f.inspect.mockRejectedValue(new Error("private backend detail"));
  await expect(f.finalize()).rejects.toMatchObject({ code: "internal", message: "Credential operation could not be completed. Please retry later." });
});
test("expiry is rechecked after object inspection", async () => {
  const f = fixture(); await f.prepare(); f.inspect.mockImplementation(async () => {
    f.state.now = { ...time, seconds: time.seconds + 900 }; return f.state.observed;
  });
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.state).toBe("prepared");
});
test("declaration changes during inspection fail closed", async () => {
  const f = fixture(); await f.prepare(); f.inspect.mockImplementation(async () => {
    f.alter({ category: "identity_document" }); return f.state.observed;
  });
  await expect(f.finalize()).rejects.toMatchObject({ code: "failed-precondition" }); expect(f.stored()!.state).toBe("prepared");
});
test("prepare transaction retries reuse a single generated ID", async () => {
  const f = fixture(), ids: string[] = [], newId = jest.fn(() => 'one-generated-id');
  const service = createCredentialHandlers({ ...f.deps, newId, transact: async (_uid, id, action) => {
    const tx: CredentialTransaction = { identity: async () => user(), profile: async () => null,
      credential: async () => null, create: record => { ids.push(record.credentialId); }, replace: () => {} };
    await action(tx); return action(tx); // Simulated conflict discards the first attempt.
  } });
  await service.prepare({ auth: { uid: 'doctor' }, data: input });
  expect(newId).toHaveBeenCalledTimes(1); expect(ids).toEqual(['one-generated-id', 'one-generated-id']);
});
test("commit failure cannot return a finalized result", async () => {
  const f = fixture(); await f.prepare(); const transact = f.deps.transact;
  const service = createCredentialHandlers({ ...f.deps, transact: async (uid, id, action) => transact(uid, id, async tx => {
    const result = await action(tx); if (result && (result as {state?:string}).state === 'ready') throw new Error('commit failure');
    return result;
  }) });
  await expect(service.finalize({ auth: { uid: 'doctor' }, data: { credentialId: 'backend-id' } })).rejects.toMatchObject({ code: 'internal' });
  expect(f.stored()!.state).toBe('prepared');
});
test("Storage and Firestore share identical identity/credential validator bodies", () => {
  const rules = ["firestore.rules", "storage.rules"].map(name => readFileSync(resolve(__dirname, "..", name), "utf8"));
  for (const name of ["validIdentity", "patientIdentityStrings", "patientText", "leapYear", "validCalendarDay", "identityCalendar", "doctorReference", "validCredential"]) {
    const bodies = rules.map(source => {
      const start = source.indexOf('  function ' + name + '('), open = source.indexOf('{', start);
      let depth = 1, end = open + 1;
      for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
      return source.slice(start, end);
    });
    expect(bodies[0]).toBe(bodies[1]);
  }
});

import { parseIdentity } from "../src/services/identityParser";
import { createAuthStateController } from "../src/context/authState";
const base = { uid: "u1", email: "test@example.test", fullName: "Test", role: "patient", status: "active",
  schemaVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
test("canonical administrator parsed", () => {
  expect(parseIdentity({ ...base, role: "administrator" }, "u1").role).toBe("administrator");
});
test.each(["pending", "approved", "rejected"])("doctor %s preserved", verificationStatus => {
  expect(parseIdentity({ ...base, role: "doctor", verificationStatus }, "u1").verificationStatus).toBe(verificationStatus);
});
test.each([null, {}, {...base,role:"admin"}, {...base,role:"unknown"}, {...base,uid:"other"},
  {...base,status:undefined}, {...base,role:"doctor"}, {...base,role:"doctor",verificationStatus:true},
  {...base,createdAt:"bad"}, {...base,schemaVersion:2}])("malformed identity %# rejected", data => {
  expect(() => parseIdentity(data, "u1")).toThrow();
});
function setup(data = base, initialUid = "u1") {
  let uid = initialUid;
  let authCallback, refreshCallback;
  const stopAuth = jest.fn(), stopRefresh = jest.fn();
  const emit = jest.fn();
  const loadIdentity = jest.fn(async () => data === null ? null : parseIdentity(data, uid));
  const controller = createAuthStateController({
    currentUid: () => uid, loadIdentity,
    observeAuth: next => { authCallback = next; return stopAuth; },
    observeIdentityRefresh: next => { refreshCallback = next; return stopRefresh; },
  }, emit);
  return { emit, loadIdentity, controller, stopAuth, stopRefresh,
    changeUid(next) { uid = next; authCallback(next); }, notify() { refreshCallback(); } };
}
test("signed out", async () => {
  const h = setup(null, null); await h.controller.refresh();
  expect(h.emit).toHaveBeenLastCalledWith({status:"signedOut",firebaseUid:null,user:null,error:null});
});
test.each([[base,"ready"],[null,"identityMissing"],[{...base,role:"admin"},"identityError"]])("identity state %#", async (data,status) => {
  const h = setup(data); await h.controller.refresh();
  expect(h.emit.mock.calls[0][0].status).toBe("loadingIdentity");
  expect(h.emit.mock.lastCall[0]).toMatchObject({status,firebaseUid:"u1"});
  if (status !== "ready") expect(h.emit.mock.lastCall[0].user).toBeNull();
});
test("read error distinct from missing", async () => {
  const h = setup(); h.loadIdentity.mockRejectedValue(new Error("network"));
  await h.controller.refresh();
  expect(h.emit.mock.lastCall[0]).toMatchObject({status:"identityError",user:null,firebaseUid:"u1"});
});
test("logout clears loaded identity", async () => {
  const h = setup(); await h.controller.refresh(); h.changeUid(null);
  expect(h.emit.mock.lastCall[0]).toEqual({status:"signedOut",firebaseUid:null,user:null,error:null});
});
test("late identity read cannot restore logged-out account", async () => {
  const h=setup(); let resolve;
  h.loadIdentity.mockReturnValue(new Promise(done=>{resolve=done;}));
  const pending=h.controller.refresh(); h.changeUid(null); resolve(base); await pending;
  expect(h.emit.mock.lastCall[0].status).toBe("signedOut");
});
test("completion event reloads missing identity", async () => {
  const h=setup(null); await h.controller.refresh();
  h.loadIdentity.mockResolvedValue(base); h.notify();
  await Promise.resolve(); await Promise.resolve();
  expect(h.emit.mock.lastCall[0].status).toBe("ready");
});
test("unmount cancels subscriptions and ignores late data", async () => {
  const h=setup(); let resolve;
  h.loadIdentity.mockReturnValue(new Promise(done=>{resolve=done;}));
  const pending=h.controller.refresh(); h.controller.stop();
  h.emit.mockClear(); resolve(base); await pending;
  expect(h.emit).not.toHaveBeenCalled(); expect(h.stopAuth).toHaveBeenCalled(); expect(h.stopRefresh).toHaveBeenCalled();
});

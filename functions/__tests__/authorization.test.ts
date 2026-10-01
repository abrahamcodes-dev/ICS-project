import { createAuthorization } from "../src/shared/authorization";
const base = { uid: "target", email: "test@example.test", fullName: "Test", role: "administrator", status: "active",
 schemaVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
test("unauthenticated rejected before read", async () => {
 const read = jest.fn();
 await expect(createAuthorization(read).requireAdministrator(undefined)).rejects.toMatchObject({code:"unauthenticated"});
 expect(read).not.toHaveBeenCalled();
});
test.each([null, {}, {...base,uid:"other"}, {...base,status:"disabled"}, {...base,role:"patient"},
 {...base,role:"doctor",verificationStatus:"approved"}, {...base,role:"admin"}, {...base,role:"unknown"},
 {...base,role:undefined}, {...base,status:undefined}, {...base,schemaVersion:2},
 {...base,role:"doctor",verificationStatus:true}, {...base,createdAt:"bad"}])("invalid administrator %#", async data => {
 await expect(createAuthorization(async()=>data).requireAdministrator({uid:"target"})).rejects.toMatchObject({code:"permission-denied"});
});
test("canonical administrator accepted", async()=> {
 await expect(createAuthorization(async()=>base).requireAdministrator({uid:"target"})).resolves.toEqual(base);
});
test.each(["pending","rejected","invalid",undefined,true])("unapproved doctor %s rejected", async verificationStatus=>{
 await expect(createAuthorization(async()=>({...base,role:"doctor",verificationStatus}))
 .requireApprovedDoctor({uid:"target"})).rejects.toMatchObject({code:"permission-denied"});
});
test("approved doctor accepted", async()=>{
 const data={...base,role:"doctor",verificationStatus:"approved"};
 await expect(createAuthorization(async()=>data).requireApprovedDoctor({uid:"target"})).resolves.toEqual(data);
});
test("disabled approved doctor rejected",async()=>{
 await expect(createAuthorization(async()=>({...base,role:"doctor",verificationStatus:"approved",status:"disabled"}))
 .requireApprovedDoctor({uid:"target"})).rejects.toMatchObject({code:"permission-denied"});
});
test("database failure grants no privileges",async()=>{
 await expect(createAuthorization(async()=>{throw new Error("unavailable");}).requireAdministrator({uid:"target"})).rejects.toThrow("unavailable");
});

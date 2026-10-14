jest.mock('../src/services/firebaseConfig',()=>({db:{},auth:{currentUser:{uid:'d'}}}));
jest.mock('firebase/firestore',()=>({doc:jest.fn((db,...path)=>path),getDoc:jest.fn()}));
const {auth}=require('../src/services/firebaseConfig'),{getDoc,doc}=require('firebase/firestore'),{readOwnDoctorProfile}=require('../src/services/doctorProfileRead');
beforeEach(()=>{jest.clearAllMocks();auth.currentUser={uid:'d'};});
test('own profile uses owner get and returns only professional fields',async()=>{getDoc.mockResolvedValue({exists:()=>true,data:()=>({uid:'d',schemaVersion:1,specialty:'General',activeRequestId:'private'})});expect(await readOwnDoctorProfile('d')).toEqual({specialty:'General'});expect(doc).toHaveBeenCalledWith({},'doctorProfiles','d');});
test('other account is denied without read',async()=>{await expect(readOwnDoctorProfile('other')).rejects.toThrow();expect(getDoc).not.toHaveBeenCalled();});
test('logout during request discards result',async()=>{getDoc.mockImplementation(async()=>{auth.currentUser=null;return {exists:()=>false};});await expect(readOwnDoctorProfile('d')).rejects.toThrow();});

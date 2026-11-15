jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('../src/services/firebaseConfig',()=>({functions:{}}));
jest.mock('react-native-blob-util',()=>({__esModule:true,default:{fs:{readFile:jest.fn()}}}));
import {hostedAcademicEnvironment,academicUpload,academicCredentialBytes} from '../src/services/academicDemo';
import {httpsCallable} from 'firebase/functions';
import BlobUtil from 'react-native-blob-util';
const original={...process.env};
afterEach(()=>{process.env={...original};jest.clearAllMocks();});
test.each([['true','demo-calladoc',false],['false','calladoc-2c05a',false],['false','calladoc-qa-academic-demo',true],['true','calladoc-qa-academic-demo',false]])('hosted upload selection remains project and mode bound %s %s',(mode,project,expected)=>{
 expect(hostedAcademicEnvironment(mode,project)).toBe(expected);
});
test('hosted upload sends only kind, slot id and bounded file content to the protected callable',async()=>{
 BlobUtil.fs.readFile.mockResolvedValue('YQ==');const call=jest.fn().mockResolvedValue({data:{uploaded:true}});httpsCallable.mockReturnValue(call);
 await academicUpload('credential','slot','file:///synthetic.pdf');
 expect(BlobUtil.fs.readFile).toHaveBeenCalledWith('/synthetic.pdf','base64');expect(httpsCallable).toHaveBeenCalledWith({},'uploadAcademicDemoObject');expect(call).toHaveBeenCalledWith({kind:'credential',id:'slot',base64:'YQ=='});
});
test('hosted evidence reader accepts bounded base64 and rejects oversized responses',async()=>{
 httpsCallable.mockReturnValue(jest.fn().mockResolvedValue({data:{base64:'YQ=='}}));expect(new Uint8Array(await academicCredentialBytes('slot'))).toEqual(new Uint8Array([97]));
 httpsCallable.mockReturnValue(jest.fn().mockResolvedValue({data:{base64:'a'.repeat(6990510)}}));await expect(academicCredentialBytes('slot')).rejects.toThrow('Invalid evidence');
});

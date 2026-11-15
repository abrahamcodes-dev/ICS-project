import {attachmentId,displayFilename,prepareAttachmentInput,validateAttachmentBytes,ATTACHMENT_MAX_BYTES} from '../src/consultations/attachmentPolicy';
const input={consultationId:'a'.repeat(64),requestId:'12345678-1234-4234-8234-123456789abc',filename:'synthetic.pdf',contentType:'application/pdf',sizeBytes:30};
test('strict types, size and identifiers; local paths never become display paths',()=>{
 expect(displayFilename('C:\\private\\patient\u202ereport.pdf')).toBe('patientreport.pdf');
 expect(prepareAttachmentInput(input).filename).toBe('synthetic.pdf');
 for(const p of [{sizeBytes:ATTACHMENT_MAX_BYTES+1},{sizeBytes:0},{contentType:'text/html'},{storagePath:'attacker'},{requestId:'x'}])expect(()=>prepareAttachmentInput({...input,...p})).toThrow();
});
test('PDF, PNG, JPEG signatures and bounded active PDF checks',()=>{
 const pdf=Buffer.from('%PDF-1.4\nSynthetic only\n%%EOF');
 expect(validateAttachmentBytes(pdf,'application/pdf',pdf.length)).toMatch(/^[a-f0-9]{64}$/);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 expect(()=>validateAttachmentBytes(png,'image/png',png.length)).not.toThrow();
 expect(()=>validateAttachmentBytes(Buffer.from([255,216,255,217]),'image/jpeg',4)).not.toThrow();
 for(const bytes of [Buffer.from('fake'),Buffer.from('%PDF-1.4\n/JavaScript\n%%EOF')])expect(()=>validateAttachmentBytes(bytes,'application/pdf',bytes.length)).toThrow();
 expect(()=>validateAttachmentBytes(pdf,'image/png',pdf.length)).toThrow();
 expect(()=>validateAttachmentBytes(pdf,'application/pdf',pdf.length+1)).toThrow();
});
test('attachment request identities are stable and sender scoped',()=>{
 expect(attachmentId(input.consultationId,'doctor',input.requestId)).toBe(attachmentId(input.consultationId,'doctor',input.requestId));
 expect(attachmentId(input.consultationId,'other',input.requestId)).not.toBe(attachmentId(input.consultationId,'doctor',input.requestId));
});

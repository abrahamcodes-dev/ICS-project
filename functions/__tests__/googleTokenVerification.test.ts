import {generateKeyPairSync,sign} from 'crypto';
import {OAuth2Client} from 'google-auth-library';
import {CertificateFormat} from 'google-auth-library/build/src/auth/oauth2client';
import {verifyGoogleIdentity} from '../src/auth/googleSignIn';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const audience='synthetic-web.apps.googleusercontent.com';
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(extra:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000),data=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://accounts.google.com',aud:audience,sub:'synthetic-subject',email:'synthetic@example.test',email_verified:true,iat:now,exp:now+300,...extra});
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
beforeEach(()=>{
 process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID=audience;
 jest.spyOn(OAuth2Client.prototype,'getFederatedSignonCertsAsync').mockResolvedValue({certs:{'test-key':publicKey.export({type:'spki',format:'pem'}).toString()},format:CertificateFormat.PEM});
});
afterEach(()=>{jest.restoreAllMocks();delete process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID;});
test('verifies signature and returns only the required Google identity fields',async()=>{
 expect(await verifyGoogleIdentity(token({phone_number:'not-returned',picture:'not-returned'}))).toEqual({sub:'synthetic-subject',email:'synthetic@example.test',emailVerified:true,name:undefined});
});
test.each([{aud:'wrong-client'},{iss:'https://untrusted.example.test'},{exp:1},{email_verified:false},{email:undefined}])('rejects invalid claims %#',async extra=>{
 await expect(verifyGoogleIdentity(token(extra))).rejects.toBeDefined();
});
test('rejects a forged signature',async()=>{
 const parts=token().split('.');parts[1]=encode({iss:'https://accounts.google.com',aud:audience,sub:'victim',email:'victim@example.test',email_verified:true});
 await expect(verifyGoogleIdentity(parts.join('.'))).rejects.toBeDefined();
});
test('rejects credentials when the server audience is not configured',async()=>{
 delete process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID;await expect(verifyGoogleIdentity(token())).rejects.toBeDefined();
});

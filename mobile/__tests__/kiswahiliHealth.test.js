const {askChatbot}=require('../src/services/chatbotService');
const {SW_DISCLAIMER}=require('../src/services/kiswahiliHealth');
test.each(['Habari','Homa ni nini?','Malaria ni nini?','Kikohozi husababishwa na nini?','Maumivu ya kichwa ni nini?','Nawezaje kulala vizuri?','Lishe bora ni nini?','Nina msongo wa mawazo','Afya ya mtoto','Kisukari ni nini?','Presha ni nini?','Ninawezaje kuweka miadi ya daktari?'])('responds safely in Kiswahili: %s',query=>{
 const r=askChatbot(query,undefined,'sw');expect(r.response).toContain(SW_DISCLAIMER);expect(r.emergency).toBe(false);expect(r.intent).not.toBe('unsupported');
});
test.each(['Siwezi kupumua','Mtoto hapumui','Maumivu ya kifua','Nimetumia dawa nyingi','Ame kunywa sumu','Amepoteza fahamu','Nataka kujiua','Nataka kujidhuru','Kutokwa damu nyingi','Mjamzito anatokwa damu','Sina maumivu ya kifua','chest pain na homa'])('emergency overrides other intents and negation: %s',query=>{
 for(const lang of ['en','sw']){const r=askChatbot(query,undefined,lang);expect(r.emergency).toBe(true);expect(r.localized.sw).toContain('Usisubiri');expect(r.localized.en).toContain('Do not wait');}
});
test.each(['Nimeze dawa gani ya homa?','Nipe dozi ya paracetamol','Nitumie vidonge vingapi?'])('refuses medicine selection and dosing: %s',query=>{
 const r=askChatbot(query,undefined,'sw');expect(r.intent).toBe('medication');expect(r.response).toContain('Siwezi kuchagua dawa');
});
test('unsupported questions admit uncertainty; no external service is involved',()=>{
 const r=askChatbot('Explain quantum gravity',undefined,'sw');expect(r.intent).toBe('unsupported');expect(r.response).toContain('Sina jibu');
});

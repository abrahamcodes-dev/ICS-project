const {displayMinutes,systemMessage,tr}=require('../src/i18n/translate');
const {setLanguage}=require('../src/i18n/locale');
afterEach(async()=>setLanguage('en'));
test.each([1,15,30,60])('duration %s preserves the value while localizing its label',async minutes=>{
 await setLanguage('en');expect(displayMinutes(minutes)).toBe(minutes+' '+(minutes===1?'minute':'minutes'));
 await setLanguage('sw');expect(displayMinutes(minutes)).toBe('dakika '+minutes);
});
test.each([['completed','Miadi hii imekamilika.'],['cancelled','Miadi hii imeghairiwa.'],['no show','Miadi hii haikuhudhuriwa.']])('system status %s translates without changing an identifier',async(status,expected)=>{
 const reason='This appointment is '+status+'.';await setLanguage('sw');expect(systemMessage(reason)).toBe(expected);await setLanguage('en');expect(systemMessage(reason)).toBe(reason);
});
test('Doctor help and view titles are explicit typed translations',async()=>{await setLanguage('sw');expect(tr('Help & support')).toBe('Msaada na usaidizi');expect(tr('View prescription')).toBe('Tazama maagizo ya dawa');});

const {en,sw}=require('../src/i18n/messages');
const {tr,displayCode,systemMessage,displayDate}=require('../src/i18n/translate');
const {setLanguage,getLanguage,initializeLanguage,LANGUAGE_KEY}=require('../src/i18n/locale');
beforeEach(async()=>{await setLanguage('en');});
afterEach(async()=>{await setLanguage('en');});
test('both catalogues have identical nonempty entries and interpolation contracts',()=>{
 expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
 for(const key of Object.keys(en)){
  expect(sw[key].trim().length).toBeGreaterThan(0);
  expect([...sw[key].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort()).toEqual([...en[key].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort());
 }
});
test('preference is device-wide, persists and restores independently of accounts',async()=>{
 const stored=new Map(),adapter={getItem:jest.fn(async k=>stored.get(k)??null),setItem:jest.fn(async(k,v)=>{stored.set(k,v);})};
 await initializeLanguage(adapter);await setLanguage('sw');expect(stored.get(LANGUAGE_KEY)).toBe('sw');
 await setLanguage('en');stored.set(LANGUAGE_KEY,'sw');await initializeLanguage(adapter);
 expect(getLanguage()).toBe('sw');expect(adapter.setItem.mock.calls.every(([k])=>k===LANGUAGE_KEY)).toBe(true);
});
test('a late storage read cannot overwrite a newly selected language',async()=>{
 let resolve;const loading=initializeLanguage({getItem:()=>new Promise(r=>resolve=r),setItem:async()=>{}});
 await setLanguage('sw');resolve('en');await loading;expect(getLanguage()).toBe('sw');
});
test('rapid language writes stay ordered and storage failure does not undo visible selection',async()=>{
 const writes=[];await initializeLanguage({getItem:async()=>null,setItem:async(k,v)=>{writes.push(v);}});
 await Promise.all([setLanguage('sw'),setLanguage('en'),setLanguage('sw')]);expect(writes).toEqual(['sw','en','sw']);
 await initializeLanguage({getItem:async()=>null,setItem:async()=>{throw Error('disk');}});
 await expect(setLanguage('en')).rejects.toThrow('disk');expect(getLanguage()).toBe('en');
 await initializeLanguage({getItem:async()=>null,setItem:async()=>{}});
});
test('interpolation preserves authored clinical content and backend identifiers',async()=>{
 await setLanguage('sw');const authored='Take 1 tablet after food. Cancel';
 expect(tr('You: {0}',{'0':authored})).toBe('Wewe: '+authored);
 expect(displayCode('scheduled')).toBe('Imepangwa');expect(systemMessage('Unknown backend error')).toBe('Unknown backend error');
});
test('date presentation preserves Nairobi instant and currency amounts are unchanged',async()=>{
 const value=Date.parse('2026-11-17T06:00:00Z');
 for(const lang of ['en','sw']){await setLanguage(lang);expect(displayDate(value,'time',{hour:'2-digit',minute:'2-digit',hour12:false})).toContain('09:00');}
 const {parseKsh,formatKsh}=require('../src/services/payments');expect(parseKsh('1500')).toBe(150000);expect(formatKsh(150000)).toContain('1,500');
});
test('saved system templates switch both directions while interpolation remains original',async()=>{
 const english='30-minute rate: KSh 1,500.00 · Demo';
 await setLanguage('sw');const localized=systemMessage(english);expect(localized).toBe('Ada ya dakika 30: KSh 1,500.00 · Majaribio');
 await setLanguage('en');expect(systemMessage(localized)).toBe(english);
});

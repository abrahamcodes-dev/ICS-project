import {en, sw, type MessageKey} from './messages';
import {getLanguage, localeTag} from './locale';
export type {MessageKey};
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;
type Arguments<K extends MessageKey> = [Placeholders<K>] extends [never] ? [params?: Record<string, string | number>]
  : [params: Record<Placeholders<K>, string | number>];
/** Translate explicit interface keys. Interpolated content is never translated. */
export function tr<K extends MessageKey>(key: K, ...args: Arguments<K>): string {
  const template = getLanguage() === 'sw' ? sw[key] : en[key];
  const params = args[0] as Record<string, string | number> | undefined;
  return template.replace(/\{([^}]+)\}/g, (match, name) => String(params?.[name] ?? match));
}
/** Only controlled system messages/statuses; never use on clinical text. */
export function systemMessage(text: string): string;
export function systemMessage(text: null): null;
export function systemMessage(text: string | null): string | null;
export function systemMessage(text: string | null): string | null {
  if(text === null) return null;
  if (Object.prototype.hasOwnProperty.call(en, text)) return getLanguage() === 'sw' ? sw[text as MessageKey] : text;
  const key = (Object.keys(sw) as MessageKey[]).find(key => sw[key] === text);
  if(key) return getLanguage() === 'sw' ? sw[key] : en[key];
  // Resolve already-rendered controlled UI templates, e.g. a saved error or
  // module descriptor, without translating interpolated names/clinical text.
  for(const pattern of systemPatterns){
    const match=pattern.regex.exec(text);
    if(match){
      const params=Object.fromEntries(pattern.names.map((name,index)=>[name,match[index+1]]));
      return (getLanguage()==='sw'?sw[pattern.key]:en[pattern.key]).replace(/\{([^}]+)\}/g,(token,name)=>params[name]??token);
    }
  }
  return text;
}
const escapeRegex=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const systemPatterns=(Object.keys(en) as MessageKey[]).filter(key=>/\{[^}]+\}/.test(key)).flatMap(key=>
  [en[key],sw[key]].map(template=>{const names:string[]=[];const parts=template.split(/(\{[^}]+\})/);
    return {key,names,regex:new RegExp('^'+parts.map(part=>/^\{[^}]+\}$/.test(part)?(names.push(part.slice(1,-1)),'([\\s\\S]*?)'):escapeRegex(part)).join('')+'$')};}));
/** Display-only enum labels. Never use the result as a persisted identifier. */
const codeLabels: Record<string, {en:string;sw:string}> = {
  patient:{en:'Patient',sw:'Mgonjwa'},doctor:{en:'Doctor',sw:'Daktari'},administrator:{en:'Administrator',sw:'Msimamizi'},
  active:{en:'Active',sw:'Hai'},disabled:{en:'Disabled',sw:'Imezimwa'},pending:{en:'Pending',sw:'Inasubiri'},
  approved:{en:'Approved',sw:'Imeidhinishwa'},rejected:{en:'Rejected',sw:'Imekataliwa'},submitted:{en:'Submitted',sw:'Imetumwa'},
  scheduled:{en:'Scheduled',sw:'Imepangwa'},completed:{en:'Completed',sw:'Imekamilika'},cancelled:{en:'Cancelled',sw:'Imeghairiwa'},no_show:{en:'No-show',sw:'Hakuhudhuria'},
  created:{en:'Created',sw:'Imeundwa'},succeeded:{en:'Succeeded',sw:'Imefaulu'},failed:{en:'Failed',sw:'Imeshindikana'},expired:{en:'Expired',sw:'Muda umeisha'},
  review_required:{en:'Review required',sw:'Ukaguzi unahitajika'},refund_pending:{en:'Refund pending',sw:'Marejesho yanasubiri'},refund_failed:{en:'Refund failed',sw:'Marejesho yameshindikana'},refunded:{en:'Refunded',sw:'Imerejeshwa'},
  granted:{en:'Allowed',sw:'Imeruhusiwa'},declined:{en:'Declined',sw:'Imekataliwa'},withdrawn:{en:'Withdrawn',sw:'Ridhaa imeondolewa'},
  medical_license:{en:'Medical license',sw:'Leseni ya udaktari'},degree:{en:'Degree',sw:'Shahada'},other:{en:'Other',sw:'Nyingine'},
  ready:{en:'Ready',sw:'Tayari'},attached:{en:'Attached',sw:'Imeambatishwa'},retention_pending:{en:'Retention review pending',sw:'Ukaguzi wa uhifadhi unasubiri'},
  Male:{en:'Male',sw:'Mwanamume'},Female:{en:'Female',sw:'Mwanamke'},Other:{en:'Other',sw:'Nyingine'},'Prefer not to say':{en:'Prefer not to say',sw:'Sipendi kusema'},
};
export function displayCode(code: string) {
  if(getLanguage() === 'en' && codeLabels[code]) return code.replace(/_/g,' ');
  return codeLabels[code]?.[getLanguage()] ?? systemMessage(code);
}
export function displayDate(value: number | Date, mode: 'date' | 'time' | 'datetime' = 'datetime', options: Intl.DateTimeFormatOptions = {}) {
  const date = new Date(value);
  const settings: Intl.DateTimeFormatOptions = {timeZone:'Africa/Nairobi', ...options};
  return mode === 'date' ? date.toLocaleDateString(localeTag(), settings)
    : mode === 'time' ? date.toLocaleTimeString(localeTag(), settings) : date.toLocaleString(localeTag(), settings);
}

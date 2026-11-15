const {localDay,wallInstant,timeChoices,visibleWindows,planLocalAvailability:plan}=require('../src/services/localAvailability');
const zone='Africa/Nairobi',date='2026-10-30',now=Date.parse('2026-10-29T00:00Z');
const w=(a,b)=>({startAt:Date.parse(a),endAt:Date.parse(b)});
const empty=()=>({'2026-10-29':null,'2026-10-30':null});
const day=(utcDate,windows)=>({utcDate,timeZone:'UTC',revision:7,windows});
test('Nairobi 9 to noon maps exactly to 06 to 09 UTC and preserves revisions',()=>{
 const windows=[{startAt:wallInstant(date,'09:00',zone),endAt:wallInstant(date,'12:00',zone)}],snap=empty();
 snap[date]=day(date,[]);expect(plan(date,zone,windows,snap,now)).toEqual({utcDate:date,timeZone:'UTC',expectedRevision:7,windows:[w('2026-10-30T06:00Z','2026-10-30T09:00Z')]});
 expect(localDay(date,zone).dates).toEqual(['2026-10-29',date]);
});
test('multi-partition changes produce one atomic batch, including clearing',()=>{
 const windows=[w('2026-10-29T22:00Z','2026-10-30T02:00Z')];const batch=plan(date,zone,windows,empty(),now);expect(batch.days.map(d=>d.windows)).toEqual([[w('2026-10-29T22:00Z','2026-10-30T00:00Z')],[w('2026-10-30T00:00Z','2026-10-30T02:00Z')]]);
 const snap=empty();snap['2026-10-29']=day('2026-10-29',batch.days[0].windows);snap[date]=day(date,batch.days[1].windows);expect(plan(date,zone,[],snap,now).days.map(d=>({revision:d.expectedRevision,windows:d.windows}))).toEqual([{revision:7,windows:[]},{revision:7,windows:[]}]);
});
test('unchanged partitions and unrelated local dates are preserved exactly',()=>{
 const snap=empty(),outside=w('2026-10-30T22:00Z','2026-10-30T23:00Z');snap[date]=day(date,[outside]);
 expect(plan(date,zone,[w('2026-10-30T06:00Z','2026-10-30T09:00Z')],snap,now).windows).toEqual([w('2026-10-30T06:00Z','2026-10-30T09:00Z'),outside]);
 expect(plan(date,zone,[],empty(),now)).toBeNull();
 expect(()=>plan(date,zone,[],{},now)).toThrow('Load all');
});
test('multiple windows, overlap and removal',()=>{
 const windows=[w('2026-10-30T06:00Z','2026-10-30T09:00Z'),w('2026-10-30T10:00Z','2026-10-30T11:00Z')];expect(plan(date,zone,windows,empty(),now).windows).toEqual(windows);
 expect(()=>plan(date,zone,[windows[0],w('2026-10-30T08:00Z','2026-10-30T10:00Z')],empty(),now)).toThrow('overlap');
 const snap=empty();snap[date]=day(date,windows);expect(plan(date,zone,[],snap,now).windows).toEqual([]);
});
test('started window clipping restores exact boundaries and cannot be removed',()=>{
 const snap=empty();snap['2026-10-29']=day('2026-10-29',[w('2026-10-29T20:00Z','2026-10-30T00:00Z')]);
 const range=localDay(date,zone),rows=visibleWindows(snap,range.start,range.end),late=Date.parse('2026-10-29T22:00Z');
 expect(plan(date,zone,rows,snap,late)).toBeNull();expect(()=>plan(date,zone,[],snap,late)).toThrow('started');
});
test('DST gaps and folds are rejected, day length and offset changes are respected',()=>{
 const z='America/New_York';expect(()=>wallInstant('2026-03-08','02:30',z)).toThrow('skipped or repeated');expect(()=>wallInstant('2026-11-01','01:30',z)).toThrow('skipped or repeated');
 const spring=localDay('2026-03-08',z),fall=localDay('2026-11-01',z);expect(spring.end-spring.start).toBe(23*3600000);expect(fall.end-fall.start).toBe(25*3600000);
 expect(timeChoices('2026-11-01',z).some(c=>c.label==='1:30 AM')).toBe(false);
 expect(wallInstant('2026-03-08','09:00',z)).toBe(Date.parse('2026-03-08T13:00Z'));
});
test('non-hour offsets use exact slot instants and UTC midnight splitting',()=>{
 const choices=timeChoices(date,'Asia/Kathmandu');expect(choices.some(c=>c.label==='9:15 AM')).toBe(true);expect(choices.every(c=>c.value%900000===0)).toBe(true);
 const snap=empty();expect(plan(date,zone,[w('2026-10-29T22:00Z','2026-10-30T00:00Z')],snap,now).utcDate).toBe('2026-10-29');
});
test('horizon and newly started windows fail closed',()=>{
 expect(()=>plan(date,zone,[w('2026-10-30T06:00Z','2026-10-30T09:00Z')],empty(),Date.parse('2026-10-30T07:00Z'))).toThrow('started');
 expect(()=>plan(date,zone,[w('2026-10-30T06:00Z','2026-10-30T09:00Z')],empty(),Date.parse('2026-01-01T00:00Z'))).toThrow('90 days');
});
test('DST 25-hour day prepares exact multi-day UTC boundaries',()=>{
 const z='America/New_York',d='2026-11-01',range=localDay(d,z),snap=Object.fromEntries(range.dates.map(date=>[date,null]));
 const batch=plan(d,z,[{startAt:range.start,endAt:range.end}],snap,Date.parse('2026-10-30T00:00Z'));
 expect(batch.days).toHaveLength(2);expect(batch.days[0].windows[0].startAt).toBe(Date.parse('2026-11-01T04:00Z'));expect(batch.days[1].windows[0].endAt).toBe(Date.parse('2026-11-02T05:00Z'));
});
test('atomic save reload rejoins UTC-boundary pieces without creating a new change',()=>{
 const input=[w('2026-10-29T22:00Z','2026-10-30T02:00Z')],batch=plan(date,zone,input,empty(),now),snap=Object.fromEntries(batch.days.map(d=>[d.utcDate,{...d,revision:1}])),range=localDay(date,zone);
 const loaded=visibleWindows(snap,range.start,range.end);expect(loaded).toEqual(input);expect(plan(date,zone,loaded,snap,now)).toBeNull();
});

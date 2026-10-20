// Each timezone runs in a fresh Node process: Jest's process.env proxy does not
// reliably change the native Date timezone in an already-running test environment.
const {spawnSync}=require('node:child_process'),{resolve}=require('node:path');
function dates(zone,day,now){
 const script=`const fs=require('fs'),ts=require('typescript'),out={};
 const code=ts.transpileModule(fs.readFileSync('src/services/schedulingService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','exports',code)(()=>({}),out);
 console.log(JSON.stringify({range:out.localDateRange(${JSON.stringify(day)}),partitions:out.discoveryPartitions(${JSON.stringify(day)},${now})}));`;
 const child=spawnSync(process.execPath,['-e',script],{cwd:resolve(__dirname,'..'),env:{...process.env,TZ:zone},encoding:'utf8'});
 expect(child.status).toBe(0);return JSON.parse(child.stdout);
}
test.each([
 ['Africa/Nairobi','2026-10-20','2026-10-19T21:00:00Z',24,2],
 ['Asia/Kathmandu','2026-10-20','2026-10-19T18:15:00Z',24,2],
 ['America/New_York','2026-03-08','2026-03-08T05:00:00Z',23,2],
 ['America/New_York','2026-11-01','2026-11-01T04:00:00Z',25,2],
 ['UTC','2026-10-20','2026-10-20T00:00:00Z',24,1],
])('%s %s preserves local day and DST partition boundaries',(zone,day,utcStart,hours,days)=>{
 const expected=Date.parse(utcStart),result=dates(zone,day,expected-86400000);
 expect(result.range.start).toBe(expected);expect(result.range.end-result.range.start).toBe(hours*3600000);expect(result.partitions.days).toBe(days);
});
test('discovery clips preceding UTC day and final calendar horizon',()=>{
 const now=Date.parse('2026-10-20T10:00:00Z'),today=dates('Africa/Nairobi','2026-10-20',now);
 expect(today.partitions.fromDate).toBe('2026-10-20');expect(today.partitions.days).toBe(1);
 expect(dates('UTC','2027-01-18',now).partitions.days).toBe(1);
 expect(dates('UTC','2027-01-19',now).partitions).toBeNull();
});

import { readFileSync } from "fs";
import { resolve } from "path";
test("only registration remains exported",()=>{
 const source=readFileSync(resolve(__dirname,"../src/index.ts"),"utf8");
 expect(source.split(/\r?\n/).filter(line=>line.trim().startsWith("export ")))
 .toEqual(['export { completeRegistration } from "./auth/completeRegistration";']);
});

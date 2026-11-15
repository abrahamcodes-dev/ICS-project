import React from 'react';
import {View} from 'react-native';

// Sample cubic curves once, then draw with overlapping round-ended native strokes.
// No native SVG dependency is needed for this small icon family.
function curve(start:number[], ...segments:number[][]):number[][] {
 const points=[start];let from=start;
 for(const [a,b,c,d,x,y] of segments){
  for(let i=1;i<=10;i++){const t=i/10,u=1-t;points.push([u*u*u*from[0]+3*u*u*t*a+3*u*t*t*c+t*t*t*x,u*u*u*from[1]+3*u*u*t*b+3*u*t*t*d+t*t*t*y]);}
  from=[x,y];
 }
 return points;
}

export type PatientIconName='stethoscope'|'skin'|'baby'|'brain'|'home'|'calendar'|'profile'|'bell'|'search'|'arrow'|'filter'|'clock'|'refresh'|'message'|'document';
// Small native vector geometry; all marks share the same rounded outline weight.
const paths:Record<PatientIconName,number[][][]>={
 message:[[[5,5],[27,5],[27,24],[13,24],[6,29],[6,24],[5,24],[5,5]]],
 document:[[[7,3],[21,3],[27,9],[27,29],[7,29],[7,3]],[[21,3],[21,9],[27,9]],[[12,14],[22,14]],[[12,19],[22,19]],[[12,24],[19,24]]],
 clock:[[[16,8],[16,16],[22,19]]],
 refresh:[curve([26,12],[22,2,7,3,5,14],[1,27,22,32,27,21]),[[26,4],[26,12],[18,12]]],
 filter:[[[4,6],[28,6],[19,17],[19,27],[13,24],[13,17],[4,6]]],
 stethoscope:[curve([8,5],[3,4,5,11,6,15],[7,21,14,21,16,15],[17,11,20,4,15,5]),[[8,3],[8,6]],[[15,3],[15,6]],curve([11,19],[8,30,25,32,25,20])],
 skin:[curve([20,3],[16,8,14,14,14,20],[14,25,19,25,19,20],[19,17,17,17,17,14]),curve([3,16],[6,17,7,16,10,16]),curve([23,16],[25,17,27,16,29,16]),curve([3,22],[6,23,8,18,10,21],[10,31,23,31,23,21],[25,19,26,23,29,22])],
 baby:[curve([10,9],[6,10,6,13,6,16],[1,16,2,23,7,23],[10,30,22,30,25,23],[30,23,31,16,26,16],[26,12,24,9,22,9]),curve([11,10],[5,5,17,1,19,6],[23,3,17,-1,14,4]),curve([13,23],[15,25,18,25,20,22])],
 brain:[curve([16,6],[14,1,9,3,9,7],[4,5,3,10,5,13],[0,15,3,21,6,21],[4,25,8,28,11,26],[13,31,16,28,16,25]),[[16,6],[16,25]],curve([16,6],[18,1,23,3,23,7],[28,5,29,10,27,13],[32,15,29,21,26,21],[28,25,24,28,21,26],[19,31,16,28,16,25]),curve([8,11],[12,10,12,15,9,16]),curve([8,21],[12,20,13,23,11,26]),curve([24,11],[20,10,20,15,23,16]),curve([24,21],[20,20,19,23,21,26])],
 home:[[[4,15],[16,4],[28,15]],[[7,13],[7,28],[13,28],[13,20],[19,20],[19,28],[25,28],[25,13]]],
 calendar:[[[5,8],[27,8],[27,28],[5,28],[5,8]],[[5,14],[27,14]],[[10,4],[10,10]],[[22,4],[22,10]],[[10,19],[13,19]],[[19,19],[22,19]],[[10,24],[13,24]]],
 profile:[[[5,29],[6,24],[10,21],[22,21],[26,24],[27,29]]],
 bell:[[[7,22],[9,17],[9,11],[12,6],[20,6],[23,11],[23,17],[25,22],[7,22]],[[13,26],[16,28],[19,26]]],
 search:[[[22,22],[29,29]]],arrow:[[[5,16],[27,16]],[[20,9],[27,16],[20,23]]],
};
export function PatientIcon({name,color,size=28}:{name:PatientIconName;color:string;size?:number}) {
 const scale=size/32;
 const circle=(x:number,y:number,r:number,key:string)=><View key={key} style={{position:'absolute',left:(x-r)*scale,top:(y-r)*scale,width:r*2*scale,height:r*2*scale,borderRadius:r*scale,borderWidth:1.8*scale,borderColor:color}}/>;
 return <View testID={`icon-${name}`} accessible={false} importantForAccessibility="no-hide-descendants" style={{width:size,height:size}}>
 {paths[name].flatMap((points,p)=>points.slice(1).map(([x,y],i)=>{const [a,b]=points[i],length=(Math.hypot(x-a,y-b)+2)*scale;return <View key={`${p}-${i}`} style={{position:'absolute',left:(a+x)*scale/2-length/2,top:(b+y)*scale/2-scale,width:length,height:2*scale,borderRadius:scale,backgroundColor:color,transform:[{rotate:`${Math.atan2(y-b,x-a)}rad`}]}}/>;}))}
 {name==='clock'&&circle(16,16,12,'rim')}{name==='stethoscope'&&circle(25,16,3,'chest')}{name==='profile'&&circle(16,10,6,'head')}{name==='search'&&circle(14,14,9,'lens')}
 {name==='baby'&&<>{circle(11,16,1,'eye1')}{circle(22,16,1,'eye2')}</>}
 </View>;
}

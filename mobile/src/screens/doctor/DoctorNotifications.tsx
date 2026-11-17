import {localeTag} from '../../i18n/locale';
import {systemMessage} from "../../i18n/translate";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useEffect,useState} from 'react';
import {Pressable,ScrollView,View} from 'react-native';
import type {NotificationItem,NotificationKind} from '@shared/types/notificationContracts';
import {Action,Copy,Loading,Notice,Screen,usePalette} from '../../ui/design';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';
import {notificationLabels} from '../../services/notificationService';

const categories=['All','Appointments','Messages','System'] as const;
type Category=typeof categories[number];
export function notificationCategory(kind:NotificationKind):Category{return ['booking','cancellation','reminder'].includes(kind)?'Appointments':kind==='message'?'Messages':'System';}
export function relativeNotificationTime(time:number,now:number){const minutes=Math.floor(Math.max(0,now-time)/60000);if(minutes<1)return tr("Just now");const format=new Intl.RelativeTimeFormat(localeTag(),{numeric:'always'});if(minutes<60)return format.format(-minutes,'minute');const hours=Math.floor(minutes/60);if(hours<24)return format.format(-hours,'hour');return format.format(-Math.floor(hours/24),'day');}
const description:Record<NotificationKind,string>={booking:tr("A new appointment has been booked."),cancellation:tr("An appointment has been cancelled."),reminder:tr("An appointment starts within an hour."),message:tr("You have a new consultation message."),prescription:tr("A prescription is available for a consultation."),verification_approved:tr("Your doctor verification has been approved."),verification_rejected:tr("Your verification review is complete. Open it for details.")};
export default function DoctorNotifications({items,cursor,loading,busy,error,notice,back,refresh,more,select,deviceActions}:{items:NotificationItem[];cursor:string|null;loading:boolean;busy:boolean;error:string|null;notice:string|null;back?():void;refresh():void;more():void;select(item:NotificationItem,navigate:boolean):void;deviceActions:React.ReactNode}){
  useLocale();
 const p=usePalette(),[category,setCategory]=useState<Category>('All'),[settings,setSettings]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const visible=items.filter(item=>category==='All'||notificationCategory(item.kind)===category);
 return <Screen variant="dashboard">
  <View style={{flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel={tr("Back")} disabled={!back} onPress={back} style={{width:44,height:44,justifyContent:'center'}}><Copy style={{fontSize:26}}>←</Copy></Pressable><Copy variant="heading" style={{flex:1,textAlign:'center'}}>{tr("Notifications")}</Copy><Pressable accessibilityRole="button" accessibilityLabel={tr("Refresh notifications")} accessibilityState={{disabled:loading||busy}} disabled={loading||busy} onPress={refresh} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><PatientIcon name="refresh" color={p.accent} size={22}/></Pressable></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{categories.map(name=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={systemMessage(name)} accessibilityState={{selected:category===name}} onPress={()=>setCategory(name)} style={{minHeight:44,paddingHorizontal:16,justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:category===name?p.primary:p.surface}}><Copy variant="label" style={{color:category===name?p.onPrimary:p.text}}>{systemMessage(name)}</Copy></Pressable>)}</ScrollView>
  {loading&&<Loading label={tr("Loading notifications...")}/>}<Notice message={error}/><Notice message={systemMessage(notice)}/>
  {!loading&&!error&&!visible.length&&<View style={{paddingVertical:24,gap:8}}><Copy variant="heading">{category==='All'?tr("No notifications yet"):tr("No {0} notifications", {"0": category.toLowerCase()})}</Copy><Copy tone="muted">{cursor?tr("No matches in the loaded updates. Load older notifications to see more."):tr("New updates will appear here.")}</Copy></View>}
  <View>{visible.map(item=>{const reminder=item.kind==='reminder',message=item.kind==='message',appointment=notificationCategory(item.kind)==='Appointments';const icon:PatientIconName=reminder?'bell':message?'message':appointment?'calendar':'document';const color=reminder?p.warning:message?p.tertiary:appointment?p.info:p.accent;const background=reminder?p.warningSurface:message?p.tertiarySurface:appointment?p.infoSurface:p.mint;
   return <View key={item.id} style={{borderBottomWidth:1,borderColor:p.border,paddingVertical:14,gap:4}}><Pressable accessibilityRole="button" accessibilityLabel={systemMessage(notificationLabels[item.kind])} accessibilityHint={tr("Open notification")} disabled={busy||loading} onPress={()=>select(item,true)} style={{flexDirection:'row',alignItems:'flex-start',gap:12,minHeight:60}}><View style={{width:48,height:48,borderRadius:15,backgroundColor:background,alignItems:'center',justifyContent:'center'}}><PatientIcon name={icon} size={25} color={color}/></View><View style={{flex:1,gap:5}}><Copy variant="label" style={{fontWeight:'700'}}>{systemMessage(notificationLabels[item.kind])}</Copy><Copy tone="muted">{systemMessage(description[item.kind])}</Copy><Copy variant="caption" tone="muted">{relativeNotificationTime(item.createdAt,now)}</Copy></View>{!item.read&&<View accessibilityLabel={tr("Unread")} style={{width:8,height:8,borderRadius:4,backgroundColor:p.accent,marginTop:6}}/>}</Pressable>{!item.read&&<Pressable accessibilityRole="button" accessibilityLabel={tr("Mark {0} read", {"0": systemMessage(notificationLabels[item.kind])})} disabled={busy||loading} onPress={()=>select(item,false)} style={{alignSelf:'flex-end',minHeight:44,justifyContent:'center',paddingHorizontal:8}}><Copy variant="caption" style={{color:p.accent}}>{tr("Mark read")}</Copy></Pressable>}</View>;
  })}</View>
  {cursor&&<Action secondary title={tr("Older notifications")} disabled={loading||busy} onPress={more}/>}
  <Pressable accessibilityRole="button" accessibilityLabel={tr("Notification settings")} accessibilityState={{expanded:settings}} onPress={()=>setSettings(v=>!v)} style={{minHeight:44,justifyContent:'center'}}><Copy variant="caption" tone="muted">{tr("Notification settings")}</Copy></Pressable>
  {settings&&<View style={{gap:12}}><Copy tone="muted">{tr("Remote push delivery is currently disabled. Use this inbox for updates.")}</Copy>{deviceActions}</View>}
 </Screen>;
}

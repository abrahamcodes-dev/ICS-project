import {systemMessage} from "../../i18n/translate";
import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import DoctorNotifications from '../doctor/DoctorNotifications';
import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { onIdentityRefresh } from '../../services/authService';
import { createNotificationSession, notificationLabels, registerForPushNotifications } from '../../services/notificationService';
import { revokeNotificationDevice } from '../../services/notificationDevice';
import type { NotificationItem, NotificationTarget } from '@shared/types/notificationContracts';
import { Screen, Card, Copy, Action, Loading, Notice, Status } from '../../ui/design';
export function notificationRoute(role: 'patient' | 'doctor', d: NotificationTarget): { name: string; params?: { appointmentId: string } } {
  if (d.target === 'consultation') return { name: role === 'patient' ? 'Consultation' : 'ConsultationRoom', params: { appointmentId: d.appointmentId! } };
  if (d.target === 'prescriptions') return { name: role === 'patient' ? 'Prescriptions' : 'IssuePrescription' };
  if (d.target === 'verification') return { name: 'DoctorWorkspace' };
  return { name: 'Appointments' };
}
export default function NotificationsScreen({ navigation }: { navigation?: { navigate(name: string, params?: any): void;goBack?():void } }) {
  useLocale();
  const identity = useAuth(), focused = useIsFocused();
  if (!focused) return null;
  const role = identity.user?.role;
  if (identity.status !== 'ready' || identity.user?.status !== 'active' || !identity.firebaseUid || (role !== 'patient' && role !== 'doctor'))
    return <Screen><Copy>{tr("Sign in with an active patient or doctor account.")}</Copy></Screen>;
  return <NotificationInbox key={identity.firebaseUid} uid={identity.firebaseUid} doctor={role==='doctor'} back={role==='doctor'?()=>navigation?.goBack?.():undefined} open={d => {
    const route = notificationRoute(role, d); navigation?.navigate(route.name, route.params);
  }}/>;
}
export function NotificationInbox({ uid, open, back,doctor=false }: {doctor?:boolean; uid: string; open(d: NotificationTarget): void; back?(): void }) {
  useLocale();
  const [items, setItems] = useState<NotificationItem[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false), [actionBusy, setActionBusy] = useState(false);
  const alive = useRef(true), busy = useRef(false), acting = useRef(false), session = useRef<ReturnType<typeof createNotificationSession> | null>(null);
  async function load(more: boolean) {
    if (!alive.current || busy.current) return;
    busy.current = true; setLoading(true); setError(null);
    try { const page = await session.current!.list(more ? cursor ?? undefined : undefined);
      if (alive.current) { setItems(old => [...new Map([...(more ? old : []), ...page.items].map(n => [n.id, n])).values()]); setCursor(page.nextCursor); }
    } catch { if (alive.current) setError(tr("Unable to load notifications. Refresh to retry.")); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; const s = createNotificationSession(uid); session.current = s; void load(false);
    const stop = onIdentityRefresh(() => { alive.current = false; s.dispose(); setItems([]); setNotice(null); setBlocked(true); });
    return () => { alive.current = false; s.dispose(); stop(); };
  }, [uid]);
  async function act(action: () => Promise<void>) {
    if (!alive.current || acting.current) return; acting.current = true; setActionBusy(true); setError(null);
    try { await action(); } catch { if (alive.current) setError(tr("Action not confirmed. Check your connection and account access, then retry.")); }
    finally { acting.current = false; if (alive.current) setActionBusy(false); }
  }
  async function select(item: NotificationItem, navigate: boolean) {
    const destination = navigate ? await session.current!.open(item.id) : (await session.current!.read(item.id), null);
    if (!alive.current) return;
    setItems(old => old.map(n => n.id === item.id ? { ...n, read: true } : n));
    if (destination) open(destination);
  }
  const deviceActions=<>
    <Action secondary title={tr("Request push permission / register device")} disabled={actionBusy} onPress={() => { void act(async () => {
      const message = await registerForPushNotifications(); if (alive.current) setNotice(message);
    }); }}/>
    <Action secondary title={tr("Disable device registration")} disabled={actionBusy} onPress={() => { void act(async () => {
      await revokeNotificationDevice(); if (alive.current) setNotice(tr("Current session device registration disabled."));
    }); }}/>
  </>;
  if (blocked) return <Screen><Copy>{tr("Session changed. Reopen notifications.")}</Copy></Screen>;
  if(doctor)return <DoctorNotifications items={items} cursor={cursor} loading={loading} busy={actionBusy} error={error} notice={systemMessage(notice)} back={back} refresh={()=>void load(false)} more={()=>void load(true)} select={(item,navigate)=>void act(()=>select(item,navigate))} deviceActions={deviceActions}/>;
  return <Screen variant="dashboard"><Copy title>{tr("Notifications")}</Copy>{back && <Action secondary title={tr("Back to verification")} onPress={back}/>}
    <Copy>{tr("Private in-app updates. Refresh for new events and reminders within the next hour. Remote push delivery is not enabled.")}</Copy>
    <Action title={tr("Refresh notifications")} disabled={loading || actionBusy} onPress={() => { void load(false); }}/>
    {deviceActions}
    {loading && <Loading/>}<Notice message={error}/><Notice message={systemMessage(notice)}/>
    {!loading && !error && !items.length && <Copy>{tr("No notifications yet.")}</Copy>}
    {items.map(item => <Card key={item.id} tone={item.read?'surface':'mint'}><Status label={item.read?tr("Read"):tr("Unread")} tone={item.read?'neutral':'success'}/><Copy variant="heading">{systemMessage(notificationLabels[item.kind])}</Copy>
      <Copy variant="caption" tone="muted">{item.read ? tr("Read") : tr("Unread")} · {new Date(item.createdAt).toLocaleString(localeTag())}</Copy>
      <Action title={tr("Open update")} disabled={actionBusy || loading} onPress={() => { void act(() => select(item, true)); }}/>
      {!item.read && <Action secondary title={tr("Mark read")} disabled={actionBusy || loading} onPress={() => { void act(() => select(item, false)); }}/>}</Card>)}
    {cursor && <Action title={tr("Older notifications")} disabled={loading || actionBusy} onPress={() => { void load(true); }}/>}
  </Screen>;
}

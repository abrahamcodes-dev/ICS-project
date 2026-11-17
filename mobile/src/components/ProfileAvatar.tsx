import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { Action, Copy, Notice, usePalette } from '../ui/design';
import type { AvatarImage, AvatarView } from '../services/avatarService';
export function ProfileAvatar(props: {
    uid?: string;
    name: string;
    size?: number;
}) {
  useLocale(); return <ProfileAvatarSession key={props.uid ?? 'fallback'} {...props}/>; }
function ProfileAvatarSession({ uid, name, size = 64 }: {
    uid?: string;
    name: string;
    size?: number;
}) {
  useLocale();
    const p = usePalette(), [image, setImage] = useState<string | null>(null);
    useEffect(() => {
        let live = true, sequence = 0;
        let unsubscribe: (() => void) | undefined;
        let session: ReturnType<typeof import('../services/avatarService').createAvatarSession> | undefined;
        if (uid)
            try {
                const service = require('../services/avatarService') as typeof import('../services/avatarService');
                const { auth } = require('../services/firebaseConfig');
                if (auth.currentUser?.uid) {
                    session = service.createAvatarSession(auth.currentUser.uid, () => { live = false; setImage(null); });
                    const reload = () => { const request = ++sequence; void session!.read(uid).then(v => { if (live && request === sequence)
                        setImage(v.image); }).catch(() => { if (live && request === sequence)
                        setImage(null); }); };
                    reload();
                    unsubscribe = service.onAvatarChanged?.(changed => { if (changed === uid) {setImage(null);reload();} });
                }
            }
            catch { /* Initials remain available offline. */ }
        return () => { live = false; unsubscribe?.(); session?.dispose(); };
    }, [uid]);
    const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: p.mint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{image ? <Image source={{ uri: image }} accessibilityLabel={tr("{0} profile picture", {"0": name})} style={{ width: size, height: size }} onError={() => setImage(null)}/> : <Copy style={{ color: p.accent, fontWeight: '700', fontSize: 22 }}>{initials}</Copy>}</View>;
}
export function AvatarEditor({ uid }: {
    uid: string;
}) {
  useLocale(); return <AvatarEditorSession key={uid} uid={uid}/>; }
function AvatarEditorSession({ uid }: {
    uid: string;
}) {
  useLocale();
    const [view, setView] = useState<AvatarView | null>(null), [photo, setPhoto] = useState<AvatarImage | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const alive = useRef(true), lock = useRef(false), selected = useRef<AvatarImage | null>(null);
    const session = useRef<ReturnType<typeof import('../services/avatarService').createAvatarSession> | null>(null);
    useEffect(() => { alive.current = true; try {
        session.current = require('../services/avatarService').createAvatarSession(uid, () => { alive.current = false; setView(null); setPhoto(null); void selected.current?.dispose(); setError(tr("Session changed. Reopen your profile.")); });
        void session.current!.read().then(v => { if (alive.current)
            setView(v); }).catch(() => { if (alive.current)
            setError(tr("Unable to load picture. Retry.")); });
    }
    catch {
        setError(tr("Picture service unavailable."));
    } return () => { alive.current = false; session.current?.dispose(); void selected.current?.dispose(); }; }, [uid]);
    async function run(action: () => Promise<void>) { if (lock.current)
        return; lock.current = true; setBusy(true); setError(null); try {
        await action();
    }
    catch {
        if (alive.current)
            setError(tr("Picture change not confirmed. Reload to check, retry a pending upload, or choose another image. Your account remains usable."));
    }
    finally {
        lock.current = false;
        if (alive.current)
            setBusy(false);
    } }
    async function reload() { if (session.current) {
        const v = await session.current.read();
        if (alive.current)
            setView(v);
    } }
    return <View style={{ gap: 12 }}><Copy variant="heading">{tr("Profile picture (optional)")}</Copy>{(photo?.uri || view?.image) && <Image source={{ uri: photo?.uri ?? view!.image! }} style={{ width: 96, height: 96, borderRadius: 48 }} accessibilityLabel={tr("Profile picture preview")}/>}<Notice message={error}/>
 <Action secondary title={tr("Choose profile picture")} disabled={busy} onPress={() => void run(async () => { const next = await (require('../services/avatarService') as typeof import('../services/avatarService')).chooseAvatar(); if (!next)
        return; if (!alive.current) {
        await next.dispose();
        return;
    } await selected.current?.dispose(); selected.current = next; setPhoto(next); })}/>
 {photo && <><Action title={tr("Save profile picture")} disabled={busy || !view} onPress={() => void run(async () => { await session.current!.upload(photo, view!.revision); await reload(); await photo.dispose(); selected.current = null; if (alive.current)
        setPhoto(null); })}/><Action secondary title={tr("Cancel picture selection")} disabled={busy} onPress={() => void run(async () => { await photo.dispose(); selected.current = null; if (alive.current)
        setPhoto(null); })}/></>}
 <Action secondary title={tr("Reload profile picture")} disabled={busy} onPress={() => void run(reload)}/>
 {view?.pending && <Action title={tr("Retry pending picture upload")} disabled={busy} onPress={() => void run(async () => { await session.current!.recover(view); await reload(); })}/>}
 {(view && (view.revision > 0 || view.pending)) && <Action danger title={tr("Remove profile picture")} disabled={busy} onPress={() => void run(async () => { await session.current!.remove(view!.revision); await selected.current?.dispose(); selected.current = null; if (alive.current)
        setPhoto(null); await reload(); })}/>}
 </View>;
}

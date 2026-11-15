import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable } from 'firebase/storage';
import {isHostedAcademicDemo,academicUpload} from './academicDemo';
import { auth, functions, storage } from './firebaseConfig';
import { onIdentityRefresh } from './authService';
import type {AppointmentPatientDisplay} from '@shared/types/schedulingReads';
const pictureListeners = new Set<(uid: string) => void>();
export function onAvatarChanged(listener: (uid: string) => void) { pictureListeners.add(listener); return () => { pictureListeners.delete(listener); }; }
function changed(uid: string) { pictureListeners.forEach(listener => listener(uid)); }
export type AvatarImage = {
    uri: string;
    dispose(): Promise<void>;
};
export type AvatarView = {
    revision: number;
    image: string | null;
    pending: string | null;
};
export function validateAvatarView(value: unknown): AvatarView {
    const d = value as AvatarView;
    if (!d || !Number.isSafeInteger(d.revision) || d.revision < 0 || !(d.image === null || typeof d.image === 'string' && d.image.length <= 350000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.image)) || !(d.pending === null || typeof d.pending === 'string' && /^[a-f0-9-]{36}$/.test(d.pending)))
        throw new Error('Invalid avatar response');
    return d;
}
export async function chooseAvatar(): Promise<AvatarImage | null> {
    const picker = require('expo-image-picker') as typeof import('expo-image-picker');
    const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: true, aspect: [1, 1], quality: 1, exif: false });
    if (result.canceled)
        return null;
    const file = result.assets[0];
    if (!file || !['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(file.mimeType ?? '') || !file.width || !file.height || file.width * file.height > 40000000 || (file.fileSize ?? Infinity) > 20 * 1024 * 1024)
        throw new Error('Choose a JPEG, PNG or HEIC image under 20 MiB and 40 megapixels.');
    const { manipulateAsync, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const output = await manipulateAsync(file.uri, [{ resize: file.width >= file.height ? { width: Math.min(file.width, 512) } : { height: Math.min(file.height, 512) } }], { compress: .7, format: SaveFormat.JPEG });
    const blobUtil = (require('react-native-blob-util') as typeof import('react-native-blob-util')).default;
    const outputPath = output.uri.replace(/^file:\/\//, '');
    const dispose = async () => { try {
        await blobUtil.fs.unlink(outputPath);
    }
    catch { /* Already removed. */ } };
    try {
        const size=Number((await blobUtil.fs.stat(outputPath)).size);
        if(!Number.isSafeInteger(size)||size<1||size>262144)throw new Error('Image is too large after compression. Choose a simpler image.');
    } catch(error) {await dispose();throw error;}
    return { uri: output.uri, dispose };
}
export function createAvatarSession(uid: string, onInvalidated?: () => void) {
    let disposed = false;
    const tasks = new Set<ReturnType<typeof uploadBytesResumable>>();
    const check = () => { if (disposed || auth.currentUser?.uid !== uid)
        throw new Error('Session changed'); };
    const dispose = () => { if (disposed)
        return; disposed = true; tasks.forEach(t => t.cancel()); tasks.clear(); stop(); };
    const stop = onIdentityRefresh(() => { dispose(); onInvalidated?.(); });
    async function call(name: string, data: unknown) { check(); const result = await httpsCallable(functions, name)(data); check(); if (name === 'changeProfileAvatar' && (data as {
        action?: string;
    }).action !== 'prepare')
        changed(uid); return result.data; }
    return { dispose,
        async read(target = uid) { return validateAvatarView(await call('getProfileAvatar', { uid: target })); },
        async readAppointmentPatient(appointmentId: string): Promise<AppointmentPatientDisplay> {
            if (!/^[a-f0-9]{64}$/.test(appointmentId)) throw new Error('Invalid appointment');
            const result = await call('getProfileAvatar', {appointmentId}) as AppointmentPatientDisplay;
            if (!result || result.appointmentId !== appointmentId || !(result.patientDisplayName === null || typeof result.patientDisplayName === 'string' && result.patientDisplayName.trim().length > 0 && result.patientDisplayName.length <= 200))
                throw new Error('Invalid patient display');
            validateAvatarView({revision:0,pending:null,image:result.patientAvatar});
            return {appointmentId,patientDisplayName:result.patientDisplayName,patientAvatar:result.patientAvatar};
        },
        async remove(revision: number) { return call('changeProfileAvatar', { action: 'remove', expectedRevision: revision }); },
        async recover(view: AvatarView) { if (!view.pending)
            return; return call('changeProfileAvatar', { action: 'finalize', expectedRevision: view.revision, uploadId: view.pending }); },
        async upload(image: AvatarImage, revision: number) {
            const response = await fetch(image.uri);
            const blob = await response.blob();
            try {
                check();
                if (blob.size < 1 || blob.size > 262144)
                    throw new Error('Invalid image size');
                const slot = await call('changeProfileAvatar', { action: 'prepare', expectedRevision: revision }) as {
                    pending: string;
                    storagePath: string;
                };
                if (!slot || !/^[a-f0-9-]{36}$/.test(slot.pending) || slot.storagePath !== `avatars/${uid}/${slot.pending}/image.jpg`)
                    throw new Error('Invalid upload path');
                if(isHostedAcademicDemo()){await academicUpload('avatar',slot.pending,image.uri);}else{
                const task = uploadBytesResumable(ref(storage, slot.storagePath), blob, { contentType: 'image/jpeg' });
                tasks.add(task);
                try {
                    await task;
                }
                finally {
                    tasks.delete(task);
                }
                }
                check();
                await call('changeProfileAvatar', { action: 'finalize', expectedRevision: revision, uploadId: slot.pending });
            }
            finally {
                (blob as Blob & {
                    close?: () => void;
                }).close?.();
            }
        }
    };
}
/** Account creation remains successful regardless of an optional photo failure. */
export async function uploadRegistrationAvatar(uid: string, image: AvatarImage) { const session = createAvatarSession(uid); try {
    const view = await session.read();
    await session.upload(image, view.revision);
}
catch { /* The profile editor exposes pending-upload recovery and fresh selection. */ }
finally {
    session.dispose();
    await image.dispose();
} }

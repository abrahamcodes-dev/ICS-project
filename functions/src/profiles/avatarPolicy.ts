import { HttpsError } from 'firebase-functions/v2/https';
export function avatarInput(value: any): {
    action: 'prepare' | 'finalize' | 'remove';
    expectedRevision: number;
    uploadId?: string;
} {
    if (!value || Array.isArray(value) || (value.action !== 'finalize' && value.uploadId !== undefined) || !['prepare', 'finalize', 'remove'].includes(value.action) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0 || Object.keys(value).some(k => !['action', 'expectedRevision', 'uploadId'].includes(k)) || (value.action === 'finalize' && !(typeof value.uploadId === 'string' && /^[a-f0-9-]{36}$/.test(value.uploadId))))
        throw new HttpsError('invalid-argument', 'Invalid avatar operation.');
    return value;
}
/** Bound dimensions and reject metadata-bearing images; input must be recompressed JPEG. */
export function validateAvatarJpeg(bytes: Buffer) {
    const fail = () => { throw new HttpsError('invalid-argument', 'Use a resized JPEG without embedded metadata (maximum 256 KiB, 512 pixels).'); };
    if (bytes.length < 12 || bytes.length > 262144 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
        fail();
    let offset = 2, dimensions = false;
    while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 255)
            fail();
        const marker = bytes[offset++];
        if (marker === 0xda) {
            if (!dimensions)
                fail();
            return;
        }
        if ([0xe1, 0xed, 0xfe].includes(marker))
            fail();
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length)
            fail();
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
            if (length < 8)
                fail();
            const h = bytes.readUInt16BE(offset + 3), w = bytes.readUInt16BE(offset + 5);
            if (!h || !w || h > 512 || w > 512)
                fail();
            dimensions = true;
        }
        offset += length;
    }
    fail();
}

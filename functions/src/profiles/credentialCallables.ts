import { onCall } from "firebase-functions/v2/https";
import { db, doctorCredentialsCol, storage } from "../shared/firestoreRefs";
import { createCredentialHandlers } from "./credentialHandlers";
import { createCredentialStore } from "./credentialStore";

// Resolve the configured bucket at invocation time, not at module discovery.
const handlers = () => createCredentialHandlers(createCredentialStore(db, doctorCredentialsCol, storage.bucket()));
export const prepareDoctorCredential = onCall(request => handlers().prepare(request));
export const finalizeDoctorCredential = onCall(request => handlers().finalize(request));

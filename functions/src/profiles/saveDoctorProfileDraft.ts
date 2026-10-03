import { onCall } from "firebase-functions/v2/https";
import { db, doctorProfilesCol } from "../shared/firestoreRefs";
import { createDoctorDraftHandler } from "./doctorDraftHandler";
import { createDoctorDraftStore } from "./doctorDraftStore";

export const saveDoctorProfileDraft = onCall(createDoctorDraftHandler(createDoctorDraftStore(db, doctorProfilesCol)));

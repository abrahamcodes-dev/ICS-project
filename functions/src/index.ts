// Entry point — Firebase Cloud Functions deploy target.
// Grouped by the same domains used in the Supervisor Development Guide.

export { onUserCreate } from "./auth/onUserCreate";

export { submitCredentials } from "./verification/submitCredentials";
export { reviewVerification } from "./verification/reviewVerification";

export { setAvailability } from "./scheduling/setAvailability";
export { bookAppointment } from "./scheduling/bookAppointment";

export { startConsultation } from "./consultations/startConsultation";
// signaling.ts is intentionally not exported yet — see open decision comment in that file.

export { issuePrescription } from "./prescriptions/issuePrescription";
export { rateDoctor } from "./ratings/rateDoctor";
export { matchChatbotRule } from "./chatbot/matchRule";

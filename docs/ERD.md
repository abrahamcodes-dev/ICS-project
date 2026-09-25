# Conceptual Data Model (draft)

This is the conceptual model derived in the Supervisor Development Guide
(Section 11), translated into the `shared/types/` TypeScript interfaces.
It is a starting point, not a finished schema — attribute-level detail
should be reviewed with the supervisor before Sprint 2.

```
User (base identity: role, auth link)
  |-- Patient --< HealthProfile
  |-- Doctor  --< DoctorCredential (reviewed by Administrator)

Doctor --< AvailabilitySlot
Patient >--< Doctor  via  Appointment
Appointment --< Consultation (chat/voice/video session)
Consultation --< Prescription
Consultation --< Rating  (by Patient, of Doctor)
ChatbotInteraction (Guest or Patient; not linked to Appointment)
```

Firestore collections implementing this model (see `functions/src/shared/firestoreRefs.ts`):

| Collection | Maps to |
|---|---|
| `users` | `User`, `Patient`, `Doctor`, `Administrator` (discriminated by `role`) |
| `availabilitySlots` | `AvailabilitySlot` |
| `appointments` | `Appointment` |
| `consultations` | `Consultation` |
| `prescriptions` | `Prescription` |
| `ratings` | `Rating` |
| `chatbotInteractions` | `ChatbotInteraction` |

## Open questions
- Should `HealthProfile` and `DoctorCredential` be subcollections or embedded fields?
  Currently modeled as embedded/simple for the prototype; revisit if profiles grow large.
- No attribute list exists in the original proposal beyond four class names —
  confirm these fields are sufficient before building screens against them.

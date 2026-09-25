# Architecture Notes

See the Supervisor Development Guide (Section 8) for the full narrative.
Quick reference for this codebase:

```
[ mobile/ (React Native + Expo) ]        presentation layer
              |
              v
[ functions/ (Node.js / Cloud Functions) ]  application layer
   auth | verification | scheduling | consultations | prescriptions
   | ratings | chatbot | notifications
              |
              v
[ Firestore ]        [ Firebase Storage ]     data layer
```

## Open decisions tracked in code
- `functions/src/consultations/signaling.ts` — WebRTC signaling design not yet chosen.
- `functions/firestore.rules` / `functions/storage.rules` — minimal starter rules, need supervisor review.
- `shared/types/` — attribute-level data model is inferred, not sourced from the original proposal.

# 9H - Local health information assistant

## Question-intent accuracy - 8 November 2026

Current catalog: **50 entries**, including **22 nutrition entries**, and **93
predefined topic/facet answers**, version `2026-11-08.1`. Counts in earlier
checkpoint sections below are historical. All content remains pending clinical review.

### Observed causes and fixes

The sleep-duration question matched the sleep topic but had no recognized duration
facet and no duration answer, so it received default sleep-hygiene text. Pizza had
neither an entity nor a catalog entry and reached the approved unsupported fallback.
The same routing defect was demonstrated for broccoli frequency: it returned food
facts instead of acknowledging that no supported frequency answer existed.

`healthQuestionIntent.ts` now separates deterministic question intent from scored
topic recognition. It classifies definition/explanation, causes, signs/symptoms,
benefits, nutrients, duration, frequency, prevention, safety/limitations,
preparation/alternatives, plus existing children/care requests. Classification is
finite editorial English rules, not inference. Specific intents precede definition;
competing requested facets clarify. Explicit topic plus intent always wins over
prior session context. Only bounded ellipsis/pronoun forms may inherit a topic.
Missing answers use safe fallback or clarification; they never substitute the
default topic response. Definition/explanation uses the entry explanation, with a
sleep-specific override. `followUpKind` remains available for existing callers.

### Authored coverage

- Sleep duration: CDC adult daily guidance, ages 18-60: 7 or more hours;
  ages 61-64: 7-9; ages 65 and older: 7-8. The answer does not assume the user's
  age or prescribe a personal target. Explicit child/teen and numeric-minor
  questions clarify; they do not receive adult targets. No profile age lookup or
  age persistence was introduced.
- Sleep definition, benefits and possible poor-quality signs: fixed educational
  answers. Signs explicitly do not diagnose sleep deprivation or a sleep disorder.
- Pizza: recipe/ingredient variation, portions and overall dietary pattern rather
  than blanket good/bad judgments. Fixed nutrient, general preparation, safety,
  limitations and healthier-alternative answers reuse the nutrition catalog.
- Eating-disorder signs: the existing source-supported awareness response is now
  explicitly registered as a signs answer; no new medical claims were added.
- Frequency classification exists, but no personal food-frequency targets or
  cooking-duration recommendations were invented. Unknown foods/facets remain
  unsupported. Individual portions, allergy advice and restrictive diets retain
  the existing professional-referral boundaries.

### Before/after examples

| Question | Before | Now |
| --- | --- | --- |
| How many hours of sleep are good for me? | Default hygiene advice | Qualified adult age-group duration guidance |
| Is pizza good for me? | Unsupported | Ingredients, portions and dietary-pattern explanation |
| How often should I eat broccoli? | Generic food facts | Approved safe unsupported-facet fallback |
| What are the signs of sleep deprivation? | Default hygiene advice | Fixed poor-quality signs, explicitly not a diagnosis |
| What nutrients are in sleep? | Unsupported | Remains unsupported |

Verified on 8 November 2026: [CDC About Sleep](https://www.cdc.gov/sleep/about/index.html),
[Health Canada pizza/label guidance](https://www.canada.ca/en/health-canada/services/nutrients/sodium/detector/processed-foods.html),
and [WHO Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet).
These sources support general education, not a clinical approval or individualized
assessment. No uniform pizza nutrient quantities were copied or invented.

### Actual validation and limits

**583 unique tests pass across 15 suites**, combining the main focused run with
latest affected-suite replacements. Intermediate failures are recorded in the
[evidence](evidence/health-chatbot-question-intents.json): age-range text encoding,
an outdated expectation for the newly explicit signs facet, and an overbroad safety
rule that misclassified adjectival safe-water wording. All are resolved without
weakening safety assertions. Mobile TypeScript passes; final whitespace evidence
is recorded with the checkpoint results.

New labelled intent evaluation: **26/26**, measuring topic plus requested facet or
expected refusal/fallback. The first and final measured runs both scored 26/26.
This is developer-authored synthetic evaluation, not independent held-out evidence,
clinical validation or a user study. Historical fixtures remain unchanged:
nutrition **32/32**, comparison **23/24** (ambiguous nursing still clarifies),
original held-out **20/20**. Fixture hashes and per-question results are recorded.

Reproduce from `mobile/` with the existing focused command in the nutrition
section below, adding `__tests__/questionIntent.test.js` and
`__tests__/questionIntentEvaluation.test.js`, followed by
`node node_modules/typescript/bin/tsc --noEmit` and `git diff --check`.

Emergency-first handling, clinical refusals, one unchanged disclaimer per response,
guest/patient access and memory-only session isolation remain tested. No Firebase
requests/data changes, transcript persistence, external AI, dependencies or native
configuration changes were added. **Fresh Pixel 7 visual/TalkBack verification:
NOT VERIFIED.** Reload the existing client, ask both observed questions, check an
unsupported frequency question, reset the conversation and ask an ellipsis follow-up
without context. No native rebuild is required. Finite vocabulary, pending clinical
review and lack of independent intent/usability evaluation remain limitations.

## Nutrition intelligence expansion ? 7 November 2026

Current bundled catalog version: `2026-11-07.1`: **49 entries**, including
**21 nutrition entries**, with **82 predefined follow-up answers** across the
catalog (69 nutrition). Earlier catalog counts below are historical evidence.
All content remains **pending clinical review**.

### Observed defect and recognition

Before this checkpoint, ?What foods are good for me?? had no matching pattern,
phrase or keyword, so selection returned none and the service used the approved
fallback. General nutrition now recognizes that question and ?What should I eat
to stay healthy?? through bounded question patterns. Scoring still uses explicit
priorities, phrase specificity and meaningful coverage; it does not infer intent
through a model. Food entities supply explicit phrase evidence. Generic nutrition
and nutrient entries yield to a recognized food, while independent medical topics
and unknown mixed clauses require clarification.

Controlled normalization includes green grams/mung beans ? ndengu,
sukumawiki ? sukuma wiki, balanced plate ? balanced meals, and a finite set of
misspellings (brocolli, brocoli, spinich, avacado, protien, lentiles). No edit-distance
search, learned synonyms or fuzzy override of safety checks was introduced.
Non-food meanings such as Java beans, protein in urine and iron gates do not
select food education. Recognition is finite English coverage, not language understanding.

### Supported education and foods

Coverage includes balanced eating, healthy food choices, food groups, fruit and
vegetables, protein, fibre and digestive health, carbohydrate, fat quality,
vitamins/minerals, iron food sources, hydration, preparation, salt and free sugars.
Supported foods: **broccoli, spinach, sukuma wiki, eggs, bananas, avocados, beans,
lentils, fish, milk, rice, oats, ugali and ndengu**. Leafy greens share one entry;
rice/oats/ugali share one staple entry; beans/lentils/ndengu reuse the existing
whole-grain/pulse entry. Grouping does not imply identical nutrient composition.

Food questions recognize benefits, nutrients and general healthy-food wording.
Fixed contextual forms include ?What are the benefits??, ?What nutrients are in
it??, ?How can I prepare it?? and ?Any limitations??. They use only the identified
entry's exact authored answer. Unsupported facets clarify or use the approved
fallback; unknown topics clear old context. Preparation advice is general safe
handling, not a recipe. There are no nutrient quantities or individual portion,
fluid, supplement or meal prescriptions. Restrictive diets, food-based treatment,
personal allergy questions and individual quantities receive professional referrals.
Emergency checks and medication/diagnosis refusals still run first. Eating-disorder
awareness remains separate from ordinary food advice.

### Verified sources and boundaries

- [WHO Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet): general food groups and nutrients.
- [FAO/Government of Kenya composition tables](https://www.fao.org/food-composition/tables-and-databases/detail/kenya-food-composition-tables/en): qualitative food facts, with table locators in source metadata/evidence. The publisher PDF was downloaded to temporary storage; a readable copy of the same publication was inspected through the browser. No PDF or extracted database was added to the repository.
- [FAO food chapters](https://www.fao.org/4/W0073e/w0073e06.htm): basic food composition only; historical clinical/infant-feeding recommendations were not adopted.
- [WHO Five keys to safer food](https://www.who.int/publications/i/item/9789241594639): general handling guidance.
- [WHO Drinking-water](https://www.who.int/news-room/fact-sheets/detail/drinking-water): water safety, not fluid targets.
- [CDC Healthy Eating Tips](https://www.cdc.gov/nutrition/features/healthy-eating-tips.html): fibre/digestion and protein foods.

Sources were checked on 7 November 2026. Entries retain stable IDs, category,
predefined responses, question patterns, editorial matching metadata, source URLs,
review status and catalog version. Source verification does not establish clinical
approval, suitability for an individual, or endorsement of CallADoc by publishers.

### Actual validation and evaluation

**520 unique tests pass across 13 suites**, using the main 510/510 focused run
plus the latest six affected suites (348/348) after additional follow-ups and
regressions. One intermediate development regression failed because a recognized
phrase fell below the score threshold; explicit phrase specificity fixed it.
Mobile TypeScript passes. Whitespace results and per-question evidence are in
[nutrition evidence](evidence/health-chatbot-nutrition.json).

The separate 32-question synthetic nutrition fixture scored **28/32 initially**.
It exposed everyday food-choice/plate wording, supply-iron wording and a
food-hygiene collision. The fixture and labels remained unchanged; these misses
informed development refinements. Final score: **32/32**, no remaining failures.
This is a **development evaluation**, not held-out generalization or clinical
validation. Existing unchanged fixtures: comparison **23/24** (ambiguous ?nursing
a baby? still clarifies), original held-out **20/20**. Fixture hashes are recorded.
All ten requested example questions resolve to intended entries with one disclaimer.

Reproduce from `mobile/`:

```powershell
node node_modules/jest/bin/jest.js --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js __tests__/healthConversation.test.js __tests__/healthChatbotFinal.test.js __tests__/chatbotEvaluation.test.js __tests__/healthTopicFixes.test.js __tests__/nutrition.test.js __tests__/nutritionEvaluation.test.js __tests__/authNavigation.test.js __tests__/patientExperience.test.js __tests__/onboardingUI.test.js __tests__/theme.test.js
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

The unchanged UI retains per-response disclaimers, safe-area/keyboard handling,
guest/patient navigation and reset/logout/background isolation. No new Firebase
requests, transcript storage, network inference or dependencies were introduced.
**Fresh Pixel 7 usability/TalkBack verification: NOT VERIFIED.** Reload the existing
client (no rebuild), ask the observed food question, then ask broccoli nutrients,
preparation and limitations. Check an unsupported food, a mixed medical topic and
an emergency phrase; reset/leave chat and confirm follow-up context is gone.
Clinical review and independent nutrition evaluation remain required.

## Pixel 7 reported topic fixes ? 6 November 2026

Current catalog version: `2026-11-06.3`, **33 entries and 13 fixed follow-up answers**.
Coverage: symptoms 6, common diseases 6, maternal/child health 5, nutrition 5,
mental health 6, medication guidance 5. All content remains **pending clinical review**.

The eating-disorder question previously had no catalog entry and correctly reached
the safe fallback. The cold question also had no entry, but the broad causes-question
facet incorrectly forced contextual clarification. Explicit supported topics now
resolve before conversation context; explicit unsupported topics/aspects use the
approved verified-doctor fallback. Only bounded referential/incomplete questions
request context. Bare ?cold? and ?nursing? remain ambiguous; cold weather, water,
feet and sores are not mapped to a respiratory infection. Missing contextual
facets are never synthesized, and unsupported responses clear the prior topic.

- ?What are signs of an eating disorder??: unknown ? eating-disorder awareness.
- ?What causes a cold??: clarification ? fixed common-cold causes answer.
- ?What causes eczema??: clarification ? safe unsupported-topic fallback.
- ?What causes it?? without context: clarification remains unchanged.

Source verification used the actual WHO [hMPV Q&A](https://www.who.int/news-room/questions-and-answers/item/human-metapneumovirus-(hmpv)-infection)
and [Mental disorders fact sheet](https://www.who.int/news-room/fact-sheets/detail/mental-disorders).
The former supports a conservative viral-cold explanation, explicitly identifying
hMPV as only one example; the latter supports general eating-disorder awareness.
Neither new entry diagnoses, prescribes, gives individualized dosing or provides
a treatment plan. Source verification is not clinical approval.

Every response still contains one unchanged approved disclaimer. Its own separated
?Medical guidance? section uses 16-point text, spacing, a divider and muted theme
color. One accessible response label includes the complete answer and disclaimer;
only the latest reply announces. Automated light/dark contrast and UI semantics
pass, but fresh Pixel 7 visual/TalkBack verification is **NOT VERIFIED**.

Fresh checks: **351 unique tests pass across 11 suites**, combining the initial
350/351 run with the affected UI suite's 35/35 rerun after fixing a test selector
that double-counted native wrappers. Mobile TypeScript passes. Original synthetic
fixtures are unchanged: comparison **23/24**, held-out **20/20**. The comparison
failure remains the intentionally ambiguous ?Information on nursing a baby?. These
are development evaluations, not clinical or independent usability validation.
Detailed traces, fixture hashes and test evidence: [topic-fix evidence](evidence/health-chatbot-topic-fixes.json).
Earlier counts and evidence below are historical, not current catalog totals.

Manual Pixel 7 check: reload Metro's existing development client, open Health
assistant as guest or patient, submit both reported inputs, inspect the separated
disclaimer in light/dark themes, and use TalkBack to confirm one complete latest
response announcement. Ask a contextual ?What causes it??, then reset or leave
and reopen chat to confirm that context is gone. No Firebase data changes required.

## Independent commit-snapshot finalization — 6 November 2026

This section records fresh isolated-snapshot checks, superseding the earlier
working-tree test counts for the finalized commits. Baseline: `c2ae9b2695728c5a3c8a4c7031f2c87d1af672c5`.
The earlier 308/321-test reports, hashes and Pixel 7 observations below are retained
as historical evidence from a broader dirty working tree, not results from these
commit snapshots. No fresh Android accessibility or clinical verification is claimed.

| Candidate snapshot | Independently validated tests | TypeScript | Whitespace |
| --- | --- | --- | --- |
| Shared theme foundation: approved seven files/theme hunks only | **461/461**, 41 mobile suites | PASS | PASS |
| Theme foundation + approved 17-file chatbot bundle | **292/292**, nine focused suites | PASS | PASS |

The theme run initially had one 5-second scheduling test timeout; its entire
20-test suite passed on a targeted rerun without source or timeout changes. The
chatbot run initially had one 5-second UI timeout; all 34 UI cases passed on a
targeted rerun without source or timeout changes. Totals combine each initial run
with only the affected suite's successful rerun; no failed assertions remain.

Staged whitespace checks also removed an extra EOF blank line from the approved
theme test and knowledge-base file. All six theme tests and 116 knowledge/final-
safety cases passed again; no medical wording or evaluation fixtures changed.

Snapshots use HEAD's existing footer-based guest Login access and registration
guards. They deliberately exclude the uncommitted Google authentication, avatars,
consent, registration recovery and patient/doctor redesigns. The chatbot navigation
test accepts either the existing footer action or the newer onAssistant callback,
while requiring login mode, a callable action, no premature navigation, and exactly
one navigation to Chatbot. The theme-only RootNavigator and authentication-test
mock hunks omit registrationOpen and the appended registration tests.

The comparison benchmark remains **23/24**; the former held-out regression set
remains **20/20**, with original fixture bytes and labels unchanged. The nursing
mismatch intentionally asks for clarification. These are synthetic engineering
measurements, not clinical validation or newly independent held-out evidence.

Reproduce the finalized chatbot snapshot without the deferred onboarding tests:

```powershell
npm --prefix mobile run typecheck
npm --prefix mobile test -- --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js __tests__/healthConversation.test.js __tests__/healthChatbotFinal.test.js __tests__/chatbotEvaluation.test.js __tests__/authNavigation.test.js __tests__/patientExperience.test.js __tests__/theme.test.js
git diff --check
```

For the theme prerequisite alone, run the complete mobile Jest suite with
`npm --prefix mobile test -- --runInBand`, plus TypeScript and whitespace checks.
The `independentCommitSnapshots` field in
[evidence/health-chatbot-android-usability.json](evidence/health-chatbot-android-usability.json)
contains per-suite results, exact candidate file sets and source hashes. All
medical content remains pending clinical review; the previously documented native
TalkBack, guest/logout and full software-keyboard limitations remain.


## Final Android usability and accessibility checkpoint — 6 November 2026

**Status: PARTIAL.** The focused UI fix and automated regressions pass. The table
below separates observed Android behavior from remaining manual checks; this
section supersedes the earlier keyboard/theme/device limitations where verified.
Evidence: [health-chatbot-android-usability.json](evidence/health-chatbot-android-usability.json).
The Checkpoint 4 JSON remains an historical snapshot, including its earlier UI hash.

### Fix and accessibility changes

The two lower limitation/safety notices were in a fixed footer. Android's floating
keyboard toolbar could overlay them without reporting a window resize. In
`mobile/src/screens/shared/ChatbotScreen.tsx`, the notices now appear **verbatim in
scrollable content**, above the conversation. Each remains accessible/selectable;
the approved disclaimer still appears once in each welcome/assistant reply.

The focused Android composer reserves an additional 72dp for the observed floating
toolbar. A labelled, 44dp-wide **Dismiss keyboard** control dismisses the keyboard,
blurs the input and releases this space. The input exposes a Send return-key action,
supports keyboard submission, uses the current keyboard appearance and explains
its privacy boundary in an accessibility hint. No native configuration changed.

The heading has a heading role; the decorative robot is excluded from accessibility.
User utterances are grouped with a “You:” label. Only the latest assistant response
has an active live region: polite normally, assertive/alert for emergency guidance.
Older responses remain readable but no longer retain automatic announcement roles.
Disclaimers are part of the accessible response text, not separate repeated alerts.
These semantics were regression-tested; actual TalkBack speech remains unverified.

### Exact verification results

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Lower floating-toolbar obstruction | VERIFIED on Pixel 7 | Temporary screenshots show the horizontal toolbar below the focused composer; notices are scrollable above it. This does not guarantee clearance for every movable overlay or IME size. |
| Patient-side typing and Send button | VERIFIED | Synthetic question submitted and the response/disclaimer inspected in the native hierarchy and screenshot. |
| Enter-key submission | VERIFIED | ADB Enter submitted “What causes it”, cleared input and displayed clarification. |
| Explicit keyboard dismissal | VERIFIED | Direct Dismiss keyboard tap removed the focused-input control; native hierarchy reported zero dismiss controls afterward. |
| Scrolling and notice reachability | VERIFIED | Native scroll brought both complete notices into visible bounds; screenshot inspected. |
| Dark appearance | VERIFIED for inspected screen | System dark mode changed response, disclaimer, composer and action colors; screenshot inspected; original light mode restored. Not a participant usability assessment. |
| Text contrast | PASS, automated calculation | Eight text/background pairs per theme meet 4.5:1; minimum **4.965:1** in both. Does not certify every UI state or WCAG compliance. |
| Guest entry and logout/session isolation | PASS automated; native NOT VERIFIED | Mocked navigation, logout/account switch, blur/background/reset regressions pass. Current device session is a patient. |
| TalkBack labels/announcement semantics | PASS automated/static; native spoken behavior NOT VERIFIED | Tests cover heading/input/button labels, accessible notices/disclaimers and latest-only live regions. Native TalkBack activation opened a first-run permission prompt; full focus traversal and spoken output were not validated. |
| Full software-keyboard open/resize/Send/Back | NOT VERIFIED | Floating-toolbar input and dismissal were tested; the full software keyboard was not reliably activated. |
| Large fonts, other devices/IME configurations | NOT VERIFIED | No claim beyond the inspected Pixel 7 configuration. |

Pixel 7: `emulator-5554`, existing development client and Metro. Screenshots and
hierarchies were stored only under the system temporary directory, outside the
repository. Original light mode, disabled TalkBack and horizontal toolbar were
restored. Optional Android Accessibility Suite notifications were declined; no
CallADoc permissions or Firebase records were changed. Only synthetic in-memory
chat messages were used.

Native logout was deliberately not executed: the existing `logoutUser()` calls
`prepareNotificationLogout()`, which can call `setNotificationDevice` to revoke a
registered push token (`mobile/src/services/notificationDevice.ts:32`). Skipping
that security step or writing Firebase data would violate this checkpoint's scope.
No authentication bypass or guest-state override was introduced.

### Automated results and reproducibility

**321 distinct tests passed across ten suites**, including 34 chatbot UI cases and
six existing theme cases. The final results combine the comprehensive run with the
affected 34-test UI rerun. An Android-only test initially used Jest's default iOS
platform and counted Pressable wrappers rather than native accessibility hosts;
the fixture/assertion was corrected and the affected suite passed. No production
changes were needed for those test corrections. Mobile TypeScript and whitespace
checks passed.

All prior chatbot, knowledge, context, final-terminology, evaluation, authentication
navigation, patient workflow and onboarding suites were included. The comparison
benchmark remains 23/24 and the former held-out regression set 20/20. These are
synthetic matching results, not clinical or usability validation.

```powershell
npm --prefix mobile run typecheck
npm --prefix mobile test -- --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js __tests__/healthConversation.test.js __tests__/healthChatbotFinal.test.js __tests__/chatbotEvaluation.test.js __tests__/authNavigation.test.js __tests__/patientExperience.test.js __tests__/onboardingUI.test.js __tests__/theme.test.js
git diff --check
```

Knowledge, matching engine, disclaimer constants, navigation and evaluation-fixture
hashes were checked against Checkpoint 4 and remain unchanged. No dependencies,
Firebase requests/data, persistent transcripts, deployment configuration or legacy
backend were added/changed. No native rebuild is needed. All medical content still
requires clinical review; this checkpoint adds no medical claims.

### Exact remaining manual procedure

1. **Guest:** on an already signed-out test client, open Login → Continue with
   health assistant. Ask “healthy eating” and an unsupported question; check the
   response/disclaimer, Back and Sign in for consultations navigation.
2. **Logout:** when notification-token revocation is permitted, seed a topic as a
   synthetic patient, use the existing Profile → Sign out, reopen the guest assistant
   and ask “What causes it?”. Expect clarification and no previous transcript.
   Repeat with a different synthetic account. Never bypass normal logout revocation.
3. **TalkBack:** Android Settings → Accessibility → TalkBack → On. Finish any
   first-run prompts (notification permission is not required). Return to the
   assistant; swipe right through Back/heading, notices/welcome, suggestions or
   messages, actions and composer. Confirm visual-order traversal, decorative-image
   exclusion and meaningful control labels. Submit a general query and a synthetic
   emergency query; listen for complete response/disclaimer announcements without
   re-announcing every historical reply. Confirm no unexpected focus jump. Turn
   TalkBack off afterward if that was the original setting.
4. **Software keyboard:** focus the composer; floating-toolbar menu → Show on-screen
   keyboard. With the full keyboard visible, type and submit using IME Send and the
   screen button; scroll long replies to the complete disclaimer and safety notices.
   Test Android Back and Dismiss keyboard; verify input/message visibility, no
   overlap and no unintended navigation. Repeat in dark mode and with larger text.

Files changed: `ChatbotScreen.tsx`, `healthChatbotUI.test.js`, this document and
`docs/evidence/health-chatbot-android-usability.json`.

## Checkpoint 4 — final verification and academic evidence (6 November 2026)

This section is the final verified state and supersedes historical checkpoint
results below. The catalog remains version `2026-11-06.2`: **31 entries, six
categories and ten predefined follow-up answers**, all pending clinical review.
Only matching logic changed in this checkpoint; no medical response or source
metadata was changed. Machine-readable results, fixture hashes and source hashes:
[health-chatbot-checkpoint-4.json](evidence/health-chatbot-checkpoint-4.json).

### A. Requirements compliance matrix

PASS describes observed implementation/test compliance, not clinical approval.
PARTIAL identifies finite coverage or unfinished validation. No architectural
requirement below was found wholly unimplemented (FAIL).

| Approved requirement / control | Result | Source and observed evidence |
| --- | --- | --- |
| Deterministic rule-based assistant; predefined replies | PASS | [`healthMatcher.ts:38`](../mobile/src/services/healthMatcher.ts#L38), [`chatbotService.ts:50`](../mobile/src/services/chatbotService.ts#L50): fixed scoring, priority, coverage and clarification; repeated-output tests pass. |
| Guest and registered-user access without a consultation | PASS | [`GuestNavigator.tsx:21`](../mobile/src/navigation/GuestNavigator.tsx#L21), [`PatientNavigator.tsx:30`](../mobile/src/navigation/PatientNavigator.tsx#L30), [`ChatbotScreen.tsx:59`](../mobile/src/screens/shared/ChatbotScreen.tsx#L59): guests and active registered patients; guest/patient navigation regressions pass; patient route observed on Pixel 7. Doctors are intentionally outside the existing assistant access scope. |
| General health information and simple health tips | PASS | [`healthKnowledgeBase.ts:101`](../mobile/src/knowledge/healthKnowledgeBase.ts#L101): fixed educational content; no examination, patient-specific assessment or treatment plan. |
| All six knowledge categories | PASS | [`chatbotCategories.ts:2`](../mobile/src/constants/chatbotCategories.ts#L2), [`healthKnowledgeBase.ts:101`](../mobile/src/knowledge/healthKnowledgeBase.ts#L101): symptoms/general 6; diseases, maternal/child, nutrition, mental health, medication 5 each. |
| Explicit keywords/phrases and a curated knowledge base | PASS | [`healthKnowledgeBase.ts:34`](../mobile/src/knowledge/healthKnowledgeBase.ts#L34), [`healthMatcher.ts:38`](../mobile/src/services/healthMatcher.ts#L38): typed matching metadata, stable IDs, finite substitutions and score thresholds; no learned model. |
| Credible source provenance | PASS | [`healthKnowledgeBase.ts:6`](../mobile/src/knowledge/healthKnowledgeBase.ts#L6), [`healthKnowledgeBase.ts:89`](../mobile/src/knowledge/healthKnowledgeBase.ts#L89): WHO title/URL/verification date per entry, version and review status. The verified Checkpoint 2 source register is below; no MoH, peer-reviewed or clinical approval claim is invented. |
| Appropriate rule selection across unrestricted questions | PARTIAL | [`healthMatcher.ts:58`](../mobile/src/services/healthMatcher.ts#L58): competing/weak evidence clarifies; exact benchmark 23/24, former held-out set 20/20. English terminology/context coverage is finite. |
| Unsupported queries refer to a verified doctor | PASS | [`chatbotService.ts:45`](../mobile/src/services/chatbotService.ts#L45), [`chatbotService.ts:82`](../mobile/src/services/chatbotService.ts#L82): clarification and unknown replies explicitly refer to a verified CallADoc doctor. |
| Every assistant reply includes the approved disclaimer once | PASS | [`disclaimers.ts:1`](../mobile/src/constants/disclaimers.ts#L1), [`chatbotService.ts:12`](../mobile/src/services/chatbotService.ts#L12), [`ChatbotScreen.tsx:45`](../mobile/src/screens/shared/ChatbotScreen.tsx#L45): one composer, no UI duplication; all 31 entry examples, all ten follow-ups and response-path tests pass. |
| No external generative AI or third-party inference | PASS | [`chatbotService.ts:1`](../mobile/src/services/chatbotService.ts#L1), [`healthMatcher.ts:1`](../mobile/src/services/healthMatcher.ts#L1): imports lead only to bundled rules/data/constants. Targeted dependency inspection found no assistant AI SDK or inference client. |
| Emergency-first behavior and clinical refusals | PARTIAL | [`chatbotService.ts:32`](../mobile/src/services/chatbotService.ts#L32), [`chatbotService.ts:56`](../mobile/src/services/chatbotService.ts#L56): emergency checks precede boundaries and scoring; regression cases and 8/8 evaluation safety cases pass. Regex coverage is not comprehensive triage or clinical safety validation. |
| Local privacy and isolated session context | PASS | [`chatbotService.ts:87`](../mobile/src/services/chatbotService.ts#L87), [`ChatbotScreen.tsx:14`](../mobile/src/screens/shared/ChatbotScreen.tsx#L14): memory-only topic/transcript; reset/background/unmount/account/focus isolation tests pass. Pixel 7 reset and background/return also verified. |
| Clinical review and real-device usability validation | PARTIAL | [`healthKnowledgeBase.ts:90`](../mobile/src/knowledge/healthKnowledgeBase.ts#L90): review remains pending; one-emulator smoke checks are documented below, not a usability study. |

The local engine/catalog/matcher contain no Firebase SDK imports, HTTP client,
analytics calls or persistent-store operations. The UI uses existing auth and
theme providers; their application-wide Firebase/preferences behavior is not a new
chatbot request or transcript store. The legacy Functions chatbot is still not
exported by `functions/src/index.ts` and is not invoked. No backend, dependency,
Firebase configuration or emulator-record changes were made. This conclusion is
from targeted source/import inspection and behavioral tests, not packet capture.

### B. Terminology corrections and final regression results

- “Raised blood pressure” now maps by an exact bounded phrase to “high blood
  pressure”. Bare “raised pressure” remains ambiguous. Emergency/medication/diagnosis
  guards still run before matching. This does not interpret a patient's measurements.
- “Nursing” is not silently translated to breastfeeding. It now clarifies even
  when “baby” would otherwise choose generic maternity guidance. Explicit
  breastfeeding terminology can identify that topic. Safety guards still take priority.
- Evaluation fixtures and labels were **not modified**. Their SHA-256 hashes were
  captured before edits and confirmed unchanged after testing; see the JSON evidence.

| Final run | Passed | Failed |
| --- | ---: | ---: |
| Core safety/intent engine | 61 | 0 |
| Knowledge-base coverage/metadata/disclaimers | 89 | 0 |
| Conversational matching/context | 54 | 0 |
| Final terminology/all-follow-up regressions | 27 | 0 |
| Chatbot UI/privacy/session isolation | 27 | 0 |
| Patient workflow | 25 | 0 |
| Authentication navigation | 14 | 0 |
| Onboarding UI | 9 | 0 |
| Two evaluation runners | 2 | 0 |
| **Total: nine suites** | **308** | **0** |

Mobile TypeScript (`tsc --noEmit`) and `git diff --check` passed. Evaluation runners
contain 44 labelled cases; those cases are **not** 44 additional Jest tests. A
passing evaluation runner validates repeatability/disclaimers/safety assertions
and reports matching results; it does not assert every topic label matched.

| Unchanged dataset | Checkpoint 3 | Final Checkpoint 4 | Exact failures |
| --- | ---: | ---: | --- |
| Comparison benchmark | 23/24 (95.8%) | **23/24 (95.8%)** | “Information on nursing a baby”: label `child-breastfeeding`, actual `clarification`. |
| Former held-out evaluation | 19/20 (95.0%) | **20/20 (100%)** | None. |

The nursing mismatch is retained transparently: the label expects one interpretation
of an ambiguous expression. It was not relabelled to inflate results. The raised-BP
case improved after a targeted known-defect fix. Consequently the **former** held-out
set is now known regression data, not fresh held-out generalization evidence.
Both sets are small, synthetic and implementer-labelled. These percentages measure
exact topic/intent agreement, not medical correctness, clinical sensitivity or usability.
Each dataset's four safety-labelled cases passed (8/8 total), without implying
comprehensive emergency coverage.

Reproduce from the repository root (PowerShell):

```powershell
Push-Location mobile
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js __tests__/healthConversation.test.js __tests__/healthChatbotFinal.test.js __tests__/chatbotEvaluation.test.js __tests__/authNavigation.test.js __tests__/patientExperience.test.js __tests__/onboardingUI.test.js --json --outputFile "$env:TEMP\calladoc-chatbot-cp4-jest.json"
Pop-Location
git diff --check
Get-FileHash mobile/__tests__/fixtures/chatbotEvaluation.json,mobile/__tests__/fixtures/chatbotHeldOut.json -Algorithm SHA256
```

### C. Remaining defects, limits and clinical review

No new blocking architectural defect was found. The benchmark nursing mismatch,
finite spelling/synonym vocabulary, incomplete symptom/emergency coverage, negated
and hypothetical emergency false positives, and single-topic clarification are
explicit limitations. Only ten topic/facet follow-ups are supported; missing facets
clarify instead of synthesizing advice. Unsupported personalized requests may receive
fallback/clarification rather than a specific refusal, but no treatment is generated.
Pattern-matched education must not be interpreted as diagnosis or reassurance.

All 31 entries and ten follow-ups remain pending qualified clinical review. Source
metadata and tests do not establish safety, diagnostic accuracy, local guideline
conformance or clinical approval. No participant study, usability score, clinician
endorsement, production deployment or clinical outcome was observed or claimed.

### D. Android evidence and remaining manual checks

Observed: connected `Pixel_7` AVD, `emulator-5554`, Android API 35, 1080×2400;
Metro listening on 127.0.0.1:8081. The authenticated patient assistant was open.
Non-destructive synthetic interactions confirmed:

1. The rule-based UI, readable response bubbles and single approved disclaimer.
2. “Explain raised blood pressure” → hypertension education.
3. “Information on nursing a baby” → clarification.
4. “What dose for raised blood pressure” → medication refusal.
5. “Explain malaria” → “What causes it” → the fixed sourced causes answer.
6. “My baby is not breathing” → urgent guidance before the disclaimer.
7. Reset → “What causes it” → clarification, not an old topic.
8. Seed a topic, background with Android Home, return to the existing activity:
   zero old assistant turns; “What causes it” → clarification.

Screenshots and UI hierarchies were captured under the system temporary directory,
outside the repository, and inspected. The chat was reset afterward. No account,
appointment or other emulator data was created/changed; no logout, rebuild or
emulator reset was performed. Native observations cover one patient session in
the current light theme. Native guest entry and native account switching were not tested.

Observed UI issue: while input was focused, Android's floating hardware-keyboard
toolbar overlapped part of the lower static notice. Full software-keyboard behavior
was not tested. This remains a usability follow-up, not a claimed visual PASS.

Short remaining manual checklist:

- From a signed-out test session, Login → Health assistant; verify the same general
  questions/fallback and sign-in link without requiring a consultation.
- In both light/dark themes, test small-screen scrolling, long answers, large text,
  TalkBack labels/focus, software keyboard open/close and the lower safety notice.
- With synthetic accounts, verify logout/account switch and navigation away/back
  clear topic and transcript. Automated tests already cover these lifecycle paths.
- Confirm emergency, refusal, unknown and clarification messages remain readable
  and each contains exactly one approved disclaimer. Do not use real clinical data.

No native rebuild is required for this JavaScript-only change. Existing development
client + Metro is sufficient; no production Firebase or dependency setup is needed.

### E. Chapter 4 / Chapter 5 evidence summary

**Chapter 4 — implementation:** CallADoc implements a local deterministic health
assistant using explicit patterns, phrase/keyword scoring and predefined responses.
A versioned WHO-referenced catalog contains 31 educational entries in six approved
categories and ten fixed contextual follow-up answers. Emergency matching precedes
clinical boundaries and topic selection. Guest and active-patient navigation,
single disclaimers and memory-only conversation cleanup are implemented. No LLM,
third-party inference service or chatbot transcript persistence is present in the
audited path. All medical content remains pending clinical review.

**Chapter 5 — evaluation:** Nine focused suites passed 308 Jest tests; mobile
TypeScript and whitespace checks passed. Unchanged synthetic datasets produced
23/24 comparison matches and 20/20 former held-out matches; the sole mismatch was
an ambiguous nursing question that triggered clarification. The previously held-out
data is no longer independent after its terminology defect was explicitly addressed.
Pixel 7 patient-session smoke checks observed education, clarification, refusal,
emergency precedence and reset/background topic isolation. Native guest flow,
software-keyboard/accessibility/theme usability and clinical safety remain unverified.
No human-participant, clinical-approval or deployment claims follow from these results.

### F. Files changed in Checkpoint 4

- `mobile/src/services/healthMatcher.ts`: bounded raised-BP synonym; nursing ambiguity.
- `mobile/__tests__/healthChatbotFinal.test.js`: 27 terminology, safety and all-follow-up cases.
- `docs/HEALTH_CHATBOT_MOBILE.md`: final audit, reproducibility and academic summary.
- `docs/evidence/health-chatbot-checkpoint-4.json`: measured counts, outcomes, hashes and device scope.

## Enhancement Checkpoint 3 — deterministic conversational matching

Current catalog version: **2026-11-06.2**, still 31 entries across six categories,
all **pending clinical review**. Stable IDs and source metadata are preserved.
The Checkpoint 2 source register below still applies. Ten fixed topic/facet answers
were added under five existing entries: malaria (causes/prevention/children/care),
diarrhoea (prevention/children/care), and headache/cough/anxiety (care). Each inherits
its entry's sources, version and review status. Malaria prevention/child-risk facts
were rechecked against the linked WHO malaria fact sheet on 6 November 2026.
No response is assembled from unrelated entries or generated from user history.

### Architecture and matching contract

- `knowledge/healthKnowledgeBase.ts`: single catalog, explicit matching metadata
  (display label, priority, phrases, keywords, specific-over-generic relationships)
  and optional source-backed follow-up text. Catalog order no longer selects answers.
- `services/healthMatcher.ts`: normalization, exact curated synonyms/spelling
  substitutions, transparent scoring, ambiguity handling and bounded follow-up forms.
- `services/chatbotService.ts`: safety-first orchestration and the existing
  disclaimer composer. `askChatbot(question)` remains a stateless compatible entry
  point; optional `{knowledgeId}` context is supported. `createHealthChatSession()`
  owns only the previous matched topic ID in memory and exposes `ask`/`reset`.
- `screens/shared/ChatbotScreen.tsx`: one session per mounted conversation. Reset,
  backgrounding and unmount clear context; existing focus/account keys also destroy
  it on navigation, account switch and logout. The existing 20-turn limit remains.
  No transcript/context storage, Firebase call, analytics or network inference exists.

Processing order: normalize → check emergency patterns against both original and
curated-normalized text → medication/diagnosis boundaries against both → score
knowledge candidates → clarify or choose → supported follow-up → existing fallback.
Medication education requires the original complete-question allowlist. Spelling
correction never grants a medication-education exception. No edit-distance search,
arbitrary stemming, external model or learned threshold is used.

Score = 6 + explicit priority + 4 × longest matched phrase length +
3 × matched keyword count (capped at three) + rounded 8 × meaningful-token coverage.
Coverage excludes a fixed stop-word list and counts exact pattern/phrase/keyword
evidence. Sort ties by stable ASCII ID. Explicit parent relationships remove generic
candidates, e.g. infant feeding over general baby information or pulses over general
diet. Remaining independent candidates always clarify, even if scores differ;
near ties therefore cannot silently force an answer. Minimum score is 10; sparse
coverage below 0.15 also clarifies when score is below 18. These are editorial
heuristics, **not calibrated confidence probabilities**. Unsupported extra clauses
such as “malaria and astronomy” clarify rather than returning unrelated advice.

Synonyms are controlled phrases such as high BP → high blood pressure, hand washing
→ handwashing, trouble sleeping → sleep, and runny stools → loose stools. Spelling
tolerance is a finite reviewed-in-code list, e.g. malairia → malaria; unknown words
are never guessed. Negation does not suppress emergency alerts. This remains a
conservative safety net, not comprehensive triage or natural-language understanding.

Follow-ups use exact bounded forms, including “What causes it?”, “How can I prevent
it?”, “What about children?” and “When should I see a doctor?”. They require a
current topic and a matching predefined facet answer. An explicit new topic takes
precedence over old context. Missing facets/topic, ambiguity, unsupported follow-ups
or safety responses invalidate previous context. Invalid input does not create a
turn. Ordinary answers, refusals, emergencies and clarification each contain exactly
one approved disclaimer.

### Measured verification

Eight focused Jest suites: **281 tests passed** (279 development/navigation/UI tests
plus two evaluation runners). Evaluation runners contain 44 labelled cases, count
exact topic-ID/intent agreement, check determinism/disclaimers and assert their
safety cases. They report accuracy without fitting a minimum success threshold;
passing a runner does not mean every labelled case matched.

| Dataset | Method | Correct / total | Accuracy |
| --- | --- | ---: | ---: |
| Comparison benchmark, Checkpoint 2 baseline | Actual pre-change engine run | 10/24 | 41.7% |
| Same comparison benchmark, Checkpoint 3 | Actual updated engine run | 23/24 | 95.8% |
| Separate held-out evaluation | Authored after rules froze; no tuning after results | 19/20 | 95.0% |

`__tests__/healthConversation.test.js` contains labelled development cases used for
implementation. `fixtures/chatbotEvaluation.json` is the comparison benchmark;
its baseline results were inspected before implementation, so **it is not blind
held-out evidence**. `fixtures/chatbotHeldOut.json` is separate and was not used to
tune rules. Both evaluation sets are small, synthetic, English and authored by the
implementer, not independently sampled or clinically labelled. No clinical accuracy,
population generalization or emergency-detection sensitivity is claimed. All four
safety-labelled cases in each evaluation set matched; this is not exhaustive.

A subsequent code review extended the existing unsupported-clause check to “or”
and “but”, with two development regressions. This was not derived from held-out
errors; evaluation labels and terminology rules were unchanged and both evaluation
sets were rerun with unchanged scores.

Actual comparison examples:

| Query | Before | After |
| --- | --- | --- |
| Explain high BP in simple words | Unknown | Hypertension education |
| Tell me about the sugar disease | Free-sugar nutrition | Diabetes education |
| Information about maleria | Unknown | Malaria education |
| Tell me about malaria and diabetes | Malaria only | Clarification |
| Explain malaria → What causes it | Unknown follow-up | Fixed malaria causes answer |

Known evaluation misses are retained rather than tuned away: “nursing a baby”
returns general infant/maternity guidance instead of the benchmark's breastfeeding
label (nursing is itself ambiguous). “Raised blood pressure” asks for clarification
instead of matching hypertension. These demonstrate finite terminology coverage;
the evaluation labels are not clinical truth.

TypeScript and `git diff --check` passed. Focused command:

```sh
npm --prefix mobile run typecheck
npm --prefix mobile test -- --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js __tests__/healthConversation.test.js __tests__/chatbotEvaluation.test.js __tests__/authNavigation.test.js __tests__/patientExperience.test.js __tests__/onboardingUI.test.js
git diff --check
```

Existing source/refusal/emergency regression tests remain. The old unsupported
stateless-follow-up test now requires clarification instead of unknown, while still
asserting no invented topic and referral to a verified doctor. New UI tests verify
topic isolation on reset, logout, account switch, blur, background and unmount.

### Remaining limitations and device preview

Clinical review is required for all content, follow-up/referral wording and matching
rules. Only ten follow-up facets are supported; no clinical memory, diagnosis,
prescribing, dosing or contextual safety assessment is provided. Spelling/synonym
lists and emergency patterns remain incomplete. Multi-topic questions generally
clarify instead of combining advice; heuristic relevance is not medical relevance.

Android and light/dark visual verification were not performed. No native rebuild
is needed. Reload Metro in the existing Pixel 7 development client; open the health
assistant as guest and patient, ask “Explain malaria” followed by the four supported
follow-ups, test a mixed-topic clarification and dosing refusal, then reset/background
or sign out and confirm “What causes it?” asks for a topic. Verify text wrapping,
keyboard scrolling and both themes. No emulator records need to change.

The earlier checkpoint sections below are historical; this section supersedes their
first-match/stateless-follow-up descriptions and validation counts.

## Enhancement Checkpoint 2 — 6 November 2026

Current active catalog: `mobile/src/knowledge/healthKnowledgeBase.ts`, version
`2026-11-06.1`. **All 31 entries are pending clinical review.** Source verification
is not clinical validation, WHO endorsement or Kenyan clinical approval.

| Category | Entries | Topics |
| --- | ---: | --- |
| Symptoms/general health | 6 | Fever, diarrhoea, headache, cough, handwashing, sleep |
| Common diseases | 5 | Malaria, diabetes, hypertension, tuberculosis, influenza |
| Maternal/child health | 5 | Antenatal/postnatal care, breastfeeding, complementary feeding, vaccination |
| Nutrition | 5 | Varied diet, fruit/vegetables, grains/pulses, salt, free sugars |
| Mental health awareness | 5 | Stress, anxiety, depression, adolescent wellbeing, seeking support |
| General medication information | 5 | Antibiotics, resistance, safety, medicines lists, product quality |

Each entry has a stable ID, approved category, ordered patterns, example question,
fixed response, source objects (title, organization, URL, verification date),
content version and review status. The source registry is in the same file;
`chatbotCategories.ts` supplies the taxonomy. There is one active catalog. The
legacy Functions catalog remains inactive and is not reused.

Matching order: normalization → emergency safety net → medication/diagnosis
boundaries → first matching catalog entry → generic symptom/navigation/greeting
guidance → verified-doctor fallback. Specific entries precede broad ones. Medication
education accepts only listed complete general questions, such as “What are
antibiotics?”. Appending a dosing/personal request fails that allowlist and keeps
the existing refusal. Emergency checks always run first, including for mixed or
negated queries. Replies use the existing single-disclaimer composer and include
`knowledgeId`/`contentVersion` metadata when matched. Nothing is persisted or sent.

### Verified source register

WHO references checked **6 November 2026** are below. The catalog maps each entry
to its source. Content is paraphrased educational information; drug regimens,
individualized diets, dosing and diagnostic thresholds are excluded.

- [Malaria](https://www.who.int/news-room/fact-sheets/detail/malaria) — malaria and fever.
- [Diabetes](https://www.who.int/news-room/fact-sheets/detail/diabetes).
- [Hypertension](https://www.who.int/news-room/fact-sheets/detail/hypertension).
- [Tuberculosis](https://www.who.int/news-room/fact-sheets/detail/tuberculosis).
- [Seasonal influenza](https://www.who.int/news-room/fact-sheets/detail/influenza-(seasonal)) — flu and cough.
- [Diarrhoeal disease](https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease).
- [Headache disorders](https://www.who.int/news-room/fact-sheets/detail/headache-disorders).
- [Community hand hygiene](https://www.who.int/news/item/15-10-2025-new-guidelines-on-community-hand-hygiene-to-help-governments-reduce-the-spread-of-infectious-diseases).
- [Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) — five nutrition entries.
- [Maternal mortality](https://www.who.int/news-room/fact-sheets/detail/maternal-mortality) — skilled maternity care.
- [Postnatal experience](https://www.who.int/news/item/22-02-2024-new-series-highlights-importance-positive-postnatal-experience-all-women-newborns).
- [Infant and young child feeding](https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding).
- [Immunization coverage](https://www.who.int/news-room/fact-sheets/detail/immunization-coverage) — benefits, not a Kenyan vaccine schedule.
- [Stress](https://www.who.int/news-room/questions-and-answers/item/stress) — stress, support, sleep.
- [Anxiety disorders](https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders).
- [Mental disorders](https://www.who.int/news-room/fact-sheets/detail/mental-disorders) — depression awareness.
- [Adolescent mental health](https://www.who.int/news-room/fact-sheets/detail/adolescent-mental-health).
- [Antibiotic resistance leaflet](https://www.who.int/docs/librariesprovider2/default-document-library/what-you-need-to-know-about-antibiotic-resistance-eng-%281%29.pdf?sfvrsn=5d89a70_6).
- [Antimicrobial resistance](https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance).
- [5 Moments for medication safety](https://qualityhealthservices.who.int/quality-toolkit/qt-catalog-item/5-moments-for-medication-safety).
- [Medication safety key messages](https://www.who.int/campaigns/world-patient-safety-day/2022/key-messages) — medicines lists.
- [Substandard/falsified products](https://www.who.int/news-room/fact-sheets/detail/substandard-and-falsified-medical-products).

Topics prioritize concerns relevant to Kenya, using global WHO sources, not locally
validated protocols. No unverified Kenya MoH or peer-reviewed citation is claimed.
Local vaccine schedules and personal decisions are referred to qualified providers.

### Checkpoint 2 validation and limitations

Mobile TypeScript passed. Three focused Jest suites passed **171/171** tests: 82
existing engine/UI cases plus 89 catalog/regression cases. Coverage includes all
categories, unique IDs, metadata, every entry's reachability/determinism/disclaimer,
emergency priority over every entry, clinical refusals, specific-topic ordering and
unsupported follow-ups. Metadata tests do not verify medical truth or live URLs;
source checking was separate. Commands: `npm --prefix mobile run typecheck` and
`npm --prefix mobile test -- --runInBand __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/healthKnowledgeBase.test.js`.

No dependencies, backend, navigation, Firebase requests, transcript stores or
emulator records changed. No Android verification or native rebuild was performed;
reload Metro in the existing client to preview new topics in light/dark mode.

English keyword matching can miss emergencies and misunderstand negation, spelling,
quoted text and compound questions. One ordered response is returned; no multi-turn
clinical inference occurs. The strict medicine allowlist rejects some harmless
paraphrases. This is not triage, diagnosis, personalized treatment or counselling.
Qualified clinical review remains required for responses, boundaries and referrals.
Recheck sources and increment versions on content updates; change review status
only with documented qualified review.

The following Checkpoint 1 section records historical implementation/test evidence;
Checkpoint 2 above supersedes its earlier limited-content inventory.

## Enhancement Checkpoint 1 — 6 November 2026

Implemented the safety/requirement-compliance checkpoint only. The local engine,
guest/active-patient routes and memory-only transcript lifecycle are retained.
There are no new Firebase calls, dependencies, LLMs or transcript stores.

- The engine composes the existing approved `MEDICAL_DISCLAIMER` from
  `mobile/src/constants/disclaimers.ts` exactly once per normal, refusal, fallback
  or emergency reply. The single welcome message uses the same idempotent
  composer. UI rendering does not append a second disclaimer.
- The emergency safety net now checks bounded paraphrases for not/stopped
  breathing, pain/pressure in the chest, taking too many pills/tablets, and a
  swelling throat/tongue **before** every ordinary rule. Existing emergency
  patterns and conservative negation behavior remain. Negation does not cancel
  alerts, including "My baby is not breathing"; false positives remain possible.
- Emergency wording directs users to immediate professional help without
  waiting for an appointment. Possible overdose/poisoning wording does not require
  symptoms to be present. Routine consultation advice is explicitly limited to
  non-emergency concerns before the approved disclaimer is displayed.
- Unsupported questions recommend a verified CallADoc doctor for non-emergency
  advice, without ruling out serious illness or delaying urgent care.
- The default UI identifies a rule-based information assistant, keeps privacy
  and non-triage limitations visible without opening About, and combines the
  initial greeting into one disclaimer-bearing welcome message. Existing
  navigation, care links, mascot, input limits and reset behavior remain.
- The stale Login navigation test now checks the actual `onAssistant` callback,
  exact Chatbot destination and call count without invoking authentication.

Validation: mobile `tsc --noEmit` passed. Across the five focused suites, 130
distinct tests passed: 82 chatbot engine/UI cases plus 48 onboarding, patient
workflow and authentication-navigation cases. After the first run exposed a
missing `take` verb variant in a negated test and JSON-escaped newline comparisons,
only the affected chatbot suites were rerun; all 82 passed. Rendering assertions
now compare the actual full message, including its disclaimer. `git diff --check`
passed. No device visual verification or native rebuild was performed.

The reviewed external references below support conservative escalation, not
validation of these regexes or clinical approval of CallADoc:

- [NHS chest pain](https://www.nhs.uk/symptoms/chest-pain/)
- [NHS poisoning](https://www.nhs.uk/conditions/poisoning/)
- [NHS anaphylaxis](https://www.nhs.uk/conditions/anaphylaxis/)
- [WHO newborn health](https://www.who.int/europe/news-room/fact-sheets/item/newborn-health)

Clinical review is still required for the emergency/referral wording, phrase
list and the presentation of the standard consultation disclaimer following
urgent guidance. No comprehensive triage, contextual understanding, diagnostic
accuracy or clinical validation is claimed. Keyword omissions, hypothetical and
negated-query alerts, English-only coverage and the existing limited knowledge
base remain. Six-category content expansion and source-governance work are
outside Checkpoint 1. UK telephone numbers and treatment instructions were not
copied into the app.

## Architecture and access

`mobile/src/services/chatbotService.ts` is a synchronous, deterministic English
rule engine. Normalization handles case, punctuation and Unicode compatibility
characters. Emergency phrases take priority, then medication/diagnosis boundaries,
then ordered information rules and a conservative fallback. There are no external
AI calls, Firebase reads/writes, analytics, transcript logging or persistence.

The existing guest and patient Chatbot routes render `ChatbotScreen.tsx`.
Login exposes **Health assistant (no sign-in needed)** without altering AuthForm.
Patient Home exposes **Health assistant**. Guests can return to Login; active
patients can open the existing Doctors directory. These actions do not book a
visit or bypass scheduling authorization.

The old unexported Functions chatbot and its shared scaffold types remain inactive;
the mobile client no longer invokes `matchChatbotRule`. Its symptom advice and
interaction logging are not reused. No backend, Rules or dependencies changed.

## Supported intents and safety

- General education: the 31 entries across six categories listed above.
- Pregnancy/infant and symptom entries provide education with professional-care boundaries.
- Medication education is restricted to complete allowlisted general questions;
  personal medicine and diagnosis requests retain explicit refusals.
- Greetings/help, consultation navigation and unrecognized-question fallback.
- Emergency phrases: immediate professional help, without waiting for an appointment.

The assistant does not examine, diagnose, prescribe, assess individual risk or
claim that a problem is harmless. It does not choose medicines or provide dosing.
An always-visible disclaimer and emergency notice supplement keyword matching.
No location-specific emergency number is guessed. Self-harm phrases direct users
to immediate professional assistance without providing harmful details.

This is **not a triage system**: spelling, context and unrecognized expressions can
cause missed matches; negated emergency phrases deliberately still trigger a
warning. False positives are possible. No multi-turn clinical inference occurs.
English-only input is requested, not reliably detected. Content needs clinical
review before real patient reliance.

Historical references used before Checkpoint 2 (current catalog sources are above):

- [WHO healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)
- [NHS handwashing](https://www.nhs.uk/live-well/best-way-to-wash-your-hands/)
- [NHS sleep routines](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/)
- [NHS stress support](https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/)
- [NHS emergency warning signs](https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/)

These references support general content, not validation of the matching algorithm
or endorsement of CallADoc. UK emergency telephone numbers are not copied into the app.

## Session boundaries

Questions are limited to 500 characters; conversations to 20 turns before reset.
The UI uses existing accessible, themed design components. Reset clears input,
messages and errors. Blur/unmount, logout/account changes and backgrounding discard
conversation state. Backgrounding disables input until the app is active again.
No async response can arrive from a previous session because matching is local
and synchronous. No private medical record access is available to guests.

Users are asked not to enter identifying information. Memory-only does not prevent
OS keyboard history, screenshots or shoulder surfing; this is not a secure record
storage interface.

## Focused validation

Commands:

```sh
npm --prefix mobile run typecheck
npm --prefix mobile test -- --runInBand --runTestsByPath __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/patientExperience.test.js __tests__/authNavigation.test.js
git diff --check
```

Tests cover intent determinism, emergency priority, dosing/diagnosis refusal,
unknown and invalid inputs, guest/patient entry, care navigation, reset, account
switch/logout, blur/background cleanup, listener disposal and bounded history.
Historical initial validation: mobile TypeScript passed. The four focused suites passed **62/62** (34 engine,
9 chatbot UI, 7 patient workflow and 12 authentication navigation tests).
The initial UI run had two failures because the Jest AppState fixture was not
foreground; after setting that fixture explicitly and strengthening cleanup
assertions, only the affected nine-test suite was rerun and passed.
Whitespace checks passed. Backend tests were skipped because no backend changed;
no emulator execution or Android build was performed.

## Android verification still required

1. Launch the existing Android development client and Metro through the documented
   local setup; no native rebuild or Firebase deployment is required for this UI.
2. Signed out, open the assistant from Login. Test general topics and an unknown
   question offline. Confirm emergency wording with a synthetic chest-pain query.
3. Test medication/diagnosis refusals, reset, keyboard scrolling, TalkBack and both themes.
4. Background/return, leave/reopen and sign in as a patient; old text must disappear.
5. Open from Patient Home and choose Find a doctor. The real directory/booking flow
   still needs the authorized Firebase backend/emulators; the assistant itself does not.

No Android interaction, clinical usability or emergency-detection accuracy is
claimed as verified by the mock/unit tests.

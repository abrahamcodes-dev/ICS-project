import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React, { useEffect, useRef, useState } from 'react';
import { createRatingSession, validateRatingInput, type ConsultationRating, type DoctorRatingSummary } from '../../services/ratingService';
import { onIdentityRefresh } from '../../services/authService';
import { Action, Card, Copy, Field, Loading, Notice, Status } from '../../ui/design';
import RatingStars from '../../components/RatingStars';
function useRatingSession(uid: string, clear: () => void) {
  const session = useRef<ReturnType<typeof createRatingSession> | null>(null), alive = useRef(false);
  useEffect(() => {
    alive.current = true; const current = createRatingSession(uid); session.current = current;
    const stop = onIdentityRefresh(() => { alive.current = false; current.dispose(); clear(); });
    return () => { alive.current = false; current.dispose(); stop(); };
  }, [uid]);
  return { session, alive };
}
export function PatientRating({ uid, cid }: { uid: string; cid: string }) {
  useLocale();
  const [record, setRecord] = useState<ConsultationRating | null>(null), [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState(''), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false), [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null), [blocked, setBlocked] = useState(false);
  const busy = useRef(false);
  const { session, alive } = useRatingSession(uid, () => { setRecord(null); setComment(''); setScore(null); setBlocked(true); });
  async function read() {
    setLoading(true); setError(null);
    try { const r = await session.current!.get(cid); if (alive.current) { setRecord(r); setLoaded(true); } }
    catch { if (alive.current) setError(tr("Unable to retrieve your rating. Check access and connection.")); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { void read(); }, [cid]);
  async function submit() {
    if (!alive.current || busy.current || !confirm || score === null) return;
    busy.current = true; setSending(true); setUncertain(true); setError(null);
    try {
      const result = await session.current!.submit(cid, score, comment);
      if (alive.current) { setRecord(result); setComment(''); setConfirm(false); }
    } catch { if (alive.current) setError(tr("Submission not confirmed. Retry unchanged or retrieve your existing rating.")); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }
  if (blocked) return <Copy>{tr("Session changed. Reopen your appointment.")}</Copy>;
  return <Card><Copy variant="heading">{tr("Your consultation rating")}</Copy><Copy tone="muted">{tr("Share feedback on your completed consultation.")}</Copy>
    {loading && <Loading/>}<Notice message={error}/>
    <Action title={tr("Refresh my rating")} disabled={loading || sending} onPress={() => { void read(); }}/>
    {record ? <><Status label={tr("Feedback submitted")} tone="success"/><Copy>{tr("Submitted rating:")}{' '}{record.score} / 5</Copy><Copy>{new Date(record.createdAt).toLocaleString(localeTag())}</Copy>
      {record.comment !== '' && <Copy selectable>{record.comment}</Copy>}<Copy>{tr("This rating cannot be edited.")}</Copy></> : loaded && !loading && <>
      <Copy>{tr("No rating submitted. Select 0�5. Your comment is optional and is not shown to the doctor.")}</Copy>
      <RatingStars value={score} onChange={setScore} disabled={confirm || uncertain}/>
      <Field label={tr("Optional comment (1000 characters)")} multiline placeholder={tr("Share your experience (optional)")} value={comment} onChangeText={setComment} maxLength={1000} editable={!confirm && !uncertain}/>
      <Copy>{tr("Do not include diagnoses, medication details or identifying information in your comment.")}</Copy>
      {!confirm ? <Action title={tr("Review rating")} disabled={score === null} onPress={() => {
        try { validateRatingInput(score!, comment); setConfirm(true); setError(null); } catch { setError(tr("Choose a score and keep the comment within 1000 characters.")); }
      }}/> : <><Copy>{tr("Confirm")}{score} {tr("/ 5. Submission creates one permanent rating for this consultation.")}</Copy>
        <Action title={sending ? tr("Submitting rating...") : uncertain ? tr("Retry unchanged rating") : tr("Confirm rating")} disabled={sending} onPress={() => { void submit(); }}/>
        {!uncertain && <Action secondary title={tr("Edit rating before submission")} onPress={() => setConfirm(false)}/>}
      </>}
      {uncertain && <Copy>{tr("Leaving loses the pending draft. Retrieve your rating before composing another.")}</Copy>}
    </>}
  </Card>;
}
export function DoctorRatingSummaryPanel({ uid }: { uid: string }) {
  useLocale();
  const [value, setValue] = useState<DoctorRatingSummary | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(false), [blocked, setBlocked] = useState(false);
  const { session, alive } = useRatingSession(uid, () => { setValue(null); setBlocked(true); });
  async function load() {
    setLoading(true); setError(false);
    try { const d = await session.current!.summary(); if (alive.current) setValue(d); }
    catch { if (alive.current) setError(true); } finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (blocked) return <Copy>{tr("Session changed.")}</Copy>;
  return <Card><Copy title>{tr("Consultation ratings")}</Copy>{loading && <Loading/>}
    <Notice message={error ? tr("Unable to load your rating summary.") : null}/>
    {value && <><Copy>{value.count === 0 ? tr("No submitted ratings yet.") : `Average ${value.average!.toFixed(1)} / 5 � ${value.count} ratings`}</Copy>
      <Copy>{tr("Individual comments and patient identities are private.")}</Copy></>}
    <Action title={tr("Refresh rating summary")} disabled={loading} onPress={() => { void load(); }}/>
  </Card>;
}

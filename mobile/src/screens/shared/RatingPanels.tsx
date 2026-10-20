import React, { useEffect, useRef, useState } from 'react';
import { createRatingSession, validateRatingInput, type ConsultationRating, type DoctorRatingSummary } from '../../services/ratingService';
import { onIdentityRefresh } from '../../services/authService';
import { Action, Card, Copy, Field, Loading, Notice } from '../../ui/design';
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
  const [record, setRecord] = useState<ConsultationRating | null>(null), [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState(''), [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false), [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null), [blocked, setBlocked] = useState(false);
  const busy = useRef(false);
  const { session, alive } = useRatingSession(uid, () => { setRecord(null); setComment(''); setScore(null); setBlocked(true); });
  async function read() {
    setLoading(true); setError(null);
    try { const r = await session.current!.get(cid); if (alive.current) { setRecord(r); setLoaded(true); } }
    catch { if (alive.current) setError('Unable to retrieve your rating. Check access and connection.'); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { void read(); }, [cid]);
  async function submit() {
    if (!alive.current || busy.current || !confirm || score === null) return;
    busy.current = true; setSending(true); setUncertain(true); setError(null);
    try {
      const result = await session.current!.submit(cid, score, comment);
      if (alive.current) { setRecord(result); setComment(''); setConfirm(false); }
    } catch { if (alive.current) setError('Submission not confirmed. Retry unchanged or retrieve your existing rating.'); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }
  if (blocked) return <Copy>Session changed. Reopen your appointment.</Copy>;
  return <Card><Copy title>Your consultation rating</Copy>
    {loading && <Loading/>}<Notice message={error}/>
    <Action title="Refresh my rating" disabled={loading || sending} onPress={() => { void read(); }}/>
    {record ? <><Copy>Submitted rating: {record.score} / 5</Copy><Copy>{new Date(record.createdAt).toLocaleString()}</Copy>
      {record.comment !== '' && <Copy selectable>{record.comment}</Copy>}<Copy>This rating cannot be edited.</Copy></> : loaded && !loading && <>
      <Copy>No rating submitted. Select 0–5. Your comment is optional and is not shown to the doctor.</Copy>
      <RatingStars value={score} onChange={setScore} disabled={confirm || uncertain}/>
      <Field label="Optional comment (1000 characters)" value={comment} onChangeText={setComment} maxLength={1000} editable={!confirm && !uncertain}/>
      <Copy>Do not include diagnoses, medication details or identifying information in your comment.</Copy>
      {!confirm ? <Action title="Review rating" disabled={score === null} onPress={() => {
        try { validateRatingInput(score!, comment); setConfirm(true); setError(null); } catch { setError('Choose a score and keep the comment within 1000 characters.'); }
      }}/> : <><Copy>Confirm {score} / 5. Submission creates one permanent rating for this consultation.</Copy>
        <Action title={sending ? 'Submitting rating...' : uncertain ? 'Retry unchanged rating' : 'Confirm rating'} disabled={sending} onPress={() => { void submit(); }}/>
        {!uncertain && <Action secondary title="Edit rating before submission" onPress={() => setConfirm(false)}/>}
      </>}
      {uncertain && <Copy>Leaving loses the pending draft. Retrieve your rating before composing another.</Copy>}
    </>}
  </Card>;
}
export function DoctorRatingSummaryPanel({ uid }: { uid: string }) {
  const [value, setValue] = useState<DoctorRatingSummary | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(false), [blocked, setBlocked] = useState(false);
  const { session, alive } = useRatingSession(uid, () => { setValue(null); setBlocked(true); });
  async function load() {
    setLoading(true); setError(false);
    try { const d = await session.current!.summary(); if (alive.current) setValue(d); }
    catch { if (alive.current) setError(true); } finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (blocked) return <Copy>Session changed.</Copy>;
  return <Card><Copy title>Consultation ratings</Copy>{loading && <Loading/>}
    <Notice message={error ? 'Unable to load your rating summary.' : null}/>
    {value && <><Copy>{value.count === 0 ? 'No submitted ratings yet.' : `Average ${value.average!.toFixed(1)} / 5 · ${value.count} ratings`}</Copy>
      <Copy>Individual comments and patient identities are private.</Copy></>}
    <Action title="Refresh rating summary" disabled={loading} onPress={() => { void load(); }}/>
  </Card>;
}

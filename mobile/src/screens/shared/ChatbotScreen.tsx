import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { Action, Card, Copy, Field, Notice, Screen } from '../../ui/design';
import { askChatbot, CHATBOT_DISCLAIMER, CHATBOT_LIMIT, EMERGENCY_GUIDANCE, type HealthReply } from '../../services/chatbotService';

const MAX_TURNS = 20;
export function HealthConversation({ onCare, onBack, patient }: { onCare(): void; onBack(): void; patient: boolean }) {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<{ question: string; reply: HealthReply }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  function reset() { setInput(''); setTurns([]); setError(null); }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') reset();
    });
    return () => subscription.remove();
  }, []);
  function send() {
    if (!foreground || turns.length >= MAX_TURNS) return;
    try {
      const reply = askChatbot(input);
      setTurns(previous => [...previous, { question: input.trim(), reply }].slice(-MAX_TURNS));
      setInput(''); setError(null);
    } catch { setError(`Enter a question of 1-${CHATBOT_LIMIT} characters.`); }
  }
  return <Screen>
    <Action title="Back" secondary onPress={onBack}/>
    <Copy title>Health information assistant</Copy>
    <Copy>{CHATBOT_DISCLAIMER}</Copy>
    <Copy>English only. Conversation stays on this screen and is cleared when you leave or background the app.</Copy>
    <Card><Copy>Emergency? Seek immediate professional help. This assistant cannot reliably detect emergencies.</Copy><Copy>{EMERGENCY_GUIDANCE}</Copy></Card>
    {turns.length === 0 ? <Copy>Ask about healthy eating, handwashing, sleep or stress.</Copy> : null}
    {foreground ? turns.map((turn, index) => <Card key={index}>
      <Copy>You: {turn.question}</Copy>
      <Copy accessibilityLiveRegion="polite">{turn.reply.emergency ? 'Urgent guidance: ' : 'Assistant: '}{turn.reply.response}</Copy>
    </Card>) : null}
    {turns.length >= MAX_TURNS ? <Copy>Conversation limit reached. Reset to start again.</Copy> : null}
    <Field label="General health question" value={input} onChangeText={setInput} multiline maxLength={CHATBOT_LIMIT}
      editable={foreground && turns.length < MAX_TURNS} placeholder="Please avoid personal details"/>
    <Notice message={error}/>
    <Action title="Send question" onPress={send} disabled={!foreground || !input.trim() || turns.length >= MAX_TURNS}/>
    <Action title="Reset conversation" secondary onPress={reset}/>
    <Action title={patient ? 'Find a doctor' : 'Sign in for consultations'} secondary onPress={onCare}/>
    <Copy>Consultations are for non-emergency care. This assistant does not contact a doctor or book a visit.</Copy>
  </Screen>;
}

export default function ChatbotScreen() {
  const { status, firebaseUid, user } = useAuth(), focused = useIsFocused();
  const navigation = useNavigation<NavigationProp<{ Doctors: undefined; Login: undefined }>>();
  const patient = status === 'ready' && user?.role === 'patient' && user.status === 'active';
  if (!focused) return null;
  if (status !== 'signedOut' && !patient) return <Screen><Copy>Health information is available to guests and active patients.</Copy><Action title="Back" onPress={() => navigation.goBack()}/></Screen>;
  return <HealthConversation key={`${status}:${firebaseUid ?? 'guest'}`} patient={patient}
    onCare={() => navigation.navigate(patient ? 'Doctors' : 'Login')} onBack={() => navigation.goBack()}/>;
}

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { sendAssistantMessage } from '../services/api';

const suggestions = [
  'I have only 10 minutes today. What can I do?',
  'What workout should I perform today?',
  'Which muscle groups have I trained the least?',
  'How has my workout consistency changed this month?',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { sender: 'assistant', text: 'I can answer using the workout records and preferences saved in your FitSense account.' },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async (value = draft) => {
    const message = value.trim();
    if (!message || sending) return;
    setMessages((prev) => [...prev, { sender: 'user', text: message }]);
    setDraft('');
    setSending(true);
    setError('');
    try {
      const response = await sendAssistantMessage(message);
      setMessages((prev) => [...prev, { sender: 'assistant', text: response.data.reply }]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to reach the assistant.');
      setMessages((prev) => [...prev, { sender: 'assistant', text: 'I could not retrieve your fitness history just now. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Coach</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Fitness assistant</h1>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {suggestions.map((item) => (
            <button type="button" key={item} disabled={sending} onClick={() => send(item)} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50">{item}</button>
          ))}
        </div>
        <div aria-live="polite" className="max-h-[55vh] min-h-56 space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`max-w-xl whitespace-pre-wrap rounded-2xl px-4 py-2 ${message.sender === 'assistant' ? 'bg-slate-800 text-slate-100' : 'ml-auto bg-lime-500 text-slate-950'}`}>{message.text}</div>
          ))}
          {sending ? <div className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={16} /> Checking your activity…</div> : null}
        </div>
        <form className="mt-4 flex gap-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <input value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your logged workouts, activity, or goals" className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          <button type="submit" disabled={!draft.trim() || sending} className="rounded-xl bg-lime-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-50">Send</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">General fitness information only; this assistant does not provide medical advice.</p>
      </section>
    </div>
  );
}

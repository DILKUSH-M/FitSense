import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { getRecommendations, submitRecommendationFeedback } from '../services/api';

export default function RecommendationsPage() {
  const [recommendation, setRecommendation] = useState(null);
  const [recordId, setRecordId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingFeedback, setSavingFeedback] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRecommendation() {
    try {
      const response = await getRecommendations();
      setRecommendation(response.data.recommendation);
      setRecordId(response.data.record?._id || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to generate a recommendation.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getRecommendations();
        if (active) {
          setRecommendation(response.data.recommendation);
          setRecordId(response.data.record?._id || '');
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to generate a recommendation.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const respond = async (feedback, selectedOption = '') => {
    setSavingFeedback(`${feedback}:${selectedOption}`);
    setError('');
    try {
      await submitRecommendationFeedback(recordId, { feedback, selectedOption });
      setFeedbackMessage(feedback === 'accepted' ? 'Thanks — your preference was saved.' : 'Feedback saved. You can try another option.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save recommendation feedback.');
    } finally {
      setSavingFeedback('');
    }
  };

  if (loading) return <div className="animate-pulse rounded-3xl bg-slate-900 p-8 text-slate-400">Finding a recommendation from your history…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Personalized guidance</div>
          <h1 className="mt-2 text-3xl font-bold text-white">AI recommendations</h1>
        </div>
        <button type="button" onClick={() => { setLoading(true); setError(''); setFeedbackMessage(''); loadRecommendation(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"><RefreshCw size={15} /> Refresh</button>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {feedbackMessage ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{feedbackMessage}</div> : null}

      {recommendation ? (
        <>
          <section className="rounded-3xl border border-lime-500/20 bg-lime-500/10 p-6">
            <div className="mb-4 flex items-center gap-3 text-lime-200"><Sparkles /><h2 className="text-xl font-semibold">{recommendation.title}</h2></div>
            <div className="mb-4 text-sm text-lime-100">Fit score: {recommendation.reasonScore}/100 · Based on your profile and logged workout history</div>
            <h3 className="mb-2 text-sm font-semibold text-white">Why this was recommended</h3>
            <ul className="space-y-2 text-sm text-lime-50">
              {(recommendation.rationale || []).map((item) => <li key={item} className="rounded-2xl border border-lime-400/20 bg-slate-900/30 p-3">{item}</li>)}
            </ul>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={!recordId || Boolean(savingFeedback)} onClick={() => respond('accepted', recommendation.title)} className="rounded-xl bg-lime-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50">Accept recommendation</button>
              <button type="button" disabled={!recordId || Boolean(savingFeedback)} onClick={() => respond('rejected', recommendation.title)} className="rounded-xl border border-lime-300/30 px-4 py-2 text-sm text-lime-100 disabled:opacity-50">Not for me</button>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {(recommendation.alternatives || []).map((option) => (
              <article key={option} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Alternative</div>
                <h3 className="text-lg font-semibold text-white">{option}</h3>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={!recordId || Boolean(savingFeedback)} onClick={() => respond('accepted', option)} className="rounded-xl bg-lime-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50">Choose this</button>
                  <button type="button" disabled={!recordId || Boolean(savingFeedback)} onClick={() => respond('rejected', option)} className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Reject</button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : <p className="text-slate-400">No recommendation is available right now.</p>}
    </div>
  );
}

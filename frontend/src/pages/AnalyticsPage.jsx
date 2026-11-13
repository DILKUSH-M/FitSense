import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getAnalytics } from '../services/api';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await getAnalytics();
        setAnalytics(response.data.analytics);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load progress analytics.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return <div className="animate-pulse rounded-3xl bg-slate-900 p-8 text-slate-400">Loading analytics…</div>;
  if (error) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>;

  const workoutChart = analytics.workouts.map((item) => ({ name: item.label, workouts: item.workouts }));
  const activityChart = analytics.activity.map((item) => ({ name: item.label, steps: item.steps }));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Reports</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Progress analytics</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-sm text-slate-400">Logged workouts · 6 months</div><div className="mt-2 text-3xl font-bold text-white">{analytics.workoutCount}</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-sm text-slate-400">Workout consistency</div><div className="mt-2 text-3xl font-bold text-white">{analytics.consistencyPercent}%</div><div className="text-xs text-slate-500">Compared with your weekly target</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-sm text-slate-400">Profile weight</div><div className="mt-2 text-3xl font-bold text-white">{analytics.currentWeight ? `${analytics.currentWeight} kg` : 'Not set'}</div><div className="text-xs text-slate-500">Historical weight tracking is not available yet</div></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="mb-4 text-xl font-semibold text-white">Workouts by month</h2>
          {workoutChart.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={workoutChart}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis allowDecimals={false} stroke="#94a3b8" /><Tooltip /><Bar dataKey="workouts" fill="#a3e635" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="flex h-72 items-center justify-center text-sm text-slate-400">Log workouts to build your monthly progress chart.</div>}
        </section>
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="mb-4 text-xl font-semibold text-white">Steps by month</h2>
          {activityChart.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityChart}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Bar dataKey="steps" name="Steps" fill="#22d3ee" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="flex h-72 items-center justify-center text-sm text-slate-400">Log activity to build your monthly steps chart.</div>}
        </section>
      </div>
    </div>
  );
}

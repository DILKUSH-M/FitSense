import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Footprints, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard';
import { getDashboardSummary, getRecommendationPreview } from '../services/api';

const emptySummary = {
  totalSteps: 0,
  totalCalories: 0,
  totalDuration: 0,
  workoutsCompleted: 0,
  waterIntakeMl: 0,
  goalCompletion: 0,
  todaySteps: 0,
  todayCalories: 0,
  todayActiveMinutes: 0,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationError, setRecommendationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard() {
    try {
      const dashboardResponse = await getDashboardSummary();
      setData(dashboardResponse.data);
      try {
        const recommendationResponse = await getRecommendationPreview();
        setRecommendation(recommendationResponse.data.recommendation);
        setRecommendationError('');
      } catch (requestError) {
        setRecommendation(null);
        setRecommendationError(requestError.response?.data?.message || 'Personalized recommendation is unavailable.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load your dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const dashboardResponse = await getDashboardSummary();
        if (!active) return;
        setData(dashboardResponse.data);
        try {
          const recommendationResponse = await getRecommendationPreview();
          if (active) {
            setRecommendation(recommendationResponse.data.recommendation);
            setRecommendationError('');
          }
        } catch (requestError) {
          if (active) {
            setRecommendation(null);
            setRecommendationError(requestError.response?.data?.message || 'Personalized recommendation is unavailable.');
          }
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to load your dashboard. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const summary = data?.summary || emptySummary;
  const chartData = (data?.recentActivities || [])
    .slice()
    .reverse()
    .map((activity) => ({
      name: new Date(activity.date).toLocaleDateString(undefined, { weekday: 'short' }),
      steps: activity.steps,
    }));

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fitsense-dashboard-report.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="animate-pulse rounded-3xl bg-slate-900 p-8 text-slate-400">Loading your fitness data…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Overview</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Fitness dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setError(''); loadDashboard(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200">
            <RefreshCw size={15} /> Refresh
          </button>
          <button type="button" onClick={downloadReport} disabled={!data} className="inline-flex items-center gap-2 rounded-xl border border-lime-500/30 bg-lime-500/10 px-4 py-2 text-sm font-medium text-lime-200 disabled:opacity-50">
            <Download size={15} /> Export report
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Steps" value={summary.totalSteps.toLocaleString()} hint="This week" tone="lime" />
        <StatCard label="Calories" value={`${summary.totalCalories.toLocaleString()} kcal`} hint="Burned this week" tone="cyan" />
        <StatCard label="Duration" value={`${summary.totalDuration} min`} hint="Workout time this week" tone="violet" />
        <StatCard label="Workouts" value={summary.workoutsCompleted} hint="Completed this week" tone="rose" />
        <StatCard label="Water" value={summary.waterIntakeMl ? `${(summary.waterIntakeMl / 1000).toFixed(1)} L` : 'Not logged'} hint="Today" tone="lime" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Weekly activity</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Movement trend</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-lime-300"><Footprints size={16} /> {summary.goalCompletion}% weekly workout goal</div>
          </div>
          {chartData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="steps" name="Steps" stroke="#a3e635" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="flex h-64 items-center justify-center text-sm text-slate-400">No activity records this week yet. Add an activity to see your trend.</div>}
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Today</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Steps</span><span className="font-semibold text-white">{summary.todaySteps.toLocaleString()}</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Calories</span><span className="font-semibold text-white">{summary.todayCalories} kcal</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Active minutes</span><span className="font-semibold text-white">{summary.todayActiveMinutes} min</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Goal</span><span className="font-semibold text-white">{summary.goal || 'Not set'}</span></div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Recent workouts</h2>
            <button type="button" onClick={() => navigate('/workouts')} className="text-sm text-lime-300">View all</button>
          </div>
          <div className="space-y-3">
            {data?.recentWorkouts?.length ? data.recentWorkouts.map((workout) => (
              <div key={workout._id} className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3">
                <div>
                  <div className="font-medium text-white">{workout.exerciseName}</div>
                  <div className="text-sm text-slate-400">{new Date(workout.workoutDate).toLocaleDateString()}</div>
                </div>
                <div className="text-right text-sm text-slate-300">{workout.durationMinutes} min · {workout.sets} sets</div>
              </div>
            )) : <p className="text-sm text-slate-400">No workouts logged this week yet.</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Recommended workout</h2>
            <button type="button" onClick={() => navigate('/recommendations')} className="text-sm text-lime-300">Explore</button>
          </div>
          {recommendation ? (
            <div className="rounded-2xl bg-slate-800/70 p-4">
              <div className="font-medium text-white">{recommendation.title}</div>
              <p className="mt-2 text-sm text-slate-400">{recommendation.rationale?.[0]}</p>
            </div>
          ) : <p className="text-sm text-slate-400">{recommendationError || 'No recommendation is available yet.'}</p>}
        </div>
      </div>
    </div>
  );
}

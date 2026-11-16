import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Footprints, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
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

function formatNumber(value, digits = 0) {
  return value === null || value === undefined
    ? '—'
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function shortDate(dayKey) {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sourceLabel(source) {
  if (source === 'sample_generated') return 'Generated sample';
  if (source === 'public_dataset') return 'Fitbit public dataset';
  if (source === 'health_connect') return 'Health Connect';
  if (source === 'android_sensor') return 'Device sensor';
  if (source === 'mixed') return 'Mixed sources';
  if (source === 'user_entered' || source === 'manual') return 'User entered';
  return 'No measurement';
}

function HistoryTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const source = point.sources?.[payload[0].dataKey];
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm shadow-xl">
      <div className="font-medium text-white">{shortDate(point.dayKey)}</div>
      <div className="mt-1 text-slate-300">{formatNumber(payload[0].value, 1)} {unit}</div>
      <div className="mt-1 text-xs text-slate-500">{sourceLabel(source)}</div>
    </div>
  );
}

function WeeklyWorkoutTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sources = [...new Set(payload[0].payload.sources || [])];
  const source = sources.length > 1 ? 'mixed' : sources[0];
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm shadow-xl">
      <div className="font-medium text-white">Week of {shortDate(label)}</div>
      <div className="mt-1 text-slate-300">{formatNumber(payload[0].value)} min</div>
      <div className="mt-1 text-xs text-slate-500">{sourceLabel(source)}</div>
    </div>
  );
}

function DailyTrend({ title, data, metric, color, unit, tickFormatter }) {
  const hasData = data.some((day) => day[metric] !== null && day[metric] !== undefined);
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400">Daily values · last 90 days · {unit}</p>
      </div>
      {hasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="dayKey" tickFormatter={shortDate} interval={13} minTickGap={24} stroke="#94a3b8" />
              <YAxis tickFormatter={tickFormatter} stroke="#94a3b8" width={58} />
              <Tooltip content={<HistoryTooltip unit={unit} />} />
              <Line
                type="monotone"
                dataKey={metric}
                name={title}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          No {title.toLowerCase()} measurements for this period yet.
        </div>
      )}
    </section>
  );
}

function WeeklyWorkoutTrend({ data }) {
  const hasData = data.some((week) => week.durationMinutes > 0);
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Workout duration</h2>
        <p className="text-sm text-slate-400">Weekly total · minutes</p>
      </div>
      {hasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="weekStartDayKey" tickFormatter={shortDate} interval="preserveStartEnd" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip content={<WeeklyWorkoutTooltip />} />
              <Line type="monotone" dataKey="durationMinutes" name="Workout minutes" stroke="#c084fc" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          No workouts recorded in this period yet.
        </div>
      )}
    </section>
  );
}

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
      setError('');
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
  const overview = data?.weeklyOverview;
  const historicalData = data?.historicalData;
  const dailyHistory = historicalData?.daily || [];
  const chartData = dailyHistory.map((day) => ({
    ...day,
    waterLitres: day.waterIntakeMl === null ? null : day.waterIntakeMl / 1000,
    sources: { ...day.sources, waterLitres: day.sources.waterIntakeMl },
  }));
  const todayData = dailyHistory[dailyHistory.length - 1];
  const waterToday = todayData?.waterIntakeMl;
  const weekDays = overview?.elapsedDays || 7;
  const coverageHint = (daysWithData) => `${daysWithData || 0}/${weekDays} days recorded this week`;
  const waterAverage = overview?.averageWaterIntakeMl;

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
          {historicalData?.fromDayKey ? (
            <p className="mt-1 text-sm text-slate-400">
              {shortDate(historicalData.fromDayKey)} – {shortDate(historicalData.toDayKey)}
            </p>
          ) : null}
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

      {historicalData?.hasHistoricalSampleData ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/80">
          Historical sample data is shown where available; generated records are illustrative, not measured activity.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Steps" value={formatNumber(overview?.totalSteps)} hint={coverageHint(overview?.stepsDaysWithData)} tone="lime" />
        <StatCard label="Calories" value={overview?.totalCaloriesBurned == null ? '—' : `${formatNumber(overview.totalCaloriesBurned)} kcal`} hint={coverageHint(overview?.caloriesDaysWithData)} tone="cyan" />
        <StatCard label="Duration" value={`${formatNumber(overview?.totalWorkoutDurationMinutes)} min`} hint="Workout time this week" tone="violet" />
        <StatCard label="Workouts" value={formatNumber(overview?.workoutsCompleted)} hint="Completed this week" tone="rose" />
        <StatCard label="Water today" value={waterToday == null ? 'Not logged' : `${(waterToday / 1000).toFixed(1)} L`} hint={waterAverage == null ? 'No water data this week' : `Weekly average ${(waterAverage / 1000).toFixed(1)} L/day`} tone="lime" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Weekly overview</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Monday – Sunday</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-lime-300"><Footprints size={16} /> {summary.goalCompletion}% weekly workout goal</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overview?.daily?.map((day) => (
              <div key={day.dayKey} className="rounded-2xl bg-slate-800/70 p-3">
                <div className="text-xs text-slate-400">{new Date(`${day.dayKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="mt-2 text-sm text-white">{formatNumber(day.steps)} steps</div>
                <div className="text-sm text-slate-300">{day.caloriesBurned == null ? '—' : `${formatNumber(day.caloriesBurned)} kcal`}</div>
                <div className="text-sm text-slate-300">{day.waterIntakeMl == null ? '—' : `${(day.waterIntakeMl / 1000).toFixed(1)} L`} water</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Today</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Steps</span><span className="font-semibold text-white">{formatNumber(todayData?.steps)}</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Calories burned</span><span className="font-semibold text-white">{todayData?.caloriesBurned == null ? '—' : `${formatNumber(todayData.caloriesBurned)} kcal`}</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Active minutes</span><span className="font-semibold text-white">{formatNumber(todayData?.activeMinutes)} min</span></div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 p-3"><span className="text-slate-300">Goal</span><span className="font-semibold text-white">{summary.goal || 'Not set'}</span></div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DailyTrend title="Steps" data={chartData} metric="steps" color="#a3e635" unit="steps" tickFormatter={(value) => formatNumber(value)} />
        <DailyTrend title="Calories burned" data={chartData} metric="caloriesBurned" color="#22d3ee" unit="kcal" tickFormatter={(value) => formatNumber(value)} />
        <WeeklyWorkoutTrend data={historicalData?.weeklyWorkoutDuration || []} />
        <DailyTrend title="Water intake" data={chartData} metric="waterLitres" color="#60a5fa" unit="L" tickFormatter={(value) => `${value} L`} />
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
                  <div className="text-sm text-slate-400">{shortDate(workout.dayKey || new Date(workout.workoutDate).toISOString().slice(0, 10))}</div>
                  {workout.historicalBaseline ? <div className="text-xs text-amber-200/70">{sourceLabel(workout.source)}</div> : null}
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

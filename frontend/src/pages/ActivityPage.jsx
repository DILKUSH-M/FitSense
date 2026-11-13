import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createActivity, deleteActivity, getActivities, updateActivity } from '../services/api';

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  steps: '',
  distanceKm: '',
  caloriesBurned: '',
  activeMinutes: '',
  waterIntakeMl: '',
  goal: 8000,
  source: 'manual',
};

export default function ActivityPage() {
  const [form, setForm] = useState(initialForm);
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadActivities() {
    try {
      const response = await getActivities();
      setEntries(response.data.activities);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load activity records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getActivities();
        if (active) {
          setEntries(response.data.activities);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to load activity records.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const handleChange = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));

  const submitActivity = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      steps: Number(form.steps || 0),
      distanceKm: Number(form.distanceKm || 0),
      caloriesBurned: Number(form.caloriesBurned || 0),
      activeMinutes: Number(form.activeMinutes || 0),
      waterIntakeMl: Number(form.waterIntakeMl || 0),
      goal: Number(form.goal || 8000),
    };

    try {
      if (editingId) {
        await updateActivity(editingId, payload);
        setNotice('Activity record updated.');
      } else {
        await createActivity(payload);
        setNotice('Activity record saved.');
      }
      setForm(initialForm);
      setEditingId(null);
      await loadActivities();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save activity.');
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry) => {
    setEditingId(entry._id);
    setForm({
      date: new Date(entry.date).toISOString().slice(0, 10),
      steps: entry.steps,
      distanceKm: entry.distanceKm,
      caloriesBurned: entry.caloriesBurned,
      activeMinutes: entry.activeMinutes,
      waterIntakeMl: entry.waterIntakeMl || 0,
      goal: entry.goal,
      source: entry.source,
    });
  };

  const removeEntry = async (id) => {
    if (!window.confirm('Delete this activity record?')) return;
    try {
      await deleteActivity(id);
      setNotice('Activity record deleted.');
      await loadActivities();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete activity.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Movement</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Activity tracking</h1>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.5fr]">
        <form onSubmit={submitActivity} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit activity' : 'Add activity'}</h2>
          <label className="block text-sm text-slate-300">Date<input type="date" name="date" value={form.date} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">Steps<input type="number" min="0" name="steps" value={form.steps} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Distance (km)<input type="number" min="0" step="0.1" name="distanceKm" value={form.distanceKm} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Calories burned<input type="number" min="0" name="caloriesBurned" value={form.caloriesBurned} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Active minutes<input type="number" min="0" name="activeMinutes" value={form.activeMinutes} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Water (ml)<input type="number" min="0" name="waterIntakeMl" value={form.waterIntakeMl} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Step goal<input type="number" min="1" name="goal" value={form.goal} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          </div>
          <label className="block text-sm text-slate-300">Data source<select name="source" value={form.source} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="manual">Manual entry</option><option value="estimated">Estimated</option></select></label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-lime-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update activity' : 'Save activity'}</button>
            {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(initialForm); }} className="rounded-xl border border-slate-600 px-4 text-slate-200">Cancel</button> : null}
          </div>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="mb-4 text-xl font-semibold text-white">Activity history</h2>
          {loading ? <p className="text-sm text-slate-400">Loading activity records…</p> : entries.length ? (
            <div className="space-y-3">
              {entries.map((entry) => (
                <article key={entry._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800/70 p-3">
                  <div>
                    <div className="font-medium text-white">{new Date(entry.date).toLocaleDateString()}</div>
                    <div className="text-sm text-slate-400">{entry.steps.toLocaleString()} steps · {entry.distanceKm} km · {entry.activeMinutes} active min</div>
                    <div className="text-xs text-slate-500">Source: {entry.source}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span>{entry.caloriesBurned} kcal · {entry.waterIntakeMl || 0} ml water</span>
                    <button type="button" onClick={() => editEntry(entry)} aria-label="Edit activity" className="rounded-lg p-2 hover:bg-slate-700"><Pencil size={15} /></button>
                    <button type="button" onClick={() => removeEntry(entry._id)} aria-label="Delete activity" className="rounded-lg p-2 text-rose-300 hover:bg-slate-700"><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No activity records yet. Add your first entry above.</p>}
        </section>
      </div>
    </div>
  );
}

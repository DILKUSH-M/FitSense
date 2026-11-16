import { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { createWorkout, deleteWorkout, getWorkouts, updateWorkout } from '../services/api';

const emptyForm = {
  exerciseName: '',
  category: 'Full body',
  targetMuscleGroup: '',
  sets: 3,
  reps: 10,
  weight: 0,
  durationMinutes: 30,
  workoutDate: '',
  notes: '',
};

const categories = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body', 'Cardio', 'Flexibility'];

function formatLocalDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function sourceLabel(workout) {
  if (workout.source === 'sample_generated') return 'Historical sample data (generated)';
  return 'User entered';
}

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState([]);
  const [form, setForm] = useState({ ...emptyForm, workoutDate: formatLocalDateTime() });
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadWorkouts() {
    try {
      const response = await getWorkouts({ exercise: search || undefined, limit: 100 });
      setWorkouts(response.data.workouts);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load workouts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getWorkouts({ exercise: search || undefined, limit: 100 });
        if (active) {
          setWorkouts(response.data.workouts);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to load workouts.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [search]);

  const handleChange = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));

  const resetForm = () => {
    setForm({ ...emptyForm, workoutDate: formatLocalDateTime() });
    setEditingId(null);
  };

  const submitWorkout = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      sets: Number(form.sets),
      reps: Number(form.reps),
      weight: Number(form.weight),
      durationMinutes: Number(form.durationMinutes),
      workoutDate: new Date(form.workoutDate).toISOString(),
      dayKey: form.workoutDate.slice(0, 10),
    };

    try {
      if (editingId) {
        await updateWorkout(editingId, payload);
        setNotice('Workout updated.');
      } else {
        await createWorkout(payload);
        setNotice('Workout saved.');
      }
      resetForm();
      await loadWorkouts();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this workout.');
    } finally {
      setSaving(false);
    }
  };

  const editWorkout = (workout) => {
    setEditingId(workout._id);
    setForm({
      exerciseName: workout.exerciseName,
      category: workout.category,
      targetMuscleGroup: workout.targetMuscleGroup || '',
      sets: workout.sets,
      reps: workout.reps,
      weight: workout.weight,
      durationMinutes: workout.durationMinutes,
      workoutDate: formatLocalDateTime(workout.workoutDate),
      notes: workout.notes || '',
    });
    document.getElementById('workout-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const removeWorkout = async (id) => {
    if (!window.confirm('Delete this workout record?')) return;
    try {
      await deleteWorkout(id);
      setNotice('Workout deleted.');
      await loadWorkouts();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete this workout.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Training</div>
          <h1 className="mt-2 text-3xl font-bold text-white">My workouts</h1>
        </div>
        <button type="button" onClick={() => document.getElementById('workout-form')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-xl bg-lime-500 px-4 py-2 font-medium text-slate-950">
          <Plus size={16} /> Add session
        </button>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <form id="workout-form" onSubmit={submitWorkout} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit workout' : 'Log a workout'}</h2>
            {editingId ? <button type="button" onClick={resetForm} aria-label="Cancel edit"><X size={18} /></button> : null}
          </div>
          <div>
            <label htmlFor="exerciseName" className="mb-1 block text-sm text-slate-300">Exercise name</label>
            <input id="exerciseName" name="exerciseName" required maxLength={100} value={form.exerciseName} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="category" className="mb-1 block text-sm text-slate-300">Category</label>
              <select id="category" name="category" value={form.category} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="targetMuscleGroup" className="mb-1 block text-sm text-slate-300">Target muscle</label>
              <input id="targetMuscleGroup" name="targetMuscleGroup" value={form.targetMuscleGroup} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">Sets<input type="number" min="1" max="100" name="sets" value={form.sets} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Reps<input type="number" min="1" max="1000" name="reps" value={form.reps} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Weight (kg)<input type="number" min="0" step="0.5" name="weight" value={form.weight} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Duration (min)<input type="number" min="1" max="1440" name="durationMinutes" value={form.durationMinutes} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          </div>
          <label className="block text-sm text-slate-300">Date and time<input type="datetime-local" required name="workoutDate" value={form.workoutDate} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="block text-sm text-slate-300">Notes<textarea name="notes" maxLength={1000} value={form.notes} onChange={handleChange} className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-lime-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update workout' : 'Save workout'}</button>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Workout history</h2>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
              <Search size={14} />
              <input aria-label="Search exercise" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercise" className="w-36 bg-transparent outline-none placeholder:text-slate-500" />
            </label>
          </div>
          {loading ? <p className="text-sm text-slate-400">Loading workouts…</p> : workouts.length ? (
            <div className="space-y-3">
              {workouts.map((workout) => (
                <article key={workout._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800/70 p-3">
                  <div>
                    <div className="font-medium text-white">{workout.exerciseName}</div>
                    <div className="text-sm text-slate-400">{workout.category} · {new Date(workout.workoutDate).toLocaleString()}</div>
                    <div className={`text-xs ${workout.historicalBaseline ? 'text-amber-200/80' : 'text-slate-500'}`}>{sourceLabel(workout)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm text-slate-300">
                      <div>{workout.sets} × {workout.reps} · {workout.weight} kg</div>
                      <div>{workout.durationMinutes} min</div>
                    </div>
                    {workout.historicalBaseline ? (
                      <span className="px-2 text-xs text-slate-500">Read-only baseline</span>
                    ) : (
                      <>
                        <button type="button" onClick={() => editWorkout(workout)} aria-label={`Edit ${workout.exerciseName}`} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700"><Pencil size={15} /></button>
                        <button type="button" onClick={() => removeWorkout(workout._id)} aria-label={`Delete ${workout.exerciseName}`} className="rounded-lg p-2 text-rose-300 hover:bg-slate-700"><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No workouts found. Add your first session above.</p>}
        </section>
      </div>
    </div>
  );
}

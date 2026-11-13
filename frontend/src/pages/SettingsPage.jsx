import { useState } from 'react';
import { updateProfile } from '../services/api';
import { useAuth } from '../context/useAuth';

const fitnessGoals = [
  'Weight management',
  'Muscle building',
  'Strength improvement',
  'General fitness',
  'Flexibility and mobility',
  'Maintaining physical activity',
];

const profileForm = (user) => ({
  name: user?.name || '',
  age: user?.age || '',
  height: user?.height || '',
  weight: user?.weight || '',
  fitnessExperience: user?.fitnessExperience || 'Beginner',
  goal: user?.goal || 'General fitness',
  preferredWorkoutType: user?.preferredWorkoutType || 'Strength training',
  availableWorkoutDuration: user?.availableWorkoutDuration || 30,
  weeklyWorkoutTarget: user?.weeklyWorkoutTarget || 4,
  energyLevel: user?.energyLevel || 'Moderate',
});

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState(() => profileForm(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleChange = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await updateProfile({
        ...form,
        age: Number(form.age),
        height: Number(form.height),
        weight: Number(form.weight),
        availableWorkoutDuration: Number(form.availableWorkoutDuration),
        weeklyWorkoutTarget: Number(form.weeklyWorkoutTarget),
      });
      updateUser(response.data.user);
      setNotice('Your profile and fitness preferences were saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Profile</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Settings</h1>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{notice}</div> : null}

      <form onSubmit={saveProfile} className="max-w-3xl space-y-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-xl font-semibold text-white">Personal profile</h2>
          <p className="mt-1 text-sm text-slate-400">These preferences personalize your recommendations.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Full name<input required name="name" maxLength={100} value={form.name} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Email<input disabled value={user?.email || ''} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-400" /></label>
          <label className="text-sm text-slate-300">Age<input type="number" min="13" max="120" name="age" value={form.age} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Height (cm)<input type="number" min="80" max="250" name="height" value={form.height} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Weight (kg)<input type="number" min="25" max="400" step="0.1" name="weight" value={form.weight} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Experience<select name="fitnessExperience" value={form.fitnessExperience} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">{['Beginner', 'Intermediate', 'Advanced'].map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="text-sm text-slate-300">Fitness goal<select name="goal" value={form.goal} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">{fitnessGoals.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
          <label className="text-sm text-slate-300">Preferred workout<input name="preferredWorkoutType" maxLength={60} value={form.preferredWorkoutType} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Available time (minutes)<input type="number" min="5" max="240" name="availableWorkoutDuration" value={form.availableWorkoutDuration} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Weekly workout target<input type="number" min="1" max="14" name="weeklyWorkoutTarget" value={form.weeklyWorkoutTarget} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="text-sm text-slate-300">Typical energy level<select name="energyLevel" value={form.energyLevel} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">{['Low', 'Moderate', 'High'].map((energy) => <option key={energy}>{energy}</option>)}</select></label>
        </div>
        <button type="submit" disabled={saving} className="rounded-xl bg-lime-500 px-5 py-2.5 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </div>
  );
}

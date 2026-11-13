import { useState } from 'react';
import { Activity, ShieldCheck, Sparkles } from 'lucide-react';
import { loginUser, registerUser } from '../services/api';
import { useAuth } from '../context/useAuth';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', goal: 'General fitness' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();

  const handleChange = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = mode === 'login'
        ? await loginUser({ email: form.email, password: form.password })
        : await registerUser({ ...form, name: form.name || 'Demo User' });

      login({ user: response.data.user });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl shadow-slate-950/40 lg:grid-cols-2">
        <div className="bg-gradient-to-br from-lime-500/15 via-slate-900 to-slate-950 p-8">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-lime-500/20 bg-lime-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-lime-200">
            <Sparkles size={14} /> FitSense
          </div>
          <h1 className="mb-3 text-4xl font-bold">Intelligence for every training day.</h1>
          <p className="mb-8 max-w-md text-slate-300">
           Track movement, understand recovery, and turn personal data into actionable fitness decisions.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
              <Activity className="text-lime-300" />
              <div>
                <div className="font-semibold">Workout analytics</div>
                <div className="text-sm text-slate-400">Real progress insights from your history.</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
              <ShieldCheck className="text-lime-300" />
              <div>
                <div className="font-semibold">Privacy-first</div>
                <div className="text-sm text-slate-400">Sensitive metrics remain under your control.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6 flex gap-2 rounded-full bg-slate-800 p-1">
            <button type="button" className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${mode === 'login' ? 'bg-lime-500 text-slate-950' : 'text-slate-300'}`} onClick={() => changeMode('login')}>Login</button>
            <button type="button" className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${mode === 'register' ? 'bg-lime-500 text-slate-950' : 'text-slate-300'}`} onClick={() => changeMode('register')}>Register</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' ? (
              <div>
                <label className="mb-1 block text-sm text-slate-300">Full name</label>
                <input name="name" required maxLength={100} value={form.name} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-lime-400" />
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm text-slate-300">Email</label>
              <input type="email" name="email" required autoComplete="email" value={form.email} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-lime-400" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-300">Password</label>
              <input type="password" name="password" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-lime-400" />
            </div>

            {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-lime-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-lime-400 disabled:opacity-50">
              {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

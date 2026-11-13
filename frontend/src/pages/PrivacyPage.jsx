import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteAccount, exportUserData, getPrivacy, updatePrivacy } from '../services/api';
import { useAuth } from '../context/useAuth';

const labels = {
  shareData: 'Share de-identified usage data',
  allowVideoMetrics: 'Save derived posture metrics',
  exportData: 'Allow data export',
};

export default function PrivacyPage() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { clearSession } = useAuth();
  const navigate = useNavigate();

  async function loadPreferences() {
    try {
      const response = await getPrivacy();
      setPreferences(response.data.privacyPreferences);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load privacy settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getPrivacy();
        if (active) {
          setPreferences(response.data.privacyPreferences);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to load privacy settings.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const togglePreference = async (field) => {
    const updated = { ...preferences, [field]: !preferences[field] };
    setBusy(field);
    setError('');
    setNotice('');
    try {
      const response = await updatePrivacy({ [field]: updated[field] });
      setPreferences(response.data.privacyPreferences);
      setNotice('Privacy preference saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this privacy preference.');
    } finally {
      setBusy('');
    }
  };

  const downloadData = async () => {
    setBusy('export');
    setError('');
    try {
      const response = await exportUserData();
      const blob = new Blob([JSON.stringify(response.data.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fitsense-data-export.json';
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Your data export was downloaded.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to export your data.');
    } finally {
      setBusy('');
    }
  };

  const removeAccount = async () => {
    if (!window.confirm('Delete your account and all associated fitness records? This cannot be undone.')) return;
    setBusy('delete');
    setError('');
    try {
      await deleteAccount();
      clearSession();
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete your account.');
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Privacy</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Privacy center</h1>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">Data collection</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>Passwords are hashed and excluded from exports.</li>
            <li>Authentication uses an HTTP-only session cookie.</li>
            <li>Posture coaching analyzes webcam frames locally in your browser; raw footage is not uploaded or stored by FitSense.</li>
            <li>Workout, activity, nutrition, and recommendation records are stored in MongoDB for your account.</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">Privacy controls</h2>
          {loading ? <p className="mt-4 text-sm text-slate-400">Loading preferences…</p> : preferences ? (
            <div className="mt-4 space-y-4">
              {Object.entries(labels).map(([field, label]) => (
                <div key={field} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-800/70 p-3">
                  <div className="text-sm text-slate-200">{label}</div>
                  <button type="button" disabled={Boolean(busy)} onClick={() => togglePreference(field)} aria-pressed={preferences[field]} className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${preferences[field] ? 'bg-lime-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                    {busy === field ? 'Saving…' : preferences[field] ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          ) : <button type="button" onClick={() => { setLoading(true); loadPreferences(); }} className="mt-4 text-sm text-lime-300">Retry loading settings</button>}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy !== '' || !preferences?.exportData} onClick={downloadData} className="rounded-xl border border-slate-600 px-4 py-2 text-slate-200 disabled:opacity-50">{busy === 'export' ? 'Preparing export…' : 'Export all my data'}</button>
        <button type="button" disabled={busy !== ''} onClick={removeAccount} className="rounded-xl bg-rose-500 px-4 py-2 font-medium text-white disabled:opacity-50">{busy === 'delete' ? 'Deleting…' : 'Delete account and data'}</button>
      </div>
    </div>
  );
}

import { Activity, Dumbbell, Home, LogOut, MessageSquareText, ShieldCheck, Sparkles, Utensils, TrendingUp, Camera, Settings } from 'lucide-react';

const nav = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'My Workouts', path: '/workouts', icon: Dumbbell },
  { label: 'Activity Tracking', path: '/activity', icon: Activity },
  { label: 'Nutrition', path: '/nutrition', icon: Utensils },
  { label: 'Smart Posture Coach', path: '/posture', icon: Camera },
  { label: 'AI Recommendations', path: '/recommendations', icon: Sparkles },
  { label: 'Fitness Assistant', path: '/assistant', icon: MessageSquareText },
  { label: 'Progress Analytics', path: '/analytics', icon: TrendingUp },
  { label: 'Privacy Center', path: '/privacy', icon: ShieldCheck },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Sidebar({ currentPath, onNavigate, user, onLogout }) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-slate-950/80 p-3 md:w-72 md:border-b-0 md:border-r md:p-4">
      <div className="mb-2 flex items-center gap-3 px-2 py-2 md:mb-6 md:py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-500 text-lg font-bold text-slate-950">
          F
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-lime-300">FitSense</div>
          <div className="text-sm text-slate-400">Performance OS</div>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:space-y-2 md:overflow-visible md:pb-0">
        {nav.map(({ label, path, icon: Icon }) => {
          const active = currentPath === path;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(path)}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition md:w-full ${active ? 'bg-lime-500/15 text-lime-200 ring-1 ring-lime-500/30' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-3 md:mt-6 md:block md:pt-4">
        <div className="min-w-0">
        <div className="truncate px-3 text-sm font-medium text-white">{user?.name}</div>
        <div className="truncate px-3 pb-3 text-xs text-slate-400">{user?.email}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800/80 hover:text-white md:w-full"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>

      <div className="mt-auto hidden rounded-2xl border border-lime-500/20 bg-lime-500/10 p-4 text-sm text-lime-100 md:block">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-lime-200">Coach note</div>
        Recovery matters as much as intensity.
      </div>
    </aside>
  );
}

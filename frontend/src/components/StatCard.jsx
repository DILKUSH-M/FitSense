export default function StatCard({ label, value, tone = 'lime', hint }) {
  const toneMap = {
    lime: 'bg-lime-500/15 text-lime-300 border-lime-400/20',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/20',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-400/20',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-400/20',
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/20">
      <div className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${toneMap[tone] || toneMap.lime}`}>
        {label}
      </div>
      <div className="mt-4 text-2xl font-bold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

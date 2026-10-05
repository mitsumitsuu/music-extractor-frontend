"use client";

import { bpmFlow, type SetlistItem } from "@/lib/setlist";

const W = 640, H = 130, PX = 28, PT = 16, PB = 22;

/** 曲順ごとの BPM の折れ線（インライン SVG）。隣り合う曲の差が threshold 以上の区間は赤で強調 */
export function BpmLine({ items, threshold = 40 }: { items: SetlistItem[]; threshold?: number }) {
  const { points, jumps, songTotal, unknown } = bpmFlow(items, threshold);
  if (songTotal === 0) return null;
  if (points.length === 0) return <p className="text-xs text-slate-500">BPM のある曲がありません（曲の「詳細」で BPM を入れると推移が表示されます）</p>;
  const bpms = points.map((p) => p.bpm);
  const lo = Math.floor((Math.min(...bpms) - 5) / 10) * 10;
  const hi = Math.max(lo + 20, Math.ceil((Math.max(...bpms) + 5) / 10) * 10);
  const x = (no: number) => (songTotal === 1 ? W / 2 : PX + ((W - PX * 2) * (no - 1)) / (songTotal - 1));
  const y = (bpm: number) => PT + (H - PT - PB) * (1 - (bpm - lo) / (hi - lo));
  const jumpSet = new Set(jumps.map((j) => `${j.from.id}>${j.to.id}`));
  const labelEvery = songTotal > 24 ? 5 : songTotal > 12 ? 2 : 1;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-slate-400 dark:text-slate-500" role="img" aria-label={`曲ごとのBPM推移。${points.length}曲分。BPMが${threshold}以上変わる箇所は${jumps.length}か所`}>
        {[lo, (lo + hi) / 2, hi].map((g) => (
          <g key={g}>
            <line x1={PX - 8} x2={W - PX + 8} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 4" />
            <text x={2} y={y(g) + 3} fontSize={10} fill="currentColor">{Math.round(g)}</text>
          </g>
        ))}
        {points.slice(1).map((p, i) => {
          const q = points[i];
          const hot = jumpSet.has(`${q.id}>${p.id}`);
          return <line key={p.id} x1={x(q.songNo)} y1={y(q.bpm)} x2={x(p.songNo)} y2={y(p.bpm)} strokeWidth={hot ? 3 : 2} strokeLinecap="round" className={hot ? "stroke-rose-500" : "stroke-indigo-500 dark:stroke-indigo-400"} strokeDasharray={p.songNo - q.songNo > 1 ? "4 4" : undefined} />;
        })}
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={x(p.songNo)} cy={y(p.bpm)} r={4} className="fill-white stroke-indigo-600 dark:fill-slate-900 dark:stroke-indigo-300" strokeWidth={2}><title>{`${p.songNo}. ${p.title}（BPM ${p.bpm}）`}</title></circle>
            {(songTotal <= 16 || p.songNo % labelEvery === 0) && <text x={x(p.songNo)} y={y(p.bpm) - 8} fontSize={10} textAnchor="middle" fill="currentColor">{p.bpm}</text>}
          </g>
        ))}
        {Array.from({ length: songTotal }, (_, i) => i + 1).filter((n) => n === 1 || n % labelEvery === 0 || n === songTotal).map((n) => (
          <text key={n} x={x(n)} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor">{n}</text>
        ))}
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        {jumps.length ? (
          <span className="font-bold text-rose-600 dark:text-rose-400">BPM差 {threshold} 以上: {jumps.map((j) => `${j.from.songNo}→${j.to.songNo}曲目（${j.delta > 0 ? "+" : ""}${j.delta}）`).join("、")}</span>
        ) : <>隣り合う曲のBPM差はすべて {threshold} 未満です</>}
        {unknown > 0 && <span>（BPM 不明の{unknown}曲は線から除いています。点線は不明曲をまたぐ区間）</span>}
      </p>
    </div>
  );
}

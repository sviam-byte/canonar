import React, { useMemo } from 'react';
import { EntityRuntime, Registry } from '../lib/types';

export function SystemMonitor({ items, registry }:{ items:EntityRuntime[]; registry:Registry }) {
  const sumVs = useMemo(()=> items.reduce((s,e)=>s+(e.metrics.Vsigma||0),0), [items]);
  const thr = registry.thresholds?.blackstart ?? 50;
  const pct = Math.min(100, (sumVs/thr)*100);

  return (
    <div className="border rounded p-3">
      <div className="text-sm mb-1">ΣVσ: <b>{sumVs.toFixed(2)}</b> / {thr}</div>
      <div className="h-2 w-full bg-zinc-800 rounded">
        <div className="h-2 rounded bg-red-500" style={{ width:`${pct}%` }} />
      </div>
      {pct>=90 && <div className="mt-2 text-red-400 text-sm">Внимание: ближе 10% к порогу Чёрного Пуска</div>}
    </div>
  );
}

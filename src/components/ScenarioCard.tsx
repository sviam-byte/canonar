import React, { useState } from 'react';
import { ScenarioEngine } from '../lib/scenario-engine';
import { EntityRuntime } from '../lib/types';

export function ScenarioCard({ engine, entity }:{ engine:ScenarioEngine; entity:EntityRuntime }) {
  const [result, setResult] = useState<any>(null);
  const [input, setInput] = useState({ id:'exposure-plan', args:{ Astar: 100, q:0.6, v:30 } });

  const simulate = ()=>{
    const res = engine.simulate(entity, input as any);
    setResult(res);
  };
  const commit = ()=>{
    if (!result) return;
    engine.commit(entity, result);
    setResult(null);
  };

  return (
    <div className="border rounded p-3 space-y-3">
      <div className="font-semibold">Сценарий</div>

      <div className="flex flex-col gap-2">
        <select value={(input as any).id} onChange={(e)=>setInput(prev=>({...prev, id:e.target.value}))} className="border rounded px-2 py-1">
          <option value="exposure-plan">Exposure Plan</option>
          <option value="witness-rally">Witness Rally</option>
          <option value="dark-layer">Dark Layer</option>
          <option value="chron-verify">Chron Verify</option>
          <option value="patch-plan">Patch Plan</option>
          <option value="causal-surgery">Causal Surgery</option>
          <option value="sector-shock">Sector Shock</option>
          <option value="topo-seal">Topological Seal</option>
          <option value="de-monster">De-Monsterization</option>
        </select>
        {/* примитивные поля аргументов; для прод — сделать форм-билдер по id */}
        {(input as any).id==='exposure-plan' &&
          <div className="flex gap-2">
            <label className="text-sm">A*</label>
            <input className="border px-2" type="number" value={(input as any).args.Astar}
                   onChange={e=>setInput(prev=>({...prev, args:{...prev.args, Astar:Number(e.target.value)}}))}/>
            <label className="text-sm">q</label>
            <input className="border px-2" type="number" value={(input as any).args.q}
                   onChange={e=>setInput(prev=>({...prev, args:{...prev.args, q:Number(e.target.value)}}))}/>
            <label className="text-sm">v/wk</label>
            <input className="border px-2" type="number" value={(input as any).args.v}
                   onChange={e=>setInput(prev=>({...prev, args:{...prev.args, v:Number(e.target.value)}}))}/>
          </div>
        }
      </div>

      <div className="flex gap-2">
        <button onClick={simulate} className="px-2 py-1 border rounded">simulate</button>
        <button onClick={commit} disabled={!result} className="px-2 py-1 border rounded disabled:opacity-50">commit</button>
      </div>

      {result && (
        <div className="text-sm grid grid-cols-3 gap-4">
          <div>
            <div className="opacity-70">before</div>
            <div>𝑃ᵥ: {result.before.Pv.toFixed(3)}</div>
            <div>𝑉σ: {result.before.Vsigma.toFixed(3)}</div>
            <div>𝑆: {result.before.S.toFixed(3)}</div>
          </div>
          <div>
            <div className="opacity-70">after</div>
            <div>𝑃ᵥ: {result.after.Pv.toFixed(3)}</div>
            <div>𝑉σ: {result.after.Vsigma.toFixed(3)}</div>
            <div>𝑆: {result.after.S.toFixed(3)}</div>
          </div>
          <div>
            <div className="opacity-70">Δ</div>
            <div>Δ𝑃ᵥ: {result.diff.dPv.toFixed(3)}</div>
            <div>Δ𝑉σ: {result.diff.dVs.toFixed(3)}</div>
            <div>Δ𝑆: {result.diff.dS.toFixed(3)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

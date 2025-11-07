import React from 'react';
import { Registry, EntityRuntime } from '../lib/types';

export function MapPanel({ registry, entities }:{ registry:Registry; entities:EntityRuntime[] }) {
  if (!registry.map) return null;
  const [w,h] = registry.map.bounds;
  return (
    <div className="relative overflow-hidden border rounded" style={{width:w, height:h}}>
      <img src={registry.map.base} alt="map" className="absolute inset-0 w-full h-full object-cover" />
      {entities.map(e=>{
        if (!e.meta.coords) return null;
        const { x, y } = e.meta.coords;
        return (
          <div key={e.meta.entity_id} className="absolute -translate-x-1/2 -translate-y-1/2"
               style={{ left:x, top:y }}>
            <div className="w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black/60" title={e.meta.title}/>
          </div>
        );
      })}
    </div>
  );
}

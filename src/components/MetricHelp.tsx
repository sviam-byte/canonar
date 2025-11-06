import React from "react";

const DOCS: Record<string, string> = {
  Pv: "Предсказательная ценность: ΔLL + κ·Δlogdet(F).",
  Vsigma: "Онтологический долг: эксергия + инфра + хвостовые риски + штрафы дозы.",
  S: "Стабильность: σ(α1·Pv − α2·Vσ − α3·drift + α4·topo + α5·log(1+witness)).",
  dose: "E/A*. Идеал ≈ 1. Недокорм/пересушка штрафуют.",
  drift: "Дрейф кода. Растёт при неверной дозе и шоках.",
  topo: "Топологическая защита и память.",
  influence: "Влияние персонажа: воля/компетентность/ресурсы с модификатором лояльности.",
  "Pr[monstro]": "Риск монструозности: σ(β1·stress + β2·Vσ − β3·loyalty)."
};

export default function MetricHelp() {
  return (
    <div style={{ padding: 12, border: "1px dashed var(--muted,#3d3d3d)", borderRadius: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Пояснения метрик</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {Object.entries(DOCS).map(([k, v]) => (
          <li key={k} style={{ marginBottom: 4 }}>
            <strong style={{ marginRight: 6 }}>{k}:</strong>
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

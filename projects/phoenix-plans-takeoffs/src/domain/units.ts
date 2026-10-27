import type { Unit } from "./model.js";

/** Millimetres per unit. The inch is exactly 25.4 mm by definition. */
const TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export function convertLength(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return (value * TO_MM[from]) / TO_MM[to];
}

export function convertArea(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  const factor = TO_MM[from] / TO_MM[to];
  return value * factor * factor;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

export function lengthLabel(value: number, unit: Unit): string {
  return `${formatNumber(value)} ${unit}`;
}

export function areaLabel(value: number, unit: Unit): string {
  return `${formatNumber(value)} ${unit}²`;
}

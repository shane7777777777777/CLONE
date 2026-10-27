import type { Point } from "./model.js";

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    total += distance(current, next);
  }
  return total;
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** Proper intersection, ignoring shared endpoints of adjacent edges. */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const opposite = (left: number, right: number): boolean =>
    (left > 0 && right < 0) || (left < 0 && right > 0);
  return opposite(abC, abD) && opposite(cdA, cdB);
}

export function polygonSelfIntersects(points: readonly Point[]): boolean {
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    for (let j = i + 1; j < points.length; j += 1) {
      const adjacent = j === i || (j + 1) % points.length === i || (i + 1) % points.length === j;
      if (adjacent) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (!c || !d) continue;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function boundsOf(points: readonly Point[], pad = 0): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function almostEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

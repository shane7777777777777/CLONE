export const KNOWN_GEOMETRY = {
  page: { width: 612, height: 792, rotation: 0 as const },
  scale: {
    a: { x: 72, y: 360 },
    b: { x: 432, y: 360 },
    knownLength: 30,
    unit: "ft" as const,
  },
  distance: {
    a: { x: 72, y: 220 },
    b: { x: 192, y: 220 },
    feet: 10,
  },
  square: {
    a: { x: 300, y: 200 },
    b: { x: 444, y: 200 },
    c: { x: 444, y: 344 },
    d: { x: 300, y: 344 },
    sideFeet: 12,
    areaSqFt: 144,
    perimeterFeet: 48,
  },
};

export const MIXED_PAGES = [
  { width: 612, height: 792, rotation: 0 as const, label: "PAGE-LETTER" },
  { width: 792, height: 1224, rotation: 0 as const, label: "PAGE-TABLOID" },
  { width: 612, height: 792, rotation: 90 as const, label: "PAGE-ROTATED" },
  { width: 400, height: 400, rotation: 0 as const, label: "PAGE-SQUARE" },
];

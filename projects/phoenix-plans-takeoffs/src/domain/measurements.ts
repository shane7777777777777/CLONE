import { polygonArea, polygonPerimeter, polygonSelfIntersects, distance } from "./geometry.js";
import {
  calibrationFor,
  type AreaMeasurement,
  type Calibration,
  type CountMeasurement,
  type DistanceMeasurement,
  type Measurement,
  type Project,
  type Unit,
} from "./model.js";
import { areaLabel, convertArea, convertLength, lengthLabel } from "./units.js";

export type QuantityStatus = "ok" | "uncalibrated" | "unreliable" | "invalid";

export interface QuantityRow {
  measurementId: string;
  revisionId: string;
  pageIndex: number;
  revisionLabel: string;
  label: string;
  kind: Measurement["kind"];
  status: QuantityStatus;
  text: string;
  value: number | null;
  unit: string | null;
}

export function pointsPerUnit(calibration: Calibration): number | null {
  const span = distance(calibration.a, calibration.b);
  if (!(span > 0) || !(calibration.knownLength > 0) || !Number.isFinite(calibration.knownLength)) {
    return null;
  }
  return span / calibration.knownLength;
}

export interface EvaluatedDistance {
  status: "ok" | "uncalibrated" | "invalid";
  pointLength: number;
  value: number | null;
  unit: Unit | null;
  text: string;
}

export function evaluateDistance(
  measurement: DistanceMeasurement,
  calibration: Calibration | undefined,
  displayUnit?: Unit,
): EvaluatedDistance {
  const pointLength = distance(measurement.a, measurement.b);
  if (!(pointLength > 0)) {
    return { status: "invalid", pointLength, value: null, unit: null, text: "Zero-length distance" };
  }
  if (!calibration) {
    return {
      status: "uncalibrated",
      pointLength,
      value: null,
      unit: null,
      text: "Blocked — this page has no calibration",
    };
  }
  const scale = pointsPerUnit(calibration);
  if (scale === null) {
    return {
      status: "invalid",
      pointLength,
      value: null,
      unit: null,
      text: "Calibration segment has no length",
    };
  }
  const raw = pointLength / scale;
  const unit = displayUnit ?? calibration.unit;
  const value = convertLength(raw, calibration.unit, unit);
  return { status: "ok", pointLength, value, unit, text: lengthLabel(value, unit) };
}

export interface EvaluatedArea {
  status: "ok" | "uncalibrated" | "unreliable" | "invalid";
  areaPoints: number;
  perimeterPoints: number;
  area: number | null;
  perimeter: number | null;
  unit: Unit | null;
  text: string;
  perimeterText: string;
}

export function evaluateArea(
  measurement: AreaMeasurement,
  calibration: Calibration | undefined,
  displayUnit?: Unit,
): EvaluatedArea {
  const areaPoints = polygonArea(measurement.polygon);
  const perimeterPoints = polygonPerimeter(measurement.polygon);
  if (measurement.polygon.length < 3 || !(areaPoints > 0)) {
    return {
      status: "invalid",
      areaPoints,
      perimeterPoints,
      area: null,
      perimeter: null,
      unit: null,
      text: "Area needs 3 or more points",
      perimeterText: "—",
    };
  }
  const unreliable = polygonSelfIntersects(measurement.polygon);
  if (!calibration) {
    return {
      status: "uncalibrated",
      areaPoints,
      perimeterPoints,
      area: null,
      perimeter: null,
      unit: null,
      text: "Blocked — this page has no calibration",
      perimeterText: "Blocked — this page has no calibration",
    };
  }
  const scale = pointsPerUnit(calibration);
  if (scale === null) {
    return {
      status: "invalid",
      areaPoints,
      perimeterPoints,
      area: null,
      perimeter: null,
      unit: null,
      text: "Calibration segment has no length",
      perimeterText: "Calibration segment has no length",
    };
  }
  const unit = displayUnit ?? calibration.unit;
  const area = convertArea(areaPoints / (scale * scale), calibration.unit, unit);
  const perimeter = convertLength(perimeterPoints / scale, calibration.unit, unit);
  if (unreliable) {
    return {
      status: "unreliable",
      areaPoints,
      perimeterPoints,
      area,
      perimeter,
      unit,
      text: `Unreliable self-intersecting area (${areaLabel(area, unit)})`,
      perimeterText: lengthLabel(perimeter, unit),
    };
  }
  return {
    status: "ok",
    areaPoints,
    perimeterPoints,
    area,
    perimeter,
    unit,
    text: areaLabel(area, unit),
    perimeterText: lengthLabel(perimeter, unit),
  };
}

export function evaluateCount(measurement: CountMeasurement): QuantityRow {
  return {
    measurementId: measurement.id,
    revisionId: measurement.revisionId,
    pageIndex: measurement.pageIndex,
    revisionLabel: "",
    label: measurement.label,
    kind: "count",
    status: measurement.points.length > 0 ? "ok" : "invalid",
    text: measurement.points.length > 0 ? `${measurement.points.length} count` : "Empty count",
    value: measurement.points.length > 0 ? measurement.points.length : null,
    unit: measurement.points.length > 0 ? "count" : null,
  };
}

export function quantityRows(
  project: Project,
  revisionId: string,
  displayUnit?: Unit,
): QuantityRow[] {
  const revision = project.revisions.find((item) => item.id === revisionId);
  const revisionLabel = revision?.label ?? "Unknown revision";
  return project.measurements
    .filter((measurement) => measurement.revisionId === revisionId)
    .map((measurement) => {
      if (measurement.kind === "count") {
        return { ...evaluateCount(measurement), revisionLabel };
      }
      const calibration = calibrationFor(project, measurement.revisionId, measurement.pageIndex);
      if (measurement.kind === "distance") {
        const evaluated = evaluateDistance(measurement, calibration, displayUnit);
        return {
          measurementId: measurement.id,
          revisionId: measurement.revisionId,
          pageIndex: measurement.pageIndex,
          revisionLabel,
          label: measurement.label,
          kind: measurement.kind,
          status: evaluated.status,
          text: evaluated.text,
          value: evaluated.value,
          unit: evaluated.unit,
        };
      }
      const evaluated = evaluateArea(measurement, calibration, displayUnit);
      return {
        measurementId: measurement.id,
        revisionId: measurement.revisionId,
        pageIndex: measurement.pageIndex,
        revisionLabel,
        label: measurement.label,
        kind: measurement.kind,
        status: evaluated.status,
        text: `${evaluated.text}; perimeter ${evaluated.perimeterText}`,
        value: evaluated.status === "ok" ? evaluated.area : null,
        unit: evaluated.status === "ok" ? (evaluated.unit ? `${evaluated.unit}²` : null) : null,
      };
    });
}

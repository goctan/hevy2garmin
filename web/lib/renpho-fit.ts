import "server-only";

import { Encoder, Profile } from "@garmin/fitsdk";
import type { RenphoMeasurement } from "./renpho-types";

const MESG = Profile.MesgNum;
const GARMIN_INDEX_SCALE_2_PRODUCT = 2429;
const RENPHO_SERIAL_NUMBER = 0x524e5048;

function toKilograms(weight: number, unit: number | string | null | undefined): number {
  if (typeof unit === "string") {
    const normalized = unit.trim().toLowerCase();
    if (["lb", "lbs", "pound", "pounds"].includes(normalized)) return weight / 2.2046;
    if (["st", "stone", "stones", "st:lb", "stone_lbs"].includes(normalized)) return weight / 0.15747;
    return weight;
  }
  // Renpho WeightUnit values used by the source CLI: 1=kg, 2=lb, 3=stone+lb, 4=stone.
  switch (unit) {
    case 2: return weight / 2.2046;
    case 3:
    case 4: return weight / 0.15747;
    default: return weight;
  }
}

function validNonNegative(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Encode one Renpho measurement as a Garmin Weight Scale FIT file. */
export function generateRenphoFit(measurement: RenphoMeasurement): Uint8Array {
  const weight = measurement.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    throw new Error("Renpho measurement has no valid weight.");
  }

  const timestamp = measurement.timeStamp;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("Renpho measurement has no valid timestamp.");
  }

  const measuredAt = new Date(timestamp * 1000);
  const weightKg = toKilograms(weight, measurement.weightUnit);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 655.35) {
    throw new Error("Renpho measurement weight is outside the FIT supported range.");
  }

  const encoder = new Encoder();
  const writeMesg = (message: Record<string, unknown>) =>
    (encoder.writeMesg as (value: unknown) => void)(message);

  writeMesg({
    mesgNum: MESG.FILE_ID,
    type: "weight",
    manufacturer: "garmin",
    product: GARMIN_INDEX_SCALE_2_PRODUCT,
    serialNumber: RENPHO_SERIAL_NUMBER,
    timeCreated: measuredAt,
  });

  const weightScale: Record<string, unknown> = {
    mesgNum: MESG.WEIGHT_SCALE,
    timestamp: measuredAt,
    userProfileIndex: 0,
    weight: weightKg,
  };

  const bodyFat = validNonNegative(measurement.bodyfat);
  if (bodyFat !== undefined) weightScale.percentFat = bodyFat;

  const hydration = validNonNegative(measurement.water);
  if (hydration !== undefined) weightScale.percentHydration = hydration;

  // Renpho reports muscle as a percentage; Garmin FIT expects muscle mass in kg.
  const musclePercent = validNonNegative(measurement.muscle);
  if (musclePercent !== undefined) weightScale.muscleMass = weightKg * musclePercent / 100;

  const boneMass = validNonNegative(measurement.bone);
  if (boneMass !== undefined) weightScale.boneMass = boneMass;

  const metabolicAge = validNonNegative(measurement.bodyage);
  if (metabolicAge !== undefined) weightScale.metabolicAge = Math.min(255, Math.round(metabolicAge));

  const visceralFat = validNonNegative(measurement.visfat);
  if (visceralFat !== undefined) weightScale.visceralFatRating = Math.min(255, Math.round(visceralFat));

  const bmr = validNonNegative(measurement.bmr);
  if (bmr !== undefined) weightScale.basalMet = bmr;

  const bmi = validNonNegative(measurement.bmi);
  if (bmi !== undefined) weightScale.bmi = bmi;

  writeMesg(weightScale);
  return new Uint8Array(encoder.close());
}

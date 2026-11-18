/**
 * Renpho cloud API endpoints used by the server-side integration.
 */
export const RENPHO_API_BASE_URL = "https://cloud.renpho.com";

export const RENPHO_ENDPOINTS = {
  login: "/renpho-aggregation/user/login",
  deviceCount: "/renpho-aggregation/device/count",
  tokenTime: "/RenphoHealth/app/sync/getTokenTime",
  familyMembers: "/RenphoHealth/centerUser/queryFamilyMemberList",
  measurements: "/RenphoHealth/scale/queryAllMeasureDataList",
} as const;

export const RENPHO_DEFAULT_HEADERS = {
  appVersion: "6.6.0-GarminSync",
  platform: "android-GarminSync",
} as const;

export const RENPHO_MEASUREMENT_PAGE_SIZE = 50;

export const RENPHO_DEVICE_TYPES = [
  "00002",
  "00003",
  "00007",
  "00008",
  "00009",
  "00016",
  "00023",
  "00026",
  "00034",
  "00038",
  "00042",
  "00043",
  "00051",
] as const;

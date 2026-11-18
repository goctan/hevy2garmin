/**
 * Renpho cloud API endpoints used by the server-side integration.
 * Keep the base URL and paths centralized so API changes are made in one place.
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
  appVersion: "3.9.8",
  platform: "Android",
} as const;

export const RENPHO_MEASUREMENT_PAGE_SIZE = 50;

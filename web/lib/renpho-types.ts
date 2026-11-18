export interface RenphoConfig {
  username: string;
  password: string;
  encryptionSecret: string;
  appVersion?: string;
  platform?: string;
  apiBaseUrl?: string;
}

export interface RenphoUser {
  id: number;
  email?: string;
  token: string;
  accountName?: string;
  weightUnit?: number;
  height?: number;
  timeZone?: string;
  [key: string]: unknown;
}

export interface RenphoLoginPayload {
  questionnaire: Record<string, never>;
  login: {
    password: string;
    areaCode: string;
    appRevision: string;
    cellphoneType: string;
    systemType: string;
    email: string;
    platform: string;
  };
  bindingList: {
    deviceTypes: string[];
  };
}

export interface RenphoEncryptedRequest {
  encryptData: string;
}

export interface RenphoEncryptedResponse<T> {
  code: number;
  msg?: string;
  data?: string | null;
}

export interface RenphoDeviceInfo {
  scale?: Array<{
    userIds?: number[];
    count?: number;
    tableName?: string;
  }>;
}

export interface RenphoMeasurement {
  id: number | null;
  timeStamp: number | null;
  localCreatedAt?: string | null;
  timeZone?: string | null;
  weight?: number | null;
  weightUnit?: number | null;
  bodyfat?: number | null;
  water?: number | null;
  bmr?: number | null;
  bodyage?: number | null;
  muscle?: number | null;
  bone?: number | null;
  visfat?: number | null;
  bmi?: number | null;
  heartRate?: number | null;
  protein?: number | null;
  fatFreeWeight?: number | null;
  [key: string]: unknown;
}

export interface RenphoTokenTime {
  issAt?: number;
  expAt?: number;
  userId?: number;
  token?: string;
}

export interface RenphoSyncResult {
  measurements: RenphoMeasurement[];
  userId: number;
  tableName: string;
}

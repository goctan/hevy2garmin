import "server-only";

import {
  RENPHO_API_BASE_URL,
  RENPHO_DEFAULT_HEADERS,
  RENPHO_DEVICE_TYPES,
  RENPHO_ENDPOINTS,
  RENPHO_MEASUREMENT_PAGE_SIZE,
} from "./renpho-api-endpoints";
import {
  decryptRenphoJson,
  encryptRenphoBytes,
  encryptRenphoJson,
} from "./renpho-crypto";
import type {
  RenphoConfig,
  RenphoDeviceInfo,
  RenphoEncryptedResponse,
  RenphoLoginPayload,
  RenphoMeasurement,
  RenphoTokenTime,
  RenphoUser,
} from "./renpho-types";

export interface RenphoSession {
  user: RenphoUser;
  token: string;
  userId: number;
  expiresAt?: number;
}

function getBaseUrl(config: RenphoConfig): string {
  let baseUrl = config.apiBaseUrl || RENPHO_API_BASE_URL;
  while (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  return baseUrl;
}

function getAppVersion(config: RenphoConfig): string {
  return config.appVersion || RENPHO_DEFAULT_HEADERS.appVersion;
}

function getPlatform(config: RenphoConfig): string {
  return config.platform || RENPHO_DEFAULT_HEADERS.platform;
}

function buildHeaders(
  config: RenphoConfig,
  session?: RenphoSession,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    appVersion: getAppVersion(config),
    platform: getPlatform(config),
  };

  if (session) {
    headers.token = session.token;
    headers.userId = String(session.userId);
  }

  return headers;
}

async function postEncrypted<T>(
  config: RenphoConfig,
  endpoint: string,
  payload: unknown,
  session?: RenphoSession,
): Promise<T> {
  const encrypted = encryptRenphoJson(payload, config.encryptionSecret);
  return postEncryptedBody<T>(config, endpoint, encrypted, session);
}

async function postEncryptedBody<T>(
  config: RenphoConfig,
  endpoint: string,
  encryptedData: string,
  session?: RenphoSession,
): Promise<T> {
  const response = await fetch(`${getBaseUrl(config)}${endpoint}`, {
    method: "POST",
    headers: buildHeaders(config, session),
    body: JSON.stringify({ encryptData: encryptedData }),
    cache: "no-store",
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Renpho request failed (${response.status} ${response.statusText}): ${rawText.slice(0, 300)}`,
    );
  }

  let envelope: RenphoEncryptedResponse;
  try {
    envelope = JSON.parse(rawText) as RenphoEncryptedResponse;
  } catch {
    throw new Error("Renpho returned an invalid JSON response.");
  }

  if (typeof envelope.code === "number" && envelope.code !== 0 && envelope.code !== 101) {
    throw new Error(
      `Renpho API error ${envelope.code}: ${envelope.msg || "Unknown error"}`,
    );
  }

  if (typeof envelope.data !== "string" || !envelope.data) {
    throw new Error("Renpho response did not contain encrypted data.");
  }

  return decryptRenphoJson<T>(envelope.data, config.encryptionSecret);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export async function loginRenpho(
  config: RenphoConfig,
): Promise<RenphoSession> {
  const appVersion = getAppVersion(config);
  const platform = getPlatform(config);

  const payload: RenphoLoginPayload = {
    questionnaire: {},
    login: {
      password: config.password,
      areaCode: "US",
      appRevision: appVersion,
      cellphoneType: "GarminRenphoSync",
      systemType: "11",
      email: config.username,
      platform,
    },
    bindingList: {
      deviceTypes: [...RENPHO_DEVICE_TYPES],
    },
  };

  const result = asRecord(
    await postEncrypted<unknown>(
      config,
      RENPHO_ENDPOINTS.login,
      payload,
    ),
  );
  const login = asRecord(result.login ?? result.user ?? result);
  const userId = readNumber(login, "userId", "id", "uid");
  const token = readString(login, "token", "accessToken");

  if (!userId || !token) {
    throw new Error(
      "Renpho login succeeded but the response did not include a user ID and token.",
    );
  }

  const user: RenphoUser = {
    ...login,
    id: userId,
    token,
    email: readString(login, "email") || config.username,
  };

  const session: RenphoSession = {
    user,
    userId,
    token,
  };

  try {
    const tokenInfo = asRecord(
      await postEncrypted<RenphoTokenTime>(
        config,
        RENPHO_ENDPOINTS.tokenTime,
        {},
        session,
      ),
    );
    const expiresAt = readNumber(tokenInfo, "expAt", "expiresAt");
    if (expiresAt) session.expiresAt = expiresAt;
  } catch {
    // Token-time is supplementary; a successful login remains usable.
  }

  return session;
}

export async function getRenphoMeasurements(
  config: RenphoConfig,
  session: RenphoSession,
  totalCount = 500,
): Promise<{
  measurements: RenphoMeasurement[];
  userId: number;
  tableName: string;
}> {
  // Match the reference Renpho CLI: encrypted empty bytes for device/count.
  const emptyEncryptedPayload = encryptRenphoBytes(
    Buffer.alloc(0),
    config.encryptionSecret,
  );

  const deviceInfo = asRecord(
    await postEncryptedBody<RenphoDeviceInfo>(
      config,
      RENPHO_ENDPOINTS.deviceCount,
      emptyEncryptedPayload,
      session,
    ),
  );

  const scales = Array.isArray(deviceInfo.scale) ? deviceInfo.scale : [];
  if (scales.length === 0) {
    throw new Error("Renpho returned no scale devices for this account.");
  }

  // The CLI checks every scale and only queries scales explicitly associated
  // with the logged-in user. It does not blindly use the first scale/user ID.
  const userScales = scales.filter(
    (scale) =>
      typeof scale?.tableName === "string" &&
      scale.tableName.length > 0 &&
      Array.isArray(scale.userIds) &&
      scale.userIds.some((id: string | number) => Number(id) === session.userId),
  );

  if (userScales.length === 0) {
    throw new Error(
      "Renpho found scale devices, but none are associated with the logged-in account. Check the selected Renpho profile.",
    );
  }

  const allMeasurements: RenphoMeasurement[] = [];
  let firstTableName = "";

  for (const scale of userScales) {
    firstTableName ||= scale.tableName!;
    const requestedCount =
      typeof scale.count === "number" && scale.count > 0
        ? Math.min(scale.count, totalCount)
        : totalCount;

    const pageSize = RENPHO_MEASUREMENT_PAGE_SIZE;
    const maxPages = Math.max(1, Math.ceil(requestedCount / pageSize));

    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await postEncrypted<unknown>(
        config,
        RENPHO_ENDPOINTS.measurements,
        {
          pageNum,
          pageSize,
          userIds: [String(session.userId)],
          tableName: scale.tableName,
        },
        session,
      );

      // The reference CLI decrypts this endpoint directly as an array.
      // Keep object wrappers as compatibility fallbacks.
      const pageRecord = asRecord(page);
      const pageItems = Array.isArray(page)
        ? page
        : Array.isArray(pageRecord.list)
          ? pageRecord.list
          : Array.isArray(pageRecord.records)
            ? pageRecord.records
            : Array.isArray(pageRecord.data)
              ? pageRecord.data
              : [];

      if (pageItems.length === 0) break;

      for (const item of pageItems) {
        const measurement = item as RenphoMeasurement;
        const ownerId = readNumber(
          asRecord(measurement),
          "userId",
          "bUserId",
        );
        // The CLI explicitly filters returned measurements by bUserId.
        if (ownerId === session.userId) {
          allMeasurements.push(measurement);
        }
      }

      if (
        allMeasurements.length >= requestedCount ||
        pageItems.length < pageSize
      ) {
        break;
      }
    }
  }

  const unique = new Map<string, RenphoMeasurement>();
  for (const measurement of allMeasurements) {
    if (measurement.id !== null && measurement.id !== undefined) {
      unique.set(String(measurement.id), measurement);
    }
  }

  return {
    measurements: [...unique.values()].sort(
      (a, b) => (b.timeStamp ?? 0) - (a.timeStamp ?? 0),
    ),
    userId: session.userId,
    tableName: firstTableName,
  };
}

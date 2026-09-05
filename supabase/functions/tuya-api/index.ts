const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TUYA_ACCESS_ID = Deno.env.get("TUYA_ACCESS_ID") ?? "";
const TUYA_ACCESS_SECRET = Deno.env.get("TUYA_ACCESS_SECRET") ?? "";
const TUYA_DEVICE_ID = Deno.env.get("TUYA_DEVICE_ID") ?? "";
const TUYA_BASE_URL =
  Deno.env.get("TUYA_BASE_URL") ?? "https://openapi.tuyaeu.com";

type TuyaResponse<T = unknown> = {
  success: boolean;
  result?: T;
  code?: number;
  msg?: string;
  t?: number;
};

type TokenResult = {
  access_token: string;
  expire_time?: number;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

type TuyaStatusItem = {
  code: string;
  value: unknown;
};

type TuyaDevice = {
  id?: string;
  name?: string;
  category?: string;
  product_id?: string;
  product_name?: string;
  online?: boolean;
  active_time?: number;
  create_time?: number;
  update_time?: number;
  node_id?: string;
  parent_id?: string;
  status?: TuyaStatusItem[];
};

type TuyaDeviceListResult = {
  list?: TuyaDevice[];
  devices?: TuyaDevice[];
  total?: number;
  has_more?: boolean;
  last_row_key?: string;
};

type TuyaDiagnosticAttempt = {
  name: string;
  path: string;
  query: Record<string, string>;
  success: boolean;
  result?: unknown;
  error?: string;
};

let tokenCache: CachedToken | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function assertEnvironment(): void {
  const missing: string[] = [];

  if (!TUYA_ACCESS_ID) missing.push("TUYA_ACCESS_ID");
  if (!TUYA_ACCESS_SECRET) missing.push("TUYA_ACCESS_SECRET");
  if (!TUYA_DEVICE_ID) missing.push("TUYA_DEVICE_ID");
  if (!TUYA_BASE_URL) missing.push("TUYA_BASE_URL");

  if (missing.length > 0) {
    throw new Error(
      `V Supabase Secrets chybí: ${missing.join(", ")}`,
    );
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return bytesToHex(digest);
}

async function hmacSha256(
  value: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );

  return bytesToHex(signature).toUpperCase();
}

function createNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function createCanonicalPath(
  path: string,
  query?: Record<string, string>,
): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const params = new URLSearchParams();

  Object.entries(query)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, value]) => {
      params.append(key, value);
    });

  return `${path}?${params.toString()}`;
}

async function createSignature(params: {
  method: string;
  canonicalPath: string;
  body?: string;
  accessToken?: string;
  timestamp: string;
  nonce: string;
}): Promise<string> {
  const {
    method,
    canonicalPath,
    body = "",
    accessToken = "",
    timestamp,
    nonce,
  } = params;

  const bodyHash = await sha256(body);

  const stringToSign = [
    method.toUpperCase(),
    bodyHash,
    "",
    canonicalPath,
  ].join("\n");

  const signatureInput =
    TUYA_ACCESS_ID +
    accessToken +
    timestamp +
    nonce +
    stringToSign;

  return await hmacSha256(
    signatureInput,
    TUYA_ACCESS_SECRET,
  );
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.value;
  }

  const method = "GET";
  const path = "/v1.0/token";
  const query = { grant_type: "1" };
  const canonicalPath = createCanonicalPath(path, query);

  const timestamp = Date.now().toString();
  const nonce = createNonce();

  const sign = await createSignature({
    method,
    canonicalPath,
    timestamp,
    nonce,
  });

  const response = await fetch(
    `${TUYA_BASE_URL}${canonicalPath}`,
    {
      method,
      headers: {
        client_id: TUYA_ACCESS_ID,
        sign,
        t: timestamp,
        nonce,
        sign_method: "HMAC-SHA256",
      },
    },
  );

  const payload =
    (await response.json()) as TuyaResponse<TokenResult>;

  if (
    !response.ok ||
    !payload.success ||
    !payload.result?.access_token
  ) {
    throw new Error(
      `Tuya token selhal: ${
        payload.code ?? response.status
      } – ${payload.msg ?? "Neznámá chyba"}`,
    );
  }

  const expiresInSeconds = Number(
    payload.result.expire_time ?? 7200,
  );

  tokenCache = {
    value: payload.result.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  return tokenCache.value;
}

async function tuyaRequest<T>(
  method: "GET" | "POST",
  path: string,
  options?: {
    query?: Record<string, string>;
    body?: unknown;
  },
): Promise<T> {
  const accessToken = await getAccessToken();

  const canonicalPath = createCanonicalPath(
    path,
    options?.query,
  );

  const body =
    options?.body === undefined
      ? ""
      : JSON.stringify(options.body);

  const timestamp = Date.now().toString();
  const nonce = createNonce();

  const sign = await createSignature({
    method,
    canonicalPath,
    body,
    accessToken,
    timestamp,
    nonce,
  });

  const response = await fetch(
    `${TUYA_BASE_URL}${canonicalPath}`,
    {
      method,
      headers: {
        client_id: TUYA_ACCESS_ID,
        access_token: accessToken,
        sign,
        t: timestamp,
        nonce,
        sign_method: "HMAC-SHA256",
        "Content-Type": "application/json",
      },
      body: method === "POST" ? body : undefined,
    },
  );

  const payload = (await response.json()) as TuyaResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(
      `Tuya API selhalo: ${
        payload.code ?? response.status
      } – ${payload.msg ?? "Neznámá chyba"}`,
    );
  }

  return payload.result as T;
}

async function getDeviceDetail(): Promise<unknown> {
  return await tuyaRequest(
    "GET",
    `/v1.0/devices/${TUYA_DEVICE_ID}`,
  );
}

async function getDeviceStatus(): Promise<TuyaStatusItem[]> {
  const result = await tuyaRequest<TuyaStatusItem[]>(
    "GET",
    `/v1.0/iot-03/devices/${TUYA_DEVICE_ID}/status`,
  );

  return Array.isArray(result) ? result : [];
}

function normalizeDeviceList(
  result: TuyaDevice[] | TuyaDeviceListResult | null | undefined,
): TuyaDevice[] {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.list)) {
    return result.list;
  }

  if (Array.isArray(result?.devices)) {
    return result.devices;
  }

  return [];
}

async function getSubDevices(): Promise<TuyaDevice[]> {
  const possiblePaths = [
    `/v1.0/iot-03/devices/${TUYA_DEVICE_ID}/sub-devices`,
    `/v1.0/devices/${TUYA_DEVICE_ID}/sub-devices`,
  ];

  for (const path of possiblePaths) {
    try {
      const result = await tuyaRequest<
        TuyaDevice[] | TuyaDeviceListResult
      >("GET", path);

      const devices = normalizeDeviceList(result);

      if (devices.length > 0) {
        return devices;
      }
    } catch (error) {
      console.warn(`Načtení podřízených zařízení selhalo pro ${path}:`, error);
    }
  }

  return [];
}

async function getProjectDevices(): Promise<TuyaDevice[]> {
  const possibleRequests = [
    {
      path: "/v1.3/iot-03/devices",
      query: { page_size: "100" },
    },
    {
      path: "/v1.0/iot-03/devices",
      query: { page_size: "100" },
    },
  ];

  for (const request of possibleRequests) {
    try {
      const result = await tuyaRequest<TuyaDeviceListResult>(
        "GET",
        request.path,
        {
          query: request.query,
        },
      );

      const devices = normalizeDeviceList(result);

      if (devices.length > 0) {
        return devices;
      }
    } catch (error) {
      console.warn(
        `Načtení zařízení projektu selhalo pro ${request.path}:`,
        error,
      );
    }
  }

  return [];
}

async function getDeviceStatusById(
  deviceId: string,
): Promise<TuyaStatusItem[]> {
  try {
    const result = await tuyaRequest<TuyaStatusItem[]>(
      "GET",
      `/v1.0/iot-03/devices/${deviceId}/status`,
    );

    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn(`Načtení stavu zařízení ${deviceId} selhalo:`, error);
    return [];
  }
}

async function enrichDeviceWithStatus(
  device: TuyaDevice,
): Promise<TuyaDevice> {
  if (!device?.id) {
    return device;
  }

  const status = await getDeviceStatusById(device.id);

  return {
    ...device,
    status,
  };
}

async function getSecurityDevices(): Promise<{
  subDevices: TuyaDevice[];
  projectDevices: TuyaDevice[];
  sensors: TuyaDevice[];
}> {
  const [subDevices, projectDevices] = await Promise.all([
    getSubDevices(),
    getProjectDevices(),
  ]);

  const merged = new Map<string, TuyaDevice>();

  [...subDevices, ...projectDevices].forEach((device) => {
    if (!device?.id || device.id === TUYA_DEVICE_ID) {
      return;
    }

    merged.set(device.id, {
      ...(merged.get(device.id) ?? {}),
      ...device,
    });
  });

  const sensors = await Promise.all(
    Array.from(merged.values()).map(enrichDeviceWithStatus),
  );

  return {
    subDevices,
    projectDevices,
    sensors,
  };
}

function createLogTimeRange(hours = 24): {
  startTime: string;
  endTime: string;
} {
  const endTime = Date.now();
  const safeHours =
    Number.isFinite(hours) && hours > 0
      ? Math.min(hours, 24 * 7)
      : 24;

  return {
    startTime: String(endTime - safeHours * 60 * 60 * 1000),
    endTime: String(endTime),
  };
}

async function runDiagnosticRequest(
  name: string,
  path: string,
  query: Record<string, string>,
): Promise<TuyaDiagnosticAttempt> {
  try {
    const result = await tuyaRequest<unknown>(
      "GET",
      path,
      { query },
    );

    return {
      name,
      path,
      query,
      success: true,
      result,
    };
  } catch (error) {
    return {
      name,
      path,
      query,
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Neznámá chyba při načítání diagnostiky.",
    };
  }
}

async function getDeviceOperationLogs(
  hours = 24,
): Promise<TuyaDiagnosticAttempt[]> {
  const { startTime, endTime } = createLogTimeRange(hours);

  return await Promise.all([
    runDiagnosticRequest(
      "legacy-operation-logs",
      `/v1.0/devices/${TUYA_DEVICE_ID}/logs`,
      {
        type: "1,2,3,4,5,6,7,8,9,10",
        start_time: startTime,
        end_time: endTime,
      },
    ),
    runDiagnosticRequest(
      "iot03-event-logs",
      `/v1.0/iot-03/devices/${TUYA_DEVICE_ID}/logs`,
      {
        type: "1,2,3,4,5,6,7,8,9,10",
        start_time: startTime,
        end_time: endTime,
      },
    ),
    runDiagnosticRequest(
      "cloud-operation-logs",
      `/v2.0/cloud/thing/${TUYA_DEVICE_ID}/logs`,
      {
        start_time: startTime,
        end_time: endTime,
        page_size: "100",
      },
    ),
  ]);
}

async function getDeviceReportLogs(
  hours = 24,
): Promise<TuyaDiagnosticAttempt[]> {
  const { startTime, endTime } = createLogTimeRange(hours);

  return await Promise.all([
    runDiagnosticRequest(
      "iot03-report-logs",
      `/v1.0/iot-03/devices/${TUYA_DEVICE_ID}/report-logs`,
      {
        start_time: startTime,
        end_time: endTime,
        size: "100",
      },
    ),
    runDiagnosticRequest(
      "cloud-report-logs-v2",
      `/v2.0/cloud/thing/${TUYA_DEVICE_ID}/report-logs`,
      {
        start_time: startTime,
        end_time: endTime,
        page_size: "100",
      },
    ),
    runDiagnosticRequest(
      "cloud-report-logs-v2.1",
      `/v2.1/cloud/thing/${TUYA_DEVICE_ID}/report-logs`,
      {
        start_time: startTime,
        end_time: endTime,
        page_size: "100",
      },
    ),
  ]);
}

async function getDeviceDiagnostics(
  hours = 24,
): Promise<{
  requestedHours: number;
  generatedAt: number;
  detail: unknown;
  status: TuyaStatusItem[];
  securityDevices: {
    subDevices: TuyaDevice[];
    projectDevices: TuyaDevice[];
    sensors: TuyaDevice[];
  };
  operationLogs: TuyaDiagnosticAttempt[];
  reportLogs: TuyaDiagnosticAttempt[];
}> {
  const [
    detail,
    status,
    securityDevices,
    operationLogs,
    reportLogs,
  ] = await Promise.all([
    getDeviceDetail(),
    getDeviceStatus(),
    getSecurityDevices(),
    getDeviceOperationLogs(hours),
    getDeviceReportLogs(hours),
  ]);

  return {
    requestedHours: hours,
    generatedAt: Date.now(),
    detail,
    status,
    securityDevices,
    operationLogs,
    reportLogs,
  };
}

async function inspectDevice(): Promise<{
  deviceId: string;
  detail: unknown;
  status: TuyaStatusItem[];
  functions: [];
  sensors: TuyaDevice[];
  sensorDiagnostics: {
    subDevicesFound: number;
    projectDevicesFound: number;
    mergedSensorsFound: number;
  };
}> {
  const [detail, status, securityDevices] = await Promise.all([
    getDeviceDetail(),
    getDeviceStatus(),
    getSecurityDevices(),
  ]);

  return {
    deviceId: TUYA_DEVICE_ID,
    detail,
    status,
    functions: [],
    sensors: securityDevices.sensors,
    sensorDiagnostics: {
      subDevicesFound: securityDevices.subDevices.length,
      projectDevicesFound: securityDevices.projectDevices.length,
      mergedSensorsFound: securityDevices.sensors.length,
    },
  };
}

async function waitForMode(
  requestedMode: string,
  timeoutMs = 7000,
): Promise<{
  status: TuyaStatusItem[];
  confirmed: boolean;
}> {
  const startedAt = Date.now();
  let lastStatus: TuyaStatusItem[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    lastStatus = await getDeviceStatus();

    const currentMode = lastStatus.find(
      (item) => item?.code === "master_mode",
    )?.value;

    if (currentMode === requestedMode) {
      return {
        status: lastStatus,
        confirmed: true,
      };
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
  }

  return {
    status: lastStatus,
    confirmed: false,
  };
}

async function setSecurityMode(mode: string): Promise<{
  commandAccepted: boolean;
  requestedMode: string;
  confirmed: boolean;
  status: TuyaStatusItem[];
}> {
  const normalizedMode = mode.trim();

  if (!normalizedMode) {
    throw new Error("Nebyl zadán režim alarmu.");
  }

  const commandAccepted = await tuyaRequest<boolean>(
    "POST",
    `/v1.0/iot-03/devices/${TUYA_DEVICE_ID}/commands`,
    {
      body: {
        commands: [
          {
            code: "master_mode",
            value: normalizedMode,
          },
        ],
      },
    },
  );

  if (!commandAccepted) {
    throw new Error("Alarm příkaz nepřijal.");
  }

  const verification = await waitForMode(normalizedMode);

  return {
    commandAccepted,
    requestedMode: normalizedMode,
    confirmed: verification.confirmed,
    status: verification.status,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Použij metodu POST.",
      },
      405,
    );
  }

  try {
    assertEnvironment();

    const body = await request.json().catch(() => ({}));
    const action = body?.action ?? "inspect";

    switch (action) {
      case "inspect": {
        const result = await inspectDevice();

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "detail": {
        const result = await getDeviceDetail();

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "status": {
        const result = await getDeviceStatus();

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "set-mode": {
        const mode =
          typeof body?.mode === "string"
            ? body.mode.trim()
            : "";

        if (!mode) {
          return jsonResponse(
            {
              success: false,
              error: "Chybí požadovaný režim alarmu.",
            },
            400,
          );
        }

        const result = await setSecurityMode(mode);

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "sensors": {
        const result = await getSecurityDevices();

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "logs": {
        const hours =
          typeof body?.hours === "number"
            ? body.hours
            : 24;

        const result = await getDeviceOperationLogs(hours);

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "report-logs": {
        const hours =
          typeof body?.hours === "number"
            ? body.hours
            : 24;

        const result = await getDeviceReportLogs(hours);

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      case "diagnostics": {
        const hours =
          typeof body?.hours === "number"
            ? body.hours
            : 24;

        const result = await getDeviceDiagnostics(hours);

        return jsonResponse({
          success: true,
          action,
          result,
        });
      }

      default:
        return jsonResponse(
          {
            success: false,
            error: `Neznámá akce: ${action}`,
            allowedActions: [
              "inspect",
              "detail",
              "status",
              "set-mode",
              "sensors",
              "logs",
              "report-logs",
              "diagnostics",
            ],
          },
          400,
        );
    }
  } catch (error) {
    console.error("tuya-api error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Neznámá chyba serveru.",
      },
      500,
    );
  }
});
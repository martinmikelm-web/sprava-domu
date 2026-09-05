import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_PUBLISHABLE_KEY."
  );
}

/*
 * Skutečný klient se používá pro:
 * - přihlášení a odhlášení,
 * - načtení vlastního profilu kvůli rozpoznání role,
 * - všechny ostré účty.
 */
const supabaseAuthStorage =
  typeof window !== "undefined"
    ? window.sessionStorage
    : undefined;

const realSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: supabaseAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const SANDBOX_MODE_KEY = "developer_sandbox_enabled";
const SANDBOX_DATA_KEY = "developer_sandbox_database_v1";

let sandboxEnabled =
  typeof window !== "undefined" &&
  window.sessionStorage.getItem(SANDBOX_MODE_KEY) === "1";

/*
 * Datová vrstva je po startu aplikace záměrně uzamčená.
 * Odemkne se až po načtení skutečného profilu a rozhodnutí,
 * zda se má použít produkce, nebo Developer Sandbox.
 */
let dataAccessResolved = sandboxEnabled;

let sandboxDatabase = loadSandboxDatabase();
const sandboxSubscriptions = new Set();

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `sandbox-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function clone(value) {
  if (value === undefined) return undefined;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function loadSandboxDatabase() {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.sessionStorage.getItem(SANDBOX_DATA_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn("Sandboxová data se nepodařilo načíst:", error);
    return {};
  }
}

function persistSandboxDatabase() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      SANDBOX_DATA_KEY,
      JSON.stringify(sandboxDatabase)
    );
  } catch (error) {
    console.warn("Sandboxová data se nepodařilo uložit:", error);
  }
}

function getTable(tableName) {
  if (!Array.isArray(sandboxDatabase[tableName])) {
    sandboxDatabase[tableName] = [];
  }

  return sandboxDatabase[tableName];
}

function setTable(tableName, rows) {
  sandboxDatabase[tableName] = clone(rows);
  persistSandboxDatabase();
  notifySandboxSubscribers(tableName);
}

function notifySandboxSubscribers(tableName) {
  for (const subscription of sandboxSubscriptions) {
    if (
      subscription.table &&
      subscription.table !== tableName
    ) {
      continue;
    }

    try {
      subscription.callback({
        eventType: "*",
        schema: "public",
        table: tableName,
        new: null,
        old: null,
        sandbox: true,
      });
    } catch (error) {
      console.warn("Sandbox Realtime callback selhal:", error);
    }
  }
}

function getNestedValue(row, field) {
  return String(field || "")
    .split(".")
    .reduce((value, key) => value?.[key], row);
}

function valuesEqual(first, second) {
  if (second === null) {
    return first === null || first === undefined;
  }

  return String(first) === String(second);
}

function sqlLikeToRegExp(value, insensitive = false) {
  const escaped = String(value ?? "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("%", ".*")
    .replaceAll("_", ".");

  return new RegExp(`^${escaped}$`, insensitive ? "i" : "");
}

function parseOrExpression(expression) {
  return String(expression || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [column, operator, ...rest] = part.split(".");
      return {
        column,
        operator,
        value: rest.join("."),
      };
    });
}

function matchesSimpleCondition(row, condition) {
  const value = getNestedValue(row, condition.column);

  switch (condition.operator) {
    case "eq":
      return valuesEqual(value, condition.value);
    case "neq":
      return !valuesEqual(value, condition.value);
    case "is":
      return condition.value === "null"
        ? value === null || value === undefined
        : valuesEqual(value, condition.value);
    case "in": {
      const values = String(condition.value || "")
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .map((item) => item.trim());
      return values.some((item) => valuesEqual(value, item));
    }
    default:
      return true;
  }
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = getNestedValue(row, filter.column);

      switch (filter.type) {
        case "eq":
          return valuesEqual(value, filter.value);
        case "neq":
          return !valuesEqual(value, filter.value);
        case "gt":
          return Number(value) > Number(filter.value);
        case "gte":
          return Number(value) >= Number(filter.value);
        case "lt":
          return Number(value) < Number(filter.value);
        case "lte":
          return Number(value) <= Number(filter.value);
        case "in":
          return (filter.value || []).some((item) =>
            valuesEqual(value, item)
          );
        case "is":
          return valuesEqual(value, filter.value);
        case "like":
          return sqlLikeToRegExp(filter.value).test(
            String(value ?? "")
          );
        case "ilike":
          return sqlLikeToRegExp(filter.value, true).test(
            String(value ?? "")
          );
        case "contains":
          if (Array.isArray(value)) {
            return (filter.value || []).every((item) =>
              value.includes(item)
            );
          }

          if (
            value &&
            typeof value === "object" &&
            filter.value &&
            typeof filter.value === "object"
          ) {
            return Object.entries(filter.value).every(
              ([key, expected]) =>
                valuesEqual(value[key], expected)
            );
          }

          return false;
        case "or":
          return filter.conditions.some((condition) =>
            matchesSimpleCondition(row, condition)
          );
        default:
          return true;
      }
    })
  );
}

function normalizeRows(payload) {
  const sourceRows = Array.isArray(payload) ? payload : [payload];

  return sourceRows.map((sourceRow) => {
    const row = clone(sourceRow || {});
    const now = new Date().toISOString();

    return {
      ...row,
      id: row.id || createId(),
      created_at: row.created_at || now,
      updated_at: now,
      __sandbox: true,
    };
  });
}

function selectColumns(rows, columns) {
  /*
   * Hvězdička a relační selecty vrací celý lokální objekt.
   * Relační hodnoty, které si modul vytvořil lokálně, tak zůstanou
   * dostupné. Neprovádí se žádný dotaz do ostré databáze.
   */
  if (!columns || columns === "*" || columns.includes("(")) {
    return clone(rows);
  }

  const requestedColumns = columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);

  return rows.map((row) =>
    requestedColumns.reduce((result, column) => {
      result[column] = row[column];
      return result;
    }, {})
  );
}


class BlockedQuery {
  constructor(tableName) {
    this.tableName = tableName;
  }

  select() { return this; }
  insert() { return this; }
  update() { return this; }
  upsert() { return this; }
  delete() { return this; }
  eq() { return this; }
  neq() { return this; }
  gt() { return this; }
  gte() { return this; }
  lt() { return this; }
  lte() { return this; }
  in() { return this; }
  is() { return this; }
  like() { return this; }
  ilike() { return this; }
  contains() { return this; }
  containedBy() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  filter() { return this; }
  match() { return this; }
  or() { return this; }
  not() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  abortSignal() { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  csv() { return this; }

  async execute() {
    return {
      data: null,
      error: {
        name: "DataAccessNotResolved",
        message:
          `Datový přístup k tabulce "${this.tableName}" je dočasně uzamčen, ` +
          "dokud aplikace nerozpozná režim uživatele.",
      },
      count: 0,
      status: 423,
      statusText: "Locked",
    };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  finally(callback) {
    return this.execute().finally(callback);
  }
}

function createBlockedChannel() {
  const channel = {
    on() {
      return channel;
    },
    subscribe(callback) {
      if (typeof callback === "function") {
        queueMicrotask(() => callback("CLOSED"));
      }
      return channel;
    },
    unsubscribe() {
      return Promise.resolve("ok");
    },
    send() {
      return Promise.resolve("ok");
    },
    track() {
      return Promise.resolve("ok");
    },
    untrack() {
      return Promise.resolve("ok");
    },
  };

  return channel;
}

const blockedApi = {
  from(tableName) {
    return new BlockedQuery(tableName);
  },

  async rpc() {
    return {
      data: null,
      error: {
        name: "DataAccessNotResolved",
        message:
          "Datový přístup je uzamčen, dokud aplikace nerozpozná režim uživatele.",
      },
    };
  },

  functions: {
    async invoke() {
      return {
        data: null,
        error: {
          name: "DataAccessNotResolved",
          message:
            "Volání funkcí je uzamčeno, dokud aplikace nerozpozná režim uživatele.",
        },
      };
    },
  },

  storage: {
    from() {
      const lockedError = {
        name: "DataAccessNotResolved",
        message: "Úložiště je dočasně uzamčeno.",
      };

      return {
        async upload() { return { data: null, error: lockedError }; },
        async update() { return { data: null, error: lockedError }; },
        async remove() { return { data: null, error: lockedError }; },
        async list() { return { data: null, error: lockedError }; },
        async download() { return { data: null, error: lockedError }; },
        async createSignedUrl() {
          return { data: null, error: lockedError };
        },
        getPublicUrl() {
          return { data: { publicUrl: "" } };
        },
      };
    },
  },

  channel() {
    return createBlockedChannel();
  },

  removeChannel(channel) {
    return channel?.unsubscribe?.() || Promise.resolve("ok");
  },

  removeAllChannels() {
    return Promise.resolve([]);
  },

  getChannels() {
    return [];
  },
};

class SandboxQuery {
  constructor(tableName) {
    this.tableName = tableName;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
    this.selectedColumns = "*";
    this.orderRules = [];
    this.limitValue = null;
    this.rangeValue = null;
    this.returnMode = "many";
    this.upsertOptions = {};
    this.shouldReturnRepresentation = false;
  }

  select(columns = "*") {
    this.selectedColumns = columns;
    this.shouldReturnRepresentation = true;
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload, options = {}) {
    this.operation = "upsert";
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  gt(column, value) {
    this.filters.push({ type: "gt", column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ type: "gte", column, value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ type: "lt", column, value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  in(column, value) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  is(column, value) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  like(column, value) {
    this.filters.push({ type: "like", column, value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ type: "ilike", column, value });
    return this;
  }

  contains(column, value) {
    this.filters.push({ type: "contains", column, value });
    return this;
  }

  containedBy() {
    return this;
  }

  overlaps() {
    return this;
  }

  textSearch() {
    return this;
  }

  filter(column, operator, value) {
    const supportedMethod = this[operator];

    if (typeof supportedMethod === "function") {
      supportedMethod.call(this, column, value);
    }

    return this;
  }

  match(values = {}) {
    Object.entries(values).forEach(([column, value]) => {
      this.eq(column, value);
    });

    return this;
  }

  or(expression) {
    this.filters.push({
      type: "or",
      conditions: parseOrExpression(expression),
    });
    return this;
  }

  not() {
    return this;
  }

  order(column, options = {}) {
    this.orderRules.push({
      column,
      ascending: options.ascending !== false,
      nullsFirst: Boolean(options.nullsFirst),
    });
    return this;
  }

  limit(value) {
    this.limitValue = Number(value);
    return this;
  }

  range(from, to) {
    this.rangeValue = [Number(from), Number(to)];
    return this;
  }

  abortSignal() {
    return this;
  }

  single() {
    this.returnMode = "single";
    return this;
  }

  maybeSingle() {
    this.returnMode = "maybeSingle";
    return this;
  }

  csv() {
    this.returnMode = "csv";
    return this;
  }

  async execute() {
    let tableRows = clone(getTable(this.tableName));
    let matchedRows = applyFilters(tableRows, this.filters);
    let resultRows = matchedRows;

    if (this.operation === "insert") {
      resultRows = normalizeRows(this.payload);
      setTable(this.tableName, [...tableRows, ...resultRows]);
    }

    if (this.operation === "update") {
      const patch = clone(this.payload || {});
      const matchingIndexes = new Set(
        tableRows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) =>
            applyFilters([row], this.filters).length > 0
          )
          .map(({ index }) => index)
      );

      tableRows = tableRows.map((row, index) =>
        matchingIndexes.has(index)
          ? {
              ...row,
              ...patch,
              updated_at: new Date().toISOString(),
              __sandbox: true,
            }
          : row
      );

      resultRows = tableRows.filter((_, index) =>
        matchingIndexes.has(index)
      );
      setTable(this.tableName, tableRows);
    }

    if (this.operation === "upsert") {
      const incomingRows = normalizeRows(this.payload);
      const conflictColumns = String(
        this.upsertOptions?.onConflict || "id"
      )
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);

      for (const incomingRow of incomingRows) {
        const existingIndex = tableRows.findIndex((existingRow) =>
          conflictColumns.every((column) =>
            valuesEqual(
              existingRow[column],
              incomingRow[column]
            )
          )
        );

        if (existingIndex >= 0) {
          tableRows[existingIndex] = {
            ...tableRows[existingIndex],
            ...incomingRow,
            updated_at: new Date().toISOString(),
            __sandbox: true,
          };
        } else {
          tableRows.push(incomingRow);
        }
      }

      resultRows = incomingRows;
      setTable(this.tableName, tableRows);
    }

    if (this.operation === "delete") {
      const deletedRows = applyFilters(tableRows, this.filters);

      tableRows = tableRows.filter(
        (row) => !applyFilters([row], this.filters).length
      );

      resultRows = deletedRows;
      setTable(this.tableName, tableRows);
    }

    for (const rule of this.orderRules) {
      resultRows.sort((firstRow, secondRow) => {
        const first = getNestedValue(firstRow, rule.column);
        const second = getNestedValue(secondRow, rule.column);

        if (first == null && second == null) return 0;
        if (first == null) return rule.nullsFirst ? -1 : 1;
        if (second == null) return rule.nullsFirst ? 1 : -1;

        const comparison = String(first).localeCompare(
          String(second),
          "cs",
          { numeric: true }
        );

        return rule.ascending ? comparison : -comparison;
      });
    }

    if (this.rangeValue) {
      resultRows = resultRows.slice(
        this.rangeValue[0],
        this.rangeValue[1] + 1
      );
    }

    if (Number.isFinite(this.limitValue)) {
      resultRows = resultRows.slice(0, this.limitValue);
    }

    resultRows = selectColumns(
      resultRows,
      this.selectedColumns
    );

    if (this.returnMode === "csv") {
      return {
        data: "",
        error: null,
        count: resultRows.length,
        status: 200,
        statusText: "OK",
      };
    }

    if (
      this.returnMode === "single" ||
      this.returnMode === "maybeSingle"
    ) {
      return {
        data: resultRows[0] || null,
        error: null,
        count: resultRows.length,
        status: 200,
        statusText: "OK",
      };
    }

    return {
      data:
        this.operation === "select" ||
        this.shouldReturnRepresentation
          ? resultRows
          : null,
      error: null,
      count: resultRows.length,
      status: 200,
      statusText: "OK",
    };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  finally(callback) {
    return this.execute().finally(callback);
  }
}

function createSandboxChannel(channelName) {
  const registeredSubscriptions = [];

  const channel = {
    on(_eventType, filter, callback) {
      if (typeof callback === "function") {
        const subscription = {
          channelName,
          table: filter?.table || null,
          callback,
        };

        registeredSubscriptions.push(subscription);
        sandboxSubscriptions.add(subscription);
      }

      return channel;
    },

    subscribe(callback) {
      if (typeof callback === "function") {
        queueMicrotask(() => callback("SUBSCRIBED"));
      }

      return channel;
    },

    unsubscribe() {
      for (const subscription of registeredSubscriptions) {
        sandboxSubscriptions.delete(subscription);
      }

      return Promise.resolve("ok");
    },

    send() {
      return Promise.resolve("ok");
    },

    track() {
      return Promise.resolve("ok");
    },

    untrack() {
      return Promise.resolve("ok");
    },
  };

  return channel;
}

const sandboxStorageBucket = {
  async upload(path, file) {
    const storagePath =
      path || `sandbox/${createId()}-${file?.name || "soubor"}`;

    const files = getTable("__storage_files");

    setTable("__storage_files", [
      ...files,
      {
        id: createId(),
        path: storagePath,
        name: file?.name || "soubor",
        type: file?.type || "application/octet-stream",
        size: file?.size || 0,
        created_at: new Date().toISOString(),
        __sandbox: true,
      },
    ]);

    return {
      data: { path: storagePath },
      error: null,
    };
  },

  async update(path, file) {
    return this.upload(path, file);
  },

  async remove(paths = []) {
    const pathSet = new Set(paths);
    setTable(
      "__storage_files",
      getTable("__storage_files").filter(
        (file) => !pathSet.has(file.path)
      )
    );

    return { data: [], error: null };
  },

  async list(prefix = "") {
    return {
      data: getTable("__storage_files").filter((file) =>
        String(file.path).startsWith(prefix)
      ),
      error: null,
    };
  },

  async download() {
    return {
      data: new Blob([]),
      error: null,
    };
  },

  async createSignedUrl(path) {
    return {
      data: {
        signedUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(
          `Sandboxový soubor: ${path}`
        )}`,
      },
      error: null,
    };
  },

  getPublicUrl(path) {
    return {
      data: {
        publicUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(
          `Sandboxový soubor: ${path}`
        )}`,
      },
    };
  },
};

const sandboxApi = {
  from(tableName) {
    return new SandboxQuery(tableName);
  },

  async rpc(functionName, params = {}) {
    return {
      data: {
        success: true,
        sandbox: true,
        functionName,
        params,
      },
      error: null,
    };
  },

  functions: {
    async invoke(functionName, options = {}) {
      if (
        functionName === "create-user" ||
        functionName === "user-admin"
      ) {
        const userId = createId();
        const body = options?.body || {};
        const profile = {
          id: userId,
          full_name:
            body.full_name ||
            body.fullName ||
            body.name ||
            "Sandboxový uživatel",
          username:
            body.username ||
            body.email ||
            `sandbox-${userId.slice(0, 8)}`,
          active: body.active !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          __sandbox: true,
        };

        setTable("profiles", [
          ...getTable("profiles"),
          profile,
        ]);

        return {
          data: {
            success: true,
            user_id: userId,
            profile,
            sandbox: true,
            message:
              "Uživatel byl vytvořen pouze v Developer Sandboxu.",
          },
          error: null,
        };
      }

      if (functionName === "tuya-api") {
        return {
          data: {
            success: true,
            sandbox: true,
            result: null,
            devices: [],
            message:
              "Developer Sandbox není připojený ke skutečnému zabezpečení.",
          },
          error: null,
        };
      }

      return {
        data: {
          success: true,
          sandbox: true,
          result: null,
          body: options?.body || null,
        },
        error: null,
      };
    },
  },

  storage: {
    from() {
      return sandboxStorageBucket;
    },
  },

  channel(channelName) {
    return createSandboxChannel(channelName);
  },

  removeChannel(channel) {
    return channel?.unsubscribe?.() || Promise.resolve("ok");
  },

  removeAllChannels() {
    sandboxSubscriptions.clear();
    return Promise.resolve([]);
  },

  getChannels() {
    return [];
  },
};


function removeRowsById(tableName, id) {
  setTable(
    tableName,
    getTable(tableName).filter(
      (row) => String(row?.id) !== String(id)
    )
  );
}

function seedSandboxIdentity(context = {}) {
  const user = context?.user || null;
  const profile = context?.profile || null;
  const roles = Array.isArray(context?.roles)
    ? context.roles
    : [];

  const userId = user?.id || profile?.id || null;
  if (!userId) return;

  const safeProfile = {
    id: userId,
    full_name:
      profile?.full_name ||
      user?.user_metadata?.full_name ||
      "IT programátor",
    username:
      profile?.username ||
      user?.email ||
      "it-programator",
    // Starší stránky aplikace stále kontrolují profiles.role.
    // V sandboxu proto programátor dostane správcovskou roli,
    // aniž by se jakkoli měnil jeho ostrý profil v Supabase.
    role: "správce",
    roles: ["it_programmer", "správce"],
    active: profile?.active !== false,
    created_at:
      profile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    __sandbox_identity: true,
    __sandbox: true,
  };

  removeRowsById("profiles", userId);
  setTable("profiles", [
    safeProfile,
    ...getTable("profiles"),
  ]);

  setTable(
    "profile_roles",
    getTable("profile_roles").filter(
      (row) => String(row?.user_id) !== String(userId)
    )
  );

  const normalizedRoles = Array.from(
    new Set([
      ...(roles.length ? roles : ["it_programmer"]),
      "správce",
    ])
  );

  setTable("profile_roles", [
    ...normalizedRoles.map((roleKey) => ({
      id: createId(),
      user_id: userId,
      role_key:
        typeof roleKey === "string"
          ? roleKey
          : roleKey?.role_key,
      created_at: new Date().toISOString(),
      __sandbox_identity: true,
      __sandbox: true,
    })),
    ...getTable("profile_roles"),
  ]);
}

export function setDeveloperPreviewMode(enabled, context = {}) {
  const nextEnabled = Boolean(enabled);
  const changed = sandboxEnabled !== nextEnabled;

  sandboxEnabled = nextEnabled;
  dataAccessResolved = true;

  if (typeof window !== "undefined") {
    if (sandboxEnabled) {
      window.sessionStorage.setItem(SANDBOX_MODE_KEY, "1");
      seedSandboxIdentity(context);
      persistSandboxDatabase();
    } else {
      window.sessionStorage.removeItem(SANDBOX_MODE_KEY);
    }

    if (changed) {
      window.dispatchEvent(
        new CustomEvent("developer-preview-mode-changed", {
          detail: { enabled: sandboxEnabled },
        })
      );
    }
  }
}

export function isDeveloperPreviewMode() {
  return sandboxEnabled;
}

export function isDataAccessResolved() {
  return dataAccessResolved;
}

export function resetDataAccessMode() {
  dataAccessResolved = false;
  sandboxEnabled = false;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SANDBOX_MODE_KEY);
    window.dispatchEvent(
      new CustomEvent("developer-preview-mode-changed", {
        detail: { enabled: false, resolved: false },
      })
    );
  }
}

export function clearDeveloperPreviewData(options = {}) {
  const preserveIdentity = options?.preserveIdentity !== false;
  const identityProfiles = preserveIdentity
    ? getTable("profiles").filter(
        (row) => row?.__sandbox_identity
      )
    : [];
  const identityRoles = preserveIdentity
    ? getTable("profile_roles").filter(
        (row) => row?.__sandbox_identity
      )
    : [];

  sandboxDatabase = preserveIdentity
    ? {
        profiles: identityProfiles,
        profile_roles: identityRoles,
      }
    : {};

  sandboxSubscriptions.clear();
  persistSandboxDatabase();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("developer-sandbox-data-changed")
    );
  }
}

export function getDeveloperPreviewSnapshot() {
  return clone(sandboxDatabase);
}

function normalizeImportedSnapshot(snapshot) {
  const rawSnapshot =
    snapshot?.data && typeof snapshot.data === "object"
      ? snapshot.data
      : snapshot?.tables && typeof snapshot.tables === "object"
        ? snapshot.tables
        : snapshot;

  const normalized =
    rawSnapshot &&
    typeof rawSnapshot === "object" &&
    !Array.isArray(rawSnapshot)
      ? clone(rawSnapshot)
      : {};

  for (const [tableName, rows] of Object.entries(normalized)) {
    if (!Array.isArray(rows)) {
      delete normalized[tableName];
      continue;
    }

    normalized[tableName] = rows.map((row) => ({
      ...clone(row || {}),
      __sandbox: true,
    }));
  }

  const apartments = Array.isArray(normalized.apartments)
    ? normalized.apartments
    : [];
  const tenants = Array.isArray(normalized.tenants)
    ? normalized.tenants
    : [];

  if (Array.isArray(normalized.houses)) {
    normalized.houses = normalized.houses.map((house) => {
      const houseApartments = apartments.filter(
        (apartment) =>
          String(apartment?.house_id) === String(house?.id)
      );
      const apartmentIds = new Set(
        houseApartments.map((apartment) => String(apartment?.id))
      );
      const houseTenants = tenants.filter(
        (tenant) =>
          String(tenant?.house_id) === String(house?.id) ||
          apartmentIds.has(String(tenant?.apartment_id))
      );

      return {
        ...house,
        id: house.id || createId(),
        name: house.name || house.title || "Sandboxový dům",
        street: house.street || house.address || "",
        house_number: house.house_number || "",
        zip_code: house.zip_code || house.postal_code || "",
        city: house.city || "",
        country: house.country || "Česká republika",
        units:
          house.units ??
          house.unit_count ??
          houseApartments.length,
        tenants:
          house.tenants ??
          house.tenant_count ??
          houseTenants.length,
        manager_name:
          house.manager_name || house.manager || "",
        description: house.description || "",
        image_url: house.image_url || house.image || "",
        active: house.active !== false,
        created_at: house.created_at || new Date().toISOString(),
        updated_at: house.updated_at || new Date().toISOString(),
        __sandbox: true,
      };
    });
  }

  return normalized;
}

export function importDeveloperPreviewSnapshot(snapshot) {
  const identityProfiles = getTable("profiles").filter(
    (row) => row?.__sandbox_identity
  );
  const identityRoles = getTable("profile_roles").filter(
    (row) => row?.__sandbox_identity
  );

  sandboxDatabase = normalizeImportedSnapshot(snapshot);

  sandboxDatabase.profiles = [
    ...identityProfiles,
    ...(Array.isArray(sandboxDatabase.profiles)
      ? sandboxDatabase.profiles.filter(
          (row) => !row?.__sandbox_identity
        )
      : []),
  ];

  sandboxDatabase.profile_roles = [
    ...identityRoles,
    ...(Array.isArray(sandboxDatabase.profile_roles)
      ? sandboxDatabase.profile_roles.filter(
          (row) => !row?.__sandbox_identity
        )
      : []),
  ];

  persistSandboxDatabase();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("developer-sandbox-data-changed")
    );
  }
}

export function getDeveloperPreviewStats() {
  return Object.entries(sandboxDatabase).reduce(
    (stats, [tableName, rows]) => {
      if (!Array.isArray(rows)) return stats;

      stats.tables += 1;
      stats.records += rows.filter(
        (row) => !row?.__sandbox_identity
      ).length;
      stats.byTable[tableName] = rows.filter(
        (row) => !row?.__sandbox_identity
      ).length;
      return stats;
    },
    {
      tables: 0,
      records: 0,
      byTable: {},
    }
  );
}

export const supabase = new Proxy(realSupabase, {
  get(target, property, receiver) {
    /*
     * Auth musí zůstat skutečný. Developer Sandbox představuje datovou
     * vrstvu aplikace, nikoli falešné přihlášení.
     */
    if (property === "auth") {
      return target.auth;
    }

    if (!dataAccessResolved) {
      if (property in blockedApi) {
        return blockedApi[property];
      }

      return Reflect.get(target, property, receiver);
    }

    if (!sandboxEnabled) {
      return Reflect.get(target, property, receiver);
    }

    if (property in sandboxApi) {
      return sandboxApi[property];
    }

    return Reflect.get(target, property, receiver);
  },
});

export { realSupabase };

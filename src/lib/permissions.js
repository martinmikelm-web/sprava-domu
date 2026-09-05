import { supabase } from "./supabase";

export const ROLE_KEYS = {
  IT_PROGRAMMER: "it_programmer",
  MANAGER: "manager",
  OWNER: "owner",
  TENANT: "tenant",
  SUBTENANT: "subtenant",
};

export const ROLE_OPTIONS = [
  {
    value: ROLE_KEYS.IT_PROGRAMMER,
    label: "IT programátor",
    description:
      "Vývoj aplikace bez přístupu k reálným datům.",
  },
  {
    value: ROLE_KEYS.MANAGER,
    label: "Správce",
    description:
      "Plný přístup ke všem domům, uživatelům i oprávněním.",
  },
  {
    value: ROLE_KEYS.OWNER,
    label: "Majitel",
    description:
      "Přístup pouze k přiděleným domům.",
  },
  {
    value: ROLE_KEYS.TENANT,
    label: "Nájemce",
    description:
      "Výchozí pouze čtení. Správce může oprávnění rozšířit.",
  },
  {
    value: ROLE_KEYS.SUBTENANT,
    label: "Podnájemce",
    description:
      "Přístup pouze k přiděleným bytům.",
  },
];

export const GLOBAL_PERMISSION_MODULES = new Set([
  "houses",
  "users",
]);

export const EMPTY_MODULE_PERMISSION = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_manage: false,
};

export function normalizeRoles(roles) {
  const list = Array.isArray(roles) ? roles : [roles];

  return [
    ...new Set(
      list
        .map((r) => {
          if (typeof r === "string") return r;
          return r?.role_key || r?.value || "";
        })
        .map((r) => String(r).trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function hasRole(roles, roleKey) {
  return normalizeRoles(roles).includes(roleKey);
}

export function isAdministratorRole(roles) {
  return hasRole(roles, ROLE_KEYS.MANAGER);
}

export function isDeveloperRole(roles) {
  return hasRole(roles, ROLE_KEYS.IT_PROGRAMMER);
}

export function getRoleLabel(roleKey) {
  const role = ROLE_OPTIONS.find((r) => r.value === roleKey);
  return role ? role.label : roleKey;
}

export function createPermissionMap(moduleKeys = []) {
  return moduleKeys.reduce((result, key) => {
    result[key] = { ...EMPTY_MODULE_PERMISSION };
    return result;
  }, {});
}

export function normalizePermission(row) {
  return {
    can_view: !!row?.can_view,
    can_create: !!row?.can_create,
    can_edit: !!row?.can_edit,
    can_delete: !!row?.can_delete,
    can_manage: !!row?.can_manage,
  };
}

export function hasPermission(permission, action = "view") {
  if (!permission) return false;

  // Každý sloupec je samostatné oprávnění.
  // can_manage nesmí automaticky povolit vytvoření, úpravu ani mazání.
  const key = action.startsWith("can_")
    ? action
    : `can_${action}`;

  return !!permission[key];
}

function grantAll(permissionMap, moduleKeys) {
  moduleKeys.forEach((key) => {
    permissionMap[key] = {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_manage: true,
    };
  });

  return permissionMap;
}

export async function loadApplicationPermissions({
  userId,
  roles,
  houseId,
  moduleKeys,
}) {
  const permissionMap = createPermissionMap(moduleKeys);

  if (!userId) {
    return permissionMap;
  }

  const normalizedRoles = normalizeRoles(roles);

  // Správce systému musí mít možnost oprávnění nastavovat a obnovit.
  // IT programátor má plný přístup pouze přes izolovaný Developer Sandbox.
  // V produkci nemá žádná role automatický přístup ke všem modulům.
  // Výjimkou je pouze izolovaný Developer Sandbox.
  if (hasRole(normalizedRoles, ROLE_KEYS.IT_PROGRAMMER)) {
    return grantAll(permissionMap, moduleKeys);
  }

  let query = supabase
    .from("app_permissions")
    .select(`
      house_id,
      module_key,
      can_view,
      can_create,
      can_edit,
      can_delete,
      can_manage
    `)
    .eq("user_id", userId);

  if (houseId) {
    query = query.or(
      `house_id.eq.${houseId},house_id.is.null`
    );
  } else {
    query = query.is("house_id", null);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  for (const row of data || []) {
    if (!permissionMap[row.module_key]) continue;

    const isGlobal =
      GLOBAL_PERMISSION_MODULES.has(row.module_key);

    const validGlobal =
      isGlobal && row.house_id === null;

    const validHouse =
      !isGlobal &&
      houseId &&
      row.house_id === houseId;

    if (!validGlobal && !validHouse) {
      continue;
    }

    permissionMap[row.module_key] =
      normalizePermission(row);
  }

  return permissionMap;
}
import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Image,
  LayoutDashboard,
  Users,
  UsersRound,
  CalendarDays,
  Wrench,
  MessageSquareText,
  Camera,
  KeyRound,
  Landmark,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  GLOBAL_PERMISSION_MODULES,
  createPermissionMap,
  hasPermission,
} from "../lib/permissions";

const HOUSE_TABLE = "houses";
const USERS_TABLE = "profiles";
const PERMISSIONS_TABLE = "app_permissions";

const DEFAULT_SETTINGS = {
  id: null,
  owner_id: null,
  units: 1,
  tenants: 0,
  balance: 0,
  repairs: 0,
  color: "#256b55",
  house_name: "",
  street: "",
  house_number: "",
  zip_code: "",
  city: "",
  country: "Česká republika",
  description: "",
  ico: "",
  dic: "",
  manager_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  bank_account: "",
  variable_symbol: "",
  currency: "CZK",
  rent_due_day: 15,
  advances_due_day: 15,
  automatic_reminders: true,
  email_notifications: true,
  push_notifications: true,
  sms_notifications: false,
  logo_url: "",
  cover_image_url: "",
  updated_at: null,
};

const EMPTY_PERMISSION = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_manage: false,
};

const PERMISSION_COLUMNS = [
  { key: "can_view", label: "Zobrazit" },
  { key: "can_create", label: "Vytvořit" },
  { key: "can_edit", label: "Upravit" },
  { key: "can_delete", label: "Smazat" },
  { key: "can_manage", label: "Spravovat" },
];

const SECTIONS = [
  { key: "general", title: "Obecné", description: "Základní údaje o domu", icon: Building2 },
  { key: "finance", title: "Finance", description: "Účet a splatnosti", icon: WalletCards },
  { key: "legal", title: "Právní údaje", description: "IČO, DIČ a kontakty", icon: FileText },
  { key: "notifications", title: "Notifikace", description: "E-mail, push a SMS", icon: Bell },
  { key: "permissions", title: "Oprávnění", description: "Přístupy uživatelů k modulům", icon: KeyRound },
  { key: "media", title: "Média", description: "Logo a fotografie domu", icon: Image },
];

function normalizeDay(value, fallback = 15) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 31);
}

function getInitials(fullName, username) {
  const source = String(fullName || username || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getRoleLabel(role) {
  const labels = {
    owner: "Majitel",
    admin: "Administrátor",
    manager: "Správce",
    user: "Uživatel",
  };

  return labels[role] || role || "Bez role";
}

const PERMISSION_MODULE_ITEMS = [
  { key: "houses", title: "Správa domů", icon: Building2, global: true },
  { key: "dashboard", title: "Přehled", icon: LayoutDashboard },
  { key: "apartments", title: "Byty", icon: Building2 },
  { key: "tenants", title: "Nájemníci", icon: Users },
  { key: "finance", title: "Finance", icon: WalletCards },
  { key: "calendar", title: "Kalendář", icon: CalendarDays },
  { key: "repairs", title: "Opravy", icon: Wrench },
  { key: "notice-board", title: "Nástěnka", icon: MessageSquareText },
  { key: "chat", title: "Online chat", icon: MessageSquareText },
  { key: "documents", title: "Dokumenty", icon: FileText },
  { key: "cameras", title: "Kamery", icon: Camera },
  { key: "security", title: "Zabezpečení", icon: ShieldCheck },
  { key: "users", title: "Uživatelé", icon: UsersRound, global: true },
  { key: "house-settings", title: "Nastavení domu", icon: Settings },
];

function createEmptyPermissionMap() {
  return createPermissionMap(
    PERMISSION_MODULE_ITEMS.map((item) => item.key)
  );
}

function mapHouseRowToSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };

  const legacyAddress = String(row.address || "").trim();
  const hasStructuredAddress = Boolean(
    String(row.street || "").trim() ||
      String(row.house_number || "").trim() ||
      String(row.zip_code || "").trim() ||
      String(row.city || "").trim()
  );

  return {
    ...DEFAULT_SETTINGS,
    id: row.id || null,
    owner_id: row.owner_id || null,
    house_name: row.name || "",
    street: row.street || (!hasStructuredAddress ? legacyAddress : ""),
    house_number: row.house_number || "",
    zip_code: row.zip_code || "",
    city: row.city || "",
    country: row.country || "Česká republika",
    description: row.description || "",
    ico: row.ico || "",
    dic: row.dic || "",
    manager_name: row.manager_name || "",
    contact_name: row.contact_name || "",
    contact_email: row.contact_email || "",
    contact_phone: row.contact_phone || "",
    bank_account: row.bank_account || "",
    variable_symbol: row.variable_symbol || "",
    currency: row.currency || "CZK",
    rent_due_day: normalizeDay(row.rent_due_day, 15),
    advances_due_day: normalizeDay(row.advances_due_day, 15),
    automatic_reminders: row.automatic_reminders !== false,
    email_notifications: row.email_notifications !== false,
    push_notifications: row.push_notifications !== false,
    sms_notifications: Boolean(row.sms_notifications),
    logo_url: row.logo_url || "",
    cover_image_url: row.cover_image_url || row.image_url || "",
    units: Number(row.units ?? 1),
    tenants: Number(row.tenants ?? 0),
    balance: Number(row.balance ?? 0),
    repairs: Number(row.repairs ?? 0),
    color: row.color || "#256b55",
    updated_at: row.updated_at || null,
  };
}

function buildLegacyAddress(settings) {
  const firstLine = [settings.street, settings.house_number]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const secondLine = [settings.zip_code, settings.city]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return [firstLine, secondLine].filter(Boolean).join(", ") || null;
}

function getCzechErrorMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "").trim();

  if (code === "42501" || message.toLowerCase().includes("row-level security")) {
    return "Nemáte oprávnění tuto změnu provést.";
  }

  if (
    code === "PGRST116" ||
    message.toLowerCase().includes("cannot coerce the result to a single json object")
  ) {
    return "Databáze vrátila nejednoznačný výsledek. Obnovte stránku a zkuste akci znovu.";
  }

  if (message.toLowerCase().includes("duplicate key")) {
    return "Stejný záznam už v databázi existuje.";
  }

  if (message.toLowerCase().includes("jwt") || message.toLowerCase().includes("session")) {
    return "Přihlášení už není platné. Přihlaste se prosím znovu.";
  }

  return message || fallback;
}

export default function HouseSettings({
  selectedHouseId: selectedHouseIdProp,
  permission,
  isAdministrator = false,
}) {
  const selectedHouseId =
    selectedHouseIdProp ||
    window.localStorage.getItem("selected_house_id") ||
    "";

  const canViewPage = hasPermission(permission, "view");
  const canEditHouse =
    hasPermission(permission, "edit") ||
    hasPermission(permission, "manage");
  const canManagePermissions = hasPermission(permission, "manage");
  const isReadOnly = !canEditHouse;
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") return "general";
    return (
      window.localStorage.getItem("house_settings_active_section") ||
      "general"
    );
  });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(() => {
    if (typeof window === "undefined") return "";
    return (
      window.localStorage.getItem("house_settings_permission_user") ||
      ""
    );
  });
  const [permissions, setPermissions] = useState(
    createEmptyPermissionMap()
  );
  const [originalPermissions, setOriginalPermissions] = useState(
    createEmptyPermissionMap()
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const settingsChanged = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(originalSettings),
    [settings, originalSettings]
  );

  const permissionsChanged = useMemo(
    () => JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
    [permissions, originalPermissions]
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  async function loadPage({ silent = false } = {}) {
    if (!canViewPage) {
      setLoading(false);
      setPageError("Nemáte oprávnění zobrazit nastavení tohoto domu.");
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);

    setPageError("");

    try {
      const [houseResult, usersResult] = await Promise.all([
        selectedHouseId
          ? supabase
              .from(HOUSE_TABLE)
              .select("*")
              .eq("id", selectedHouseId)
              .maybeSingle()
          : Promise.resolve({
              data: null,
              error: new Error(
                "Není vybraný žádný dům. Vrať se do Správy domů a dům otevři."
              ),
            }),

        supabase
          .from(USERS_TABLE)
          .select("id, full_name, username, role, active")
          .order("full_name", { ascending: true }),
      ]);

      if (houseResult.error) throw houseResult.error;
      if (usersResult.error) throw usersResult.error;

      const nextSettings = mapHouseRowToSettings(houseResult.data);

      const activeUsers = (usersResult.data || []).filter(
        (user) => user.active !== false
      );

      setSettings(nextSettings);
      setOriginalSettings(nextSettings);
      setUsers(activeUsers);
      setSelectedUserId((current) => {
        if (current && activeUsers.some((user) => user.id === current)) {
          return current;
        }

        const storedUserId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(
                "house_settings_permission_user"
              )
            : "";

        if (
          storedUserId &&
          activeUsers.some((user) => user.id === storedUserId)
        ) {
          return storedUserId;
        }

        return activeUsers[0]?.id || "";
      });
    } catch (error) {
      console.error("Načtení nastavení domu selhalo:", error);
      setPageError(getCzechErrorMessage(error, "Nastavení domu se nepodařilo načíst."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [selectedHouseId]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      "house_settings_active_section",
      activeSection
    );
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (selectedUserId) {
      window.localStorage.setItem(
        "house_settings_permission_user",
        selectedUserId
      );
    } else {
      window.localStorage.removeItem(
        "house_settings_permission_user"
      );
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (!settings.id || !selectedUserId) {
      const empty = createEmptyPermissionMap();
      setPermissions(empty);
      setOriginalPermissions(empty);
      return;
    }

    loadUserPermissions(selectedUserId);
  }, [settings.id, selectedUserId]);

  function updateField(field, value) {
    if (!canEditHouse) return;

    setSettings((current) => ({ ...current, [field]: value }));
    setPageError("");
    setSuccessMessage("");
  }

  async function saveSettings() {
    if (!canEditHouse) {
      setPageError("Nemáte oprávnění upravovat nastavení tohoto domu.");
      return;
    }

    if (savingSettings) return;

    const houseName = settings.house_name.trim();

    if (!houseName) {
      setPageError("Vyplň název domu.");
      setActiveSection("general");
      return;
    }

    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError) {
      setPageError(
        authError.message ||
          "Nepodařilo se ověřit přihlášeného uživatele."
      );
      return;
    }

    const ownerId = settings.owner_id || session?.user?.id;

    if (!ownerId) {
      setPageError("Pro uložení domu musí být uživatel přihlášený.");
      return;
    }

    const cleanText = (value) => {
      const cleaned = String(value ?? "").trim();
      return cleaned || null;
    };

    const payload = {
      owner_id: ownerId,
      name: houseName,

      // Strukturovaná adresa – každá hodnota má vlastní sloupec.
      street: cleanText(settings.street),
      house_number: cleanText(settings.house_number),
      zip_code: cleanText(settings.zip_code),
      city: cleanText(settings.city),
      country: cleanText(settings.country) || "Česká republika",

      // Původní sloupec ponecháváme pouze pro kompatibilitu se staršími částmi aplikace.
      address: buildLegacyAddress(settings),

      description: cleanText(settings.description),
      ico: cleanText(settings.ico),
      dic: cleanText(settings.dic),
      manager_name: cleanText(settings.manager_name),
      contact_name: cleanText(settings.contact_name),
      contact_email: cleanText(settings.contact_email),
      contact_phone: cleanText(settings.contact_phone),

      bank_account: cleanText(settings.bank_account),
      variable_symbol: cleanText(settings.variable_symbol),
      currency: settings.currency === "EUR" ? "EUR" : "CZK",
      rent_due_day: normalizeDay(settings.rent_due_day, 15),
      advances_due_day: normalizeDay(settings.advances_due_day, 15),

      automatic_reminders: Boolean(settings.automatic_reminders),
      email_notifications: Boolean(settings.email_notifications),
      push_notifications: Boolean(settings.push_notifications),
      sms_notifications: Boolean(settings.sms_notifications),

      logo_url: cleanText(settings.logo_url),
      cover_image_url: cleanText(settings.cover_image_url),

      // image_url zůstává synchronizované kvůli starším kartám domů.
      image_url: cleanText(settings.cover_image_url),

      units: Math.max(1, Number(settings.units) || 1),
      tenants: Math.max(0, Number(settings.tenants) || 0),
      balance: Number(settings.balance) || 0,
      repairs: Math.max(0, Number(settings.repairs) || 0),
      color: String(settings.color || "#256b55"),
      updated_at: new Date().toISOString(),
    };

    const scrollPosition =
      typeof window !== "undefined" ? window.scrollY : 0;

    setSavingSettings(true);
    setPageError("");

    try {
      let result;

      if (settings.id) {
        result = await supabase
          .from(HOUSE_TABLE)
          .update(payload)
          .eq("id", settings.id)
          .select("*")
          .single();
      } else {
        result = await supabase
          .from(HOUSE_TABLE)
          .insert(payload)
          .select("*")
          .single();
      }

      if (result.error) throw result.error;

      const nextSettings = mapHouseRowToSettings(result.data);
      setSettings(nextSettings);
      setOriginalSettings(nextSettings);
      setSuccessMessage("Nastavení domu bylo úspěšně uloženo.");

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: scrollPosition,
            left: 0,
            behavior: "auto",
          });
        });
      }
    } catch (error) {
      console.error("Uložení nastavení domu selhalo:", error);
      setPageError(getCzechErrorMessage(error, "Nastavení domu se nepodařilo uložit."));
    } finally {
      setSavingSettings(false);
    }
  }

  async function loadUserPermissions(userId) {
    if (!settings.id || !userId) return;

    setLoadingPermissions(true);
    setPageError("");

    try {
      const { data, error } = await supabase
        .from(PERMISSIONS_TABLE)
        .select(
          "house_id, module_key, can_view, can_create, can_edit, can_delete, can_manage"
        )
        .eq("user_id", userId)
        .or(`house_id.eq.${settings.id},house_id.is.null`);

      if (error) throw error;

      const nextPermissions = createEmptyPermissionMap();

      for (const row of data || []) {
        if (!nextPermissions[row.module_key]) continue;

        const isGlobalModule = GLOBAL_PERMISSION_MODULES.has(
          row.module_key
        );

        if (isGlobalModule && row.house_id !== null) continue;
        if (!isGlobalModule && row.house_id !== settings.id) continue;

        nextPermissions[row.module_key] = {
          can_view: Boolean(row.can_view),
          can_create: Boolean(row.can_create),
          can_edit: Boolean(row.can_edit),
          can_delete: Boolean(row.can_delete),
          can_manage: Boolean(row.can_manage),
        };
      }

      setPermissions(nextPermissions);
      setOriginalPermissions(nextPermissions);
    } catch (error) {
      console.error("Načtení oprávnění selhalo:", error);
      setPageError(
        getCzechErrorMessage(
          error,
          "Oprávnění uživatele se nepodařilo načíst."
        )
      );
    } finally {
      setLoadingPermissions(false);
    }
  }

  function updatePermission(moduleKey, permissionKey, value) {
    if (!canManagePermissions) return;

    setPermissions((current) => {
      const nextModule = {
        ...EMPTY_PERMISSION,
        ...(current[moduleKey] || {}),
        [permissionKey]: value,
      };

      if (permissionKey === "can_view" && !value) {
        Object.assign(nextModule, EMPTY_PERMISSION);
      }

      if (permissionKey !== "can_view" && value) {
        nextModule.can_view = true;
      }

      if (permissionKey === "can_manage" && value) {
        nextModule.can_view = true;
      }

      return {
        ...current,
        [moduleKey]: nextModule,
      };
    });

    setPageError("");
    setSuccessMessage("");
  }

  function setAllPermissions(enabled) {
    if (!canManagePermissions) return;

    const next = createEmptyPermissionMap();

    for (const moduleKey of Object.keys(next)) {
      next[moduleKey] = {
        can_view: enabled,
        can_create: enabled,
        can_edit: enabled,
        can_delete: enabled,
        can_manage: enabled,
      };
    }

    setPermissions(next);
  }

  function setViewOnlyPermissions() {
    if (!canManagePermissions) return;

    const next = createEmptyPermissionMap();

    for (const moduleKey of Object.keys(next)) {
      next[moduleKey] = {
        ...EMPTY_PERMISSION,
        can_view: true,
      };
    }

    setPermissions(next);
  }

  async function savePermissions() {
    if (!canManagePermissions) {
      setPageError("Nemáte oprávnění spravovat přístupy uživatelů.");
      return;
    }

    if (!settings.id) {
      setPageError("Nejdříve ulož základní nastavení domu.");
      return;
    }

    if (!selectedUserId) {
      setPageError("Vyber uživatele.");
      return;
    }

    if (savingPermissions) return;

    const scrollPosition =
      typeof window !== "undefined" ? window.scrollY : 0;

    setSavingPermissions(true);
    setPageError("");

    try {
      const rows = PERMISSION_MODULE_ITEMS.map((item) => ({
        house_id: GLOBAL_PERMISSION_MODULES.has(item.key)
          ? null
          : settings.id,
        user_id: selectedUserId,
        module_key: item.key,
        can_view: Boolean(permissions[item.key]?.can_view),
        can_create: Boolean(permissions[item.key]?.can_create),
        can_edit: Boolean(permissions[item.key]?.can_edit),
        can_delete: Boolean(permissions[item.key]?.can_delete),
        can_manage: Boolean(permissions[item.key]?.can_manage),
        updated_at: new Date().toISOString(),
      }));

      const globalModuleKeys = PERMISSION_MODULE_ITEMS
        .filter((item) => GLOBAL_PERMISSION_MODULES.has(item.key))
        .map((item) => item.key);

      // PostgreSQL nepovažuje NULL za běžnou hodnotu unikátního klíče.
      // Upsert přes house_id proto nebyl pro globální moduly spolehlivý.
      // Stávající oprávnění v obou rozsazích nejdřív přesně odstraníme
      // a potom vložíme jedinou aktuální sadu.
      const { error: houseDeleteError } = await supabase
        .from(PERMISSIONS_TABLE)
        .delete()
        .eq("user_id", selectedUserId)
        .eq("house_id", settings.id);

      if (houseDeleteError) throw houseDeleteError;

      if (globalModuleKeys.length > 0) {
        const { error: globalDeleteError } = await supabase
          .from(PERMISSIONS_TABLE)
          .delete()
          .eq("user_id", selectedUserId)
          .is("house_id", null)
          .in("module_key", globalModuleKeys);

        if (globalDeleteError) throw globalDeleteError;
      }

      const { error: insertError } = await supabase
        .from(PERMISSIONS_TABLE)
        .insert(rows);

      if (insertError) throw insertError;

      const saved = JSON.parse(JSON.stringify(permissions));
      setOriginalPermissions(saved);
      setSuccessMessage(
        `Oprávnění uživatele ${
          selectedUser?.full_name || selectedUser?.username || ""
        } byla uložena pro celou aplikaci.`
      );

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: scrollPosition,
            left: 0,
            behavior: "auto",
          });
        });
      }

      window.dispatchEvent(
        new CustomEvent("application-permissions-changed", {
          detail: {
            userId: selectedUserId,
            houseId: settings.id,
          },
        })
      );
    } catch (error) {
      console.error("Uložení oprávnění selhalo:", error);
      setPageError(
        getCzechErrorMessage(
          error,
          "Oprávnění se nepodařilo uložit."
        )
      );
    } finally {
      setSavingPermissions(false);
    }
  }

  function renderTextField({
    label,
    field,
    type = "text",
    placeholder = "",
    full = false,
  }) {
    return (
      <div className={`house-field ${full ? "full" : ""}`}>
        <label htmlFor={`house-${field}`}>{label}</label>
        <input
          id={`house-${field}`}
          type={type}
          value={settings[field] ?? ""}
          onChange={(event) => updateField(field, event.target.value)}
          placeholder={placeholder}
          disabled={savingSettings || isReadOnly}
        />
      </div>
    );
  }

  function renderSwitch({ field, title, description }) {
    return (
      <div className="house-switch-row">
        <div className="house-switch-copy">
          <strong>{title}</strong>
          <span>{description}</span>
        </div>

        <label className="house-switch">
          <input
            type="checkbox"
            checked={Boolean(settings[field])}
            onChange={(event) => updateField(field, event.target.checked)}
            disabled={savingSettings || isReadOnly}
          />
          <span className="house-switch-slider" />
        </label>
      </div>
    );
  }

  function renderHeading(Icon, eyebrow, title, text) {
    return (
      <div className="house-content-heading">
        <div className="house-content-icon">
          <Icon size={22} />
        </div>

        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </div>
    );
  }

  function renderPermissionsSection() {
    return (
      <>
        {renderHeading(
          KeyRound,
          "Oprávnění aplikace",
          "Přístupy a ovládání modulů",
          "Nastav, co uživatel uvidí a jaké operace může provádět. Správa domů a Uživatelé jsou globální; ostatní oprávnění platí pro právě vybraný dům."
        )}

        {!settings.id ? (
          <div className="house-empty-notice">
            <CircleAlert size={20} />
            <div>
              <strong>Nejdříve ulož dům</strong>
              <span>
                Oprávnění lze přiřadit až po vytvoření záznamu domu.
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="permissions-user-panel">
              <div className="permissions-user-select">
                <label htmlFor="permission-user">Uživatel</label>

                <div className="house-select-wrap">
                  <UserRound size={17} />

                  <select
                    id="permission-user"
                    value={selectedUserId}
                    onChange={(event) =>
                      setSelectedUserId(event.target.value)
                    }
                    disabled={loadingPermissions || savingPermissions || !canManagePermissions}
                  >
                    {users.length === 0 && (
                      <option value="">Žádní aktivní uživatelé</option>
                    )}

                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name || user.username} –{" "}
                        {getRoleLabel(user.role)}
                      </option>
                    ))}
                  </select>

                  <ChevronDown size={16} />
                </div>
              </div>

              {selectedUser && (
                <div className="permissions-selected-user">
                  <div className="permissions-avatar">
                    {getInitials(
                      selectedUser.full_name,
                      selectedUser.username
                    )}
                  </div>

                  <div>
                    <strong>
                      {selectedUser.full_name || "Bez jména"}
                    </strong>
                    <span>
                      @{selectedUser.username || "bez-username"} ·{" "}
                      {getRoleLabel(selectedUser.role)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="permissions-presets">
              <button
                type="button"
                onClick={() => setAllPermissions(true)}
                disabled={loadingPermissions || savingPermissions || !canManagePermissions}
              >
                Povolit vše
              </button>

              <button
                type="button"
                onClick={setViewOnlyPermissions}
                disabled={loadingPermissions || savingPermissions || !canManagePermissions}
              >
                Pouze zobrazení
              </button>

              <button
                type="button"
                className="danger"
                onClick={() => setAllPermissions(false)}
                disabled={loadingPermissions || savingPermissions || !canManagePermissions}
              >
                Odebrat vše
              </button>
            </div>

            {loadingPermissions ? (
              <div className="permissions-loading">
                <LoaderCircle size={25} className="house-spin" />
                <span>Načítám oprávnění uživatele…</span>
              </div>
            ) : (
              <div className="permissions-table-wrap">
                <table className="permissions-table">
                  <thead>
                    <tr>
                      <th>Modul</th>
                      {PERMISSION_COLUMNS.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {PERMISSION_MODULE_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const modulePermission =
                        permissions[item.key] || EMPTY_PERMISSION;
                      const isGlobal =
                        GLOBAL_PERMISSION_MODULES.has(item.key);

                      return (
                        <tr key={item.key}>
                          <td>
                            <div className="permission-module">
                              <span className="permission-module-icon">
                                <Icon size={17} />
                              </span>

                              <div>
                                <strong>{item.title}</strong>
                                <span>
                                  {isGlobal
                                    ? "Globální oprávnění celé aplikace"
                                    : `Oprávnění pro dům ${settings.house_name}`}
                                </span>
                              </div>
                            </div>
                          </td>

                          {PERMISSION_COLUMNS.map((column) => (
                            <td key={column.key}>
                              <label className="permission-checkbox">
                                <input
                                  type="checkbox"
                                  checked={Boolean(
                                    modulePermission[column.key]
                                  )}
                                  onChange={(event) =>
                                    updatePermission(
                                      item.key,
                                      column.key,
                                      event.target.checked
                                    )
                                  }
                                  disabled={
                                    !selectedUserId ||
                                    savingPermissions ||
                                    !canManagePermissions
                                  }
                                />
                                <span>
                                  <Check size={14} />
                                </span>
                              </label>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="permissions-footer">
              <span className={permissionsChanged ? "unsaved" : ""}>
                {permissionsChanged
                  ? "Máš neuložené změny oprávnění."
                  : "Oprávnění jsou uložená."}
              </span>

              <button
                type="button"
                className="house-primary-button"
                onClick={savePermissions}
                disabled={
                  !selectedUserId ||
                  loadingPermissions ||
                  savingPermissions ||
                  !permissionsChanged ||
                  !canManagePermissions
                }
              >
                {savingPermissions ? (
                  <>
                    <LoaderCircle size={17} className="house-spin" />
                    Ukládám oprávnění…
                  </>
                ) : (
                  <>
                    <ShieldCheck size={17} />
                    Uložit oprávnění
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  function renderSectionContent() {
    if (activeSection === "general") {
      return (
        <>
          {renderHeading(
            Building2,
            "Základní informace",
            "Obecné nastavení domu",
            "Údaje, které se používají v celé aplikaci a v dokumentech."
          )}

          <div className="house-form-grid">
            {renderTextField({
              label: "Název domu",
              field: "house_name",
              placeholder: "např. Rezidence U Parku",
              full: true,
            })}
            {renderTextField({
              label: "Ulice",
              field: "street",
              placeholder: "např. Dlouhá",
            })}
            {renderTextField({
              label: "Číslo domu",
              field: "house_number",
              placeholder: "např. 125/14",
            })}
            {renderTextField({
              label: "PSČ",
              field: "zip_code",
              placeholder: "např. 370 01",
            })}
            {renderTextField({
              label: "Město",
              field: "city",
              placeholder: "např. České Budějovice",
            })}
            {renderTextField({
              label: "Země",
              field: "country",
              placeholder: "Česká republika",
              full: true,
            })}

            {renderTextField({
              label: "Počet bytových jednotek",
              field: "units",
              type: "number",
              placeholder: "1",
            })}

            {renderTextField({
              label: "Počet nájemníků",
              field: "tenants",
              type: "number",
              placeholder: "0",
            })}

            <div className="house-field full">
              <label htmlFor="house-description">Popis domu</label>
              <textarea
                id="house-description"
                value={settings.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Krátký popis domu, jeho vybavení nebo důležitých informací…"
                disabled={savingSettings || isReadOnly}
              />
            </div>
          </div>
        </>
      );
    }

    if (activeSection === "finance") {
      return (
        <>
          {renderHeading(
            Landmark,
            "Finanční nastavení",
            "Účet a splatnosti",
            "Bankovní údaje a pravidla pro nájemné a pravidelné zálohy."
          )}

          <div className="house-form-grid">
            {renderTextField({
              label: "Bankovní účet",
              field: "bank_account",
              placeholder: "např. 123456789/0100",
              full: true,
            })}
            {renderTextField({
              label: "Výchozí variabilní symbol",
              field: "variable_symbol",
              placeholder: "např. 2026001",
            })}

            <div className="house-field">
              <label htmlFor="house-currency">Měna</label>
              <select
                id="house-currency"
                value={settings.currency}
                onChange={(event) =>
                  updateField("currency", event.target.value)
                }
                disabled={savingSettings || isReadOnly}
              >
                <option value="CZK">CZK – Česká koruna</option>
                <option value="EUR">EUR – Euro</option>
              </select>
            </div>

            {renderTextField({
              label: "Den splatnosti nájemného",
              field: "rent_due_day",
              type: "number",
              placeholder: "15",
            })}
            {renderTextField({
              label: "Den splatnosti záloh",
              field: "advances_due_day",
              type: "number",
              placeholder: "15",
            })}

            <div className="house-field full">
              {renderSwitch({
                field: "automatic_reminders",
                title: "Automatické upomínky",
                description:
                  "Systém může upozornit na neuhrazené platby po splatnosti.",
              })}
            </div>
          </div>
        </>
      );
    }

    if (activeSection === "legal") {
      return (
        <>
          {renderHeading(
            FileText,
            "Právní a kontaktní údaje",
            "Identifikace správce domu",
            "Údaje používané v dokumentech, oznámeních a kontaktech."
          )}

          <div className="house-form-grid">
            {renderTextField({
              label: "IČO",
              field: "ico",
              placeholder: "např. 12345678",
            })}
            {renderTextField({
              label: "DIČ",
              field: "dic",
              placeholder: "např. CZ12345678",
            })}
            {renderTextField({
              label: "Správce domu",
              field: "manager_name",
              placeholder: "Jméno nebo název správce",
              full: true,
            })}
            {renderTextField({
              label: "Kontaktní osoba",
              field: "contact_name",
              placeholder: "Jméno a příjmení",
              full: true,
            })}
            {renderTextField({
              label: "Kontaktní e-mail",
              field: "contact_email",
              type: "email",
              placeholder: "sprava@dum.cz",
            })}
            {renderTextField({
              label: "Kontaktní telefon",
              field: "contact_phone",
              type: "tel",
              placeholder: "+420 123 456 789",
            })}
          </div>
        </>
      );
    }

    if (activeSection === "notifications") {
      return (
        <>
          {renderHeading(
            Bell,
            "Notifikace",
            "Způsob upozorňování",
            "Nastav výchozí kanály pro systémová oznámení domu."
          )}

          <div className="house-switch-list">
            {renderSwitch({
              field: "email_notifications",
              title: "E-mailové notifikace",
              description:
                "Odesílání důležitých oznámení a připomínek e-mailem.",
            })}
            {renderSwitch({
              field: "push_notifications",
              title: "Push notifikace",
              description:
                "Upozornění přímo v prohlížeči nebo mobilním zařízení.",
            })}
            {renderSwitch({
              field: "sms_notifications",
              title: "SMS notifikace",
              description:
                "Krátké textové zprávy pro urgentní události.",
            })}
          </div>
        </>
      );
    }

    if (activeSection === "permissions") {
      return renderPermissionsSection();
    }

    return (
      <>
        {renderHeading(
          Image,
          "Média",
          "Logo a fotografie domu",
          "Prozatím lze zadat adresu obrázku."
        )}

        <div className="house-form-grid">
          {renderTextField({
            label: "URL loga domu",
            field: "logo_url",
            placeholder: "https://…",
            full: true,
          })}
          {renderTextField({
            label: "URL hlavní fotografie domu",
            field: "cover_image_url",
            placeholder: "https://…",
            full: true,
          })}

          <div className="house-media-preview full">
            <div className="house-media-card">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="Logo domu" />
              ) : (
                <Upload size={25} />
              )}

              <div>
                <strong>Logo domu</strong>
                <span>
                  {settings.logo_url
                    ? "Náhled vloženého loga"
                    : "Logo zatím není nastavené"}
                </span>
              </div>
            </div>

            <div className="house-media-card">
              {settings.cover_image_url ? (
                <img
                  src={settings.cover_image_url}
                  alt="Fotografie domu"
                />
              ) : (
                <Building2 size={25} />
              )}

              <div>
                <strong>Fotografie domu</strong>
                <span>
                  {settings.cover_image_url
                    ? "Náhled hlavní fotografie"
                    : "Fotografie zatím není nastavená"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`house-settings-page ${isReadOnly ? "is-read-only" : ""}`}>
      <style>{`
        .house-settings-page {
          display: grid;
          gap: 22px;
          color: #eaf2fb;
        }

        .house-settings-page * {
          box-sizing: border-box;
        }

        .house-settings-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .house-settings-title span {
          display: block;
          margin-bottom: 7px;
          color: #34d399;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .house-settings-title h1 {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(28px, 3vw, 38px);
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .house-settings-title p {
          margin: 9px 0 0;
          color: #8fa1b6;
          font-size: 14px;
          line-height: 1.6;
        }

        .house-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .house-secondary-button,
        .house-primary-button {
          min-height: 43px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border-radius: 13px;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .house-secondary-button {
          border: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(15, 23, 42, 0.62);
          color: #aebccc;
        }

        .house-primary-button {
          border: 0;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          box-shadow: 0 12px 26px rgba(5, 150, 105, 0.2);
        }

        .house-secondary-button:disabled,
        .house-primary-button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .house-spin {
          animation: house-spin 0.85s linear infinite;
        }

        .house-alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 12px;
          line-height: 1.5;
        }

        .house-alert.error {
          border: 1px solid rgba(248, 113, 113, 0.19);
          background: rgba(127, 29, 29, 0.15);
          color: #fecaca;
        }

        .house-alert.success {
          border: 1px solid rgba(52, 211, 153, 0.17);
          background: rgba(6, 78, 59, 0.18);
          color: #a7f3d0;
        }

        .house-alert.info {
          border: 1px solid rgba(59, 130, 246, 0.22);
          background: rgba(30, 64, 175, 0.12);
          color: #dbeafe;
        }

        .house-settings-page input:disabled,
        .house-settings-page select:disabled,
        .house-settings-page textarea:disabled,
        .house-settings-page button:disabled {
          cursor: not-allowed !important;
        }

        .house-settings-page input:disabled,
        .house-settings-page select:disabled,
        .house-settings-page textarea:disabled {
          opacity: 1;
          color: #dce7f3;
          -webkit-text-fill-color: #dce7f3;
          background: #283448;
          border-color: rgba(148, 163, 184, 0.18);
        }

        .house-settings-page button:disabled {
          opacity: 0.46;
          pointer-events: none;
        }

        .house-settings-page .house-settings-title h1,
        .house-settings-page .house-content-heading h2 {
          color: #ffffff;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.18);
        }

        .house-settings-page .house-settings-title p,
        .house-settings-page .house-content-heading p,
        .house-settings-page .house-navigation-copy span,
        .house-settings-page .house-switch-copy span,
        .house-settings-page .permission-module span,
        .house-settings-page .permissions-selected-user span {
          color: #aebed0;
        }

        .house-settings-page .house-field label,
        .house-settings-page .permissions-user-select label,
        .house-settings-page .house-switch-copy strong,
        .house-settings-page .permission-module strong,
        .house-settings-page .permissions-selected-user strong {
          color: #edf4fb;
        }

        .house-settings-shell {
          min-height: 610px;
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 22px;
          background: rgba(8, 20, 36, 0.72);
        }

        .house-settings-navigation {
          padding: 15px;
          border-right: 1px solid rgba(148, 163, 184, 0.09);
          background: rgba(15, 23, 42, 0.3);
        }

        .house-settings-navigation-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 2px 4px 14px;
          color: #6f8196;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .house-settings-navigation-list {
          display: grid;
          gap: 7px;
        }

        .house-navigation-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px;
          border: 1px solid transparent;
          border-radius: 14px;
          background: transparent;
          color: #8495a9;
          text-align: left;
          cursor: pointer;
        }

        .house-navigation-item:hover {
          background: rgba(15, 23, 42, 0.52);
          color: #dbe5ef;
        }

        .house-navigation-item.active {
          border-color: rgba(52, 211, 153, 0.15);
          background: rgba(16, 185, 129, 0.09);
          color: #a7f3d0;
        }

        .house-navigation-icon {
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.6);
        }

        .house-navigation-copy strong {
          display: block;
          font-size: 12px;
        }

        .house-navigation-copy span {
          display: block;
          margin-top: 2px;
          color: #607187;
          font-size: 10px;
        }

        .house-settings-content {
          min-width: 0;
          padding: 24px;
        }

        .house-content-heading {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 23px;
          padding-bottom: 19px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.09);
        }

        .house-content-icon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(52, 211, 153, 0.15);
          border-radius: 15px;
          background: rgba(16, 185, 129, 0.09);
          color: #6ee7b7;
        }

        .house-content-heading span {
          display: block;
          margin-bottom: 4px;
          color: #34d399;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .house-content-heading h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 23px;
        }

        .house-content-heading p {
          margin: 7px 0 0;
          color: #788a9f;
          font-size: 12px;
          line-height: 1.55;
        }

        .house-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .house-field {
          display: grid;
          gap: 7px;
        }

        .house-field.full,
        .house-media-preview.full {
          grid-column: 1 / -1;
        }

        .house-field label,
        .permissions-user-select label {
          color: #c8d2de;
          font-size: 12px;
          font-weight: 700;
        }

        .house-field input,
        .house-field select,
        .house-field textarea,
        .house-select-wrap {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.14);
          outline: 0;
          border-radius: 13px;
          background: rgba(15, 23, 42, 0.68);
          color: #eef4fb;
          font: inherit;
          font-size: 13px;
        }

        .house-field input,
        .house-field select {
          min-height: 45px;
          padding: 0 13px;
        }

        .house-field textarea {
          min-height: 130px;
          padding: 12px 13px;
          resize: vertical;
        }

        .house-switch-list {
          display: grid;
          gap: 12px;
        }

        .house-switch-row {
          min-height: 67px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 15px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 15px;
          background: rgba(15, 23, 42, 0.42);
        }

        .house-switch-copy strong {
          display: block;
          color: #dbe5ef;
          font-size: 13px;
        }

        .house-switch-copy span {
          display: block;
          margin-top: 3px;
          color: #6f8196;
          font-size: 11px;
        }

        .house-switch {
          position: relative;
          width: 45px;
          height: 25px;
          flex: 0 0 auto;
        }

        .house-switch input {
          position: absolute;
          opacity: 0;
        }

        .house-switch-slider {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: #334155;
          cursor: pointer;
        }

        .house-switch-slider::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 19px;
          height: 19px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.2s ease;
        }

        .house-switch input:checked + .house-switch-slider {
          background: #10b981;
        }

        .house-switch input:checked + .house-switch-slider::after {
          transform: translateX(20px);
        }

        .permissions-user-panel {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(230px, auto);
          gap: 14px;
          margin-bottom: 14px;
        }

        .permissions-user-select {
          display: grid;
          gap: 7px;
        }

        .house-select-wrap {
          min-height: 45px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          border-color: rgba(148, 163, 184, 0.2);
          background: #0b1220;
          color: #94a3b8;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }

        .house-select-wrap select {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          appearance: none;
          background: #0b1220;
          color: #f8fafc;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          color-scheme: dark;
          cursor: pointer;
        }

        .house-select-wrap select option {
          background: #070d17;
          color: #f8fafc;
          font-size: 13px;
          padding: 10px 12px;
        }

        .house-select-wrap select option:checked,
        .house-select-wrap select option:hover {
          background: #0f766e;
          color: #ffffff;
        }

        .house-select-wrap:focus-within {
          border-color: rgba(52, 211, 153, 0.42);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.08);
          background: #0b1220;
        }

        .permissions-selected-user {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 13px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.42);
        }

        .permissions-avatar {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 13px;
          background: rgba(16, 185, 129, 0.1);
          color: #a7f3d0;
          font-size: 12px;
          font-weight: 900;
        }

        .permissions-selected-user strong {
          display: block;
          color: #e2e8f0;
          font-size: 12px;
        }

        .permissions-selected-user span {
          display: block;
          margin-top: 3px;
          color: #6f8196;
          font-size: 10px;
        }

        .permissions-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
        }

        .permissions-presets button {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 11px;
          background: rgba(15, 23, 42, 0.58);
          color: #aebccc;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .permissions-presets button.danger {
          color: #fca5a5;
        }

        .permissions-table-wrap {
          width: 100%;
          overflow-x: auto;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 16px;
        }

        .permissions-table {
          width: 100%;
          min-width: 720px;
          border-collapse: collapse;
        }

        .permissions-table th {
          padding: 12px 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.09);
          color: #718399;
          font-size: 9px;
          font-weight: 800;
          text-align: center;
          text-transform: uppercase;
        }

        .permissions-table th:first-child {
          text-align: left;
        }

        .permissions-table td {
          padding: 11px 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.07);
          text-align: center;
        }

        .permission-module {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 200px;
          text-align: left;
        }

        .permission-module-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 11px;
          background: rgba(16, 185, 129, 0.08);
          color: #6ee7b7;
        }

        .permission-module strong {
          display: block;
          color: #dbe5ef;
          font-size: 12px;
        }

        .permission-module span {
          display: block;
          margin-top: 2px;
          color: #607187;
          font-size: 9px;
        }

        .permission-checkbox {
          display: inline-grid;
          place-items: center;
          cursor: pointer;
        }

        .permission-checkbox input {
          position: absolute;
          opacity: 0;
        }

        .permission-checkbox span {
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.62);
          color: transparent;
        }

        .permission-checkbox input:checked + span {
          border-color: rgba(52, 211, 153, 0.35);
          background: #059669;
          color: #fff;
        }

        .permissions-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(148, 163, 184, 0.09);
          color: #6f8196;
          font-size: 11px;
        }

        .permissions-footer .unsaved {
          color: #fbbf24;
        }

        .permissions-loading {
          min-height: 250px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #718399;
          font-size: 12px;
        }

        .house-empty-notice {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border: 1px solid rgba(251, 191, 36, 0.16);
          border-radius: 15px;
          background: rgba(120, 53, 15, 0.12);
          color: #fde68a;
        }

        .house-empty-notice strong {
          display: block;
          font-size: 13px;
        }

        .house-empty-notice span {
          display: block;
          margin-top: 4px;
          color: #d6b86f;
          font-size: 11px;
        }

        .house-media-preview {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .house-media-card {
          min-height: 125px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.42);
          color: #6ee7b7;
        }

        .house-media-card img {
          width: 70px;
          height: 70px;
          border-radius: 15px;
          object-fit: cover;
        }

        .house-media-card strong {
          display: block;
          color: #dbe5ef;
          font-size: 13px;
        }

        .house-media-card span {
          display: block;
          margin-top: 4px;
          color: #6f8196;
          font-size: 11px;
        }

        .house-loading {
          min-height: 610px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 22px;
          background: rgba(8, 20, 36, 0.72);
        }

        .house-loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        @keyframes house-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .house-settings-shell {
            grid-template-columns: 1fr;
          }

          .house-settings-navigation {
            overflow-x: auto;
            border-right: 0;
            border-bottom: 1px solid rgba(148, 163, 184, 0.09);
          }

          .house-settings-navigation-title {
            display: none;
          }

          .house-settings-navigation-list {
            display: flex;
            width: max-content;
          }

          .house-navigation-item {
            width: 190px;
          }

          .permissions-user-panel {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .house-settings-header {
            align-items: stretch;
            flex-direction: column;
          }

          .house-header-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .house-form-grid,
          .house-media-preview {
            grid-template-columns: 1fr;
          }

          .house-field.full,
          .house-media-preview.full {
            grid-column: auto;
          }

          .house-settings-content {
            padding: 18px;
          }

          .permissions-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .permissions-footer .house-primary-button {
            width: 100%;
          }
        }
      `}</style>

      <header className="house-settings-header">
        <div className="house-settings-title">
          <span>Správa nemovitosti</span>
          <h1>Nastavení domu</h1>
          <p>
            Základní informace, finance, kontakty, notifikace a oprávnění.
          </p>
        </div>

        <div className="house-header-actions">
          <button
            type="button"
            className="house-secondary-button"
            onClick={() => loadPage({ silent: true })}
            disabled={
              loading ||
              refreshing ||
              savingSettings ||
              savingPermissions
            }
          >
            <RefreshCw
              size={17}
              className={refreshing ? "house-spin" : ""}
            />
            {refreshing ? "Obnovuji…" : "Obnovit"}
          </button>

          <button
            type="button"
            className="house-primary-button"
            onClick={saveSettings}
            disabled={loading || savingSettings || !canEditHouse}
          >
            {savingSettings ? (
              <>
                <LoaderCircle size={17} className="house-spin" />
                Ukládám…
              </>
            ) : (
              <>
                <Save size={17} />
                {canEditHouse
                  ? settings.id
                    ? "Uložit dům"
                    : "Vytvořit dům"
                  : "Pouze pro čtení"}
              </>
            )}
          </button>
        </div>
      </header>

      {pageError && (
        <div className="house-alert error" role="alert">
          <CircleAlert size={17} />
          <span>{pageError}</span>
        </div>
      )}

      {successMessage && (
        <div className="house-alert success" role="status">
          <Check size={17} />
          <span>{successMessage}</span>
        </div>
      )}

      {canViewPage && isReadOnly && (
        <div className="house-alert info" role="status">
          <CircleAlert size={17} />
          <span>
            Nastavení je zobrazeno pouze pro čtení. Nemáte oprávnění
            údaje upravovat.
          </span>
        </div>
      )}

      {canViewPage &&
        activeSection === "permissions" &&
        !canManagePermissions && (
          <div className="house-alert info" role="status">
            <CircleAlert size={17} />
            <span>
              Oprávnění uživatelů můžete pouze zobrazit. Změny může
              provádět jen správce s oprávněním „Spravovat“.
            </span>
          </div>
        )}

      {loading ? (
        <div className="house-loading">
          <div className="house-loading-content">
            <LoaderCircle size={28} className="house-spin" />
            <strong>Načítám nastavení domu</strong>
          </div>
        </div>
      ) : (
        <section className="house-settings-shell">
          <aside className="house-settings-navigation">
            <div className="house-settings-navigation-title">
              <Settings size={15} />
              Sekce nastavení
            </div>

            <div className="house-settings-navigation-list">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.key === activeSection;

                return (
                  <button
                    key={section.key}
                    type="button"
                    className={`house-navigation-item ${
                      isActive ? "active" : ""
                    }`}
                    onClick={() => setActiveSection(section.key)}
                  >
                    <span className="house-navigation-icon">
                      <Icon size={18} />
                    </span>

                    <span className="house-navigation-copy">
                      <strong>{section.title}</strong>
                      <span>{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="house-settings-content">
            {renderSectionContent()}
          </div>
        </section>
      )}
    </div>
  );
}
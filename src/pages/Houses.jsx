import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  DoorOpen,
  Edit3,
  Eye,
  EyeOff,
  Home,
  KeyRound,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  isDeveloperPreviewMode,
  supabase,
} from "../lib/supabase";

const HOUSES_TABLE = "houses";
const PROFILES_TABLE = "profiles";
const HOUSE_ACCESS_TABLE = "house_user_access";
const SELECTED_HOUSE_STORAGE_KEY = "selected_house_id";

const ADMIN_ROLES = [
  "owner",
  "admin",
  "manager",
  "majitel",
  "správce",
  "administrator",
  "administrátor",
];

const EMPTY_HOUSE = {
  id: null,
  owner_id: null,
  name: "",
  street: "",
  house_number: "",
  zip_code: "",
  city: "",
  country: "Česká republika",
  units: "",
  tenants: "",
  manager_name: "",
  description: "",
  image_url: "",
  active: true,
  created_at: null,
  updated_at: null,
};

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function hasAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

function getFullAddress(house) {
  const streetPart = [house.street, house.house_number]
    .filter(Boolean)
    .join(" ");

  const cityPart = [house.zip_code, house.city]
    .filter(Boolean)
    .join(" ");

  return [streetPart, cityPart, house.country]
    .filter(Boolean)
    .join(", ");
}

function getHouseInitials(name) {
  const value = String(name || "Dům").trim();
  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "D";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getUserLabel(user) {
  return user.full_name || user.username || "Neznámý uživatel";
}

export default function Houses({
  onHouseSelected,
  onOpenHouse,
  onOpenHouseSettings,
}) {
  const [houses, setHouses] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);

  const [selectedHouseId, setSelectedHouseId] = useState(
    () => localStorage.getItem(SELECTED_HOUSE_STORAGE_KEY) || ""
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingHouseId, setDeletingHouseId] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHouse, setEditingHouse] = useState(EMPTY_HOUSE);
  const [deleteConfirmHouse, setDeleteConfirmHouse] = useState(null);

  const [accessModalHouse, setAccessModalHouse] = useState(null);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessMap, setAccessMap] = useState({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessSearch, setAccessSearch] = useState("");

  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isSandbox = isDeveloperPreviewMode();

  const isAdministrator = useMemo(
    () => isSandbox || hasAdminRole(currentProfile?.role),
    [currentProfile, isSandbox]
  );

  const filteredHouses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return houses.filter((house) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && house.active !== false) ||
        (statusFilter === "inactive" && house.active === false);

      if (!matchesStatus) return false;
      if (!query) return true;

      const haystack = [
        house.name,
        house.street,
        house.house_number,
        house.zip_code,
        house.city,
        house.country,
        house.manager_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [houses, search, statusFilter]);

  const filteredAccessUsers = useMemo(() => {
    const query = accessSearch.trim().toLowerCase();

    if (!query) return accessUsers;

    return accessUsers.filter((user) => {
      const haystack = [
        user.full_name,
        user.username,
        user.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [accessUsers, accessSearch]);

  const statistics = useMemo(() => {
    return {
      total: houses.length,
      active: houses.filter((house) => house.active !== false).length,
      units: houses.reduce(
        (sum, house) => sum + normalizeNumber(house.units),
        0
      ),
      tenants: houses.reduce(
        (sum, house) => sum + normalizeNumber(house.tenants),
        0
      ),
    };
  }, [houses]);

  useEffect(() => {
    loadHouses();

    function handleSandboxDataChanged() {
      if (isDeveloperPreviewMode()) {
        loadHouses({ silent: true });
      }
    }

    window.addEventListener(
      "developer-sandbox-data-changed",
      handleSandboxDataChanged
    );

    return () => {
      window.removeEventListener(
        "developer-sandbox-data-changed",
        handleSandboxDataChanged
      );
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;

    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  async function getAuthenticatedContext() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Uživatel není přihlášen.");

    const { data: profile, error: profileError } = await supabase
      .from(PROFILES_TABLE)
      .select("id, full_name, username, role, active")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    return { user, profile };
  }

  async function loadHouses({ silent = false } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setPageError("");

    try {
      const { user, profile } = await getAuthenticatedContext();

      setCurrentUser(user);
      setCurrentProfile(profile);

      let nextHouses = [];

      if (isDeveloperPreviewMode() || hasAdminRole(profile.role)) {
        const { data, error } = await supabase
          .from(HOUSES_TABLE)
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        nextHouses = data || [];
      } else {
        const { data, error } = await supabase
          .from(HOUSE_ACCESS_TABLE)
          .select(`
            house_id,
            can_view,
            can_manage,
            house:${HOUSES_TABLE} (*)
          `)
          .eq("user_id", user.id)
          .eq("can_view", true);

        if (error) throw error;

        nextHouses = (data || [])
          .map((row) => {
            if (!row.house) return null;

            return {
              ...row.house,
              access_can_manage: Boolean(row.can_manage),
            };
          })
          .filter(Boolean)
          .sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), "cs")
          );
      }

      setHouses(nextHouses);

      const storedHouseId =
        localStorage.getItem(SELECTED_HOUSE_STORAGE_KEY) || "";

      if (
        storedHouseId &&
        !nextHouses.some((house) => String(house.id) === String(storedHouseId))
      ) {
        localStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
        setSelectedHouseId("");

        window.dispatchEvent(
          new CustomEvent("selected-house-changed", {
            detail: {
              houseId: null,
              house: null,
            },
          })
        );
      }
    } catch (error) {
      console.error("Načtení domů selhalo:", error);
      setPageError(error?.message || "Domy se nepodařilo načíst.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function openCreateModal() {
    if (!isAdministrator) {
      setPageError("Nemáte oprávnění vytvářet nové domy.");
      return;
    }

    setEditingHouse({ ...EMPTY_HOUSE });
    setPageError("");
    setModalOpen(true);
  }

  function openEditModal(house) {
    if (!isAdministrator && !house.access_can_manage) {
      setPageError("Nemáte oprávnění upravovat tento dům.");
      return;
    }

    setEditingHouse({
      ...EMPTY_HOUSE,
      ...house,
      units: house.units ?? "",
      tenants: house.tenants ?? "",
    });

    setPageError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingHouse({ ...EMPTY_HOUSE });
  }

  function updateEditingHouse(field, value) {
    setEditingHouse((current) => ({
      ...current,
      [field]: value,
    }));

    setPageError("");
  }

  async function saveHouse(event) {
    event?.preventDefault();

    if (saving) return;

    if (!isAdministrator && !editingHouse.access_can_manage) {
      setPageError("Nemáte oprávnění uložit změny tohoto domu.");
      return;
    }

    const name = editingHouse.name.trim();

    if (!name) {
      setPageError("Vyplňte název domu.");
      return;
    }

    setSaving(true);
    setPageError("");

    try {
      const user = currentUser || (await getAuthenticatedContext()).user;

      const payload = {
        name,
        street: editingHouse.street.trim(),
        house_number: editingHouse.house_number.trim(),
        zip_code: editingHouse.zip_code.trim(),
        city: editingHouse.city.trim(),
        country: editingHouse.country.trim() || "Česká republika",
        units: normalizeNumber(editingHouse.units),
        tenants: normalizeNumber(editingHouse.tenants),
        manager_name: editingHouse.manager_name.trim(),
        description: String(editingHouse.description ?? "").trim(),
        image_url: editingHouse.image_url.trim(),
        active: Boolean(editingHouse.active),
        updated_at: new Date().toISOString(),
      };

      let result;

      if (editingHouse.id) {
        result = await supabase
          .from(HOUSES_TABLE)
          .update(payload)
          .eq("id", editingHouse.id)
          .select("*")
          .single();
      } else {
        result = await supabase
          .from(HOUSES_TABLE)
          .insert({
            ...payload,
            owner_id: user.id,
          })
          .select("*")
          .single();
      }

      if (result.error) throw result.error;

      setHouses((current) => {
        if (editingHouse.id) {
          return current.map((house) =>
            String(house.id) === String(result.data.id) ? result.data : house
          );
        }

        return [result.data, ...current];
      });

      setSuccessMessage(
        editingHouse.id
          ? "Dům byl úspěšně upraven."
          : "Nový dům byl úspěšně vytvořen."
      );

      setModalOpen(false);
      setEditingHouse({ ...EMPTY_HOUSE });

      if (!editingHouse.id) {
        selectHouse(result.data, false);
      }
    } catch (error) {
      console.error("Uložení domu selhalo:", error);
      setPageError(error?.message || "Dům se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  }

  function selectHouse(house, openAfterSelection = true) {
    localStorage.setItem(SELECTED_HOUSE_STORAGE_KEY, house.id);
    setSelectedHouseId(house.id);
    setSuccessMessage(`Dům „${house.name}“ byl nastaven jako aktuální.`);

    window.dispatchEvent(
      new CustomEvent("selected-house-changed", {
        detail: {
          houseId: house.id,
          house,
        },
      })
    );

    if (typeof onHouseSelected === "function") {
      onHouseSelected(house);
    }

    if (openAfterSelection && typeof onOpenHouse === "function") {
      onOpenHouse(house);
    }
  }

  function handleOpenHouse(house) {
    selectHouse(house, false);

    if (typeof onOpenHouse === "function") {
      onOpenHouse(house);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("app-navigation-request", {
        detail: {
          pageKey: "dashboard",
          houseId: house.id,
        },
      })
    );
  }

  function handleOpenSettings(house) {
    if (!isAdministrator && !house.access_can_manage) {
      setPageError("Nemáte oprávnění spravovat nastavení tohoto domu.");
      return;
    }

    selectHouse(house, false);

    if (typeof onOpenHouseSettings === "function") {
      onOpenHouseSettings(house);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("app-navigation-request", {
        detail: {
          pageKey: "house-settings",
          houseId: house.id,
        },
      })
    );
  }

  async function deleteHouse() {
    if (!deleteConfirmHouse || deletingHouseId) return;

    if (!isAdministrator) {
      setPageError("Nemáte oprávnění odstranit dům.");
      return;
    }

    setDeletingHouseId(deleteConfirmHouse.id);
    setPageError("");

    try {
      const { error } = await supabase
        .from(HOUSES_TABLE)
        .delete()
        .eq("id", deleteConfirmHouse.id);

      if (error) throw error;

      setHouses((current) =>
        current.filter((house) => String(house.id) !== String(deleteConfirmHouse.id))
      );

      if (String(selectedHouseId) === String(deleteConfirmHouse.id)) {
        localStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
        setSelectedHouseId("");

        window.dispatchEvent(
          new CustomEvent("selected-house-changed", {
            detail: {
              houseId: null,
              house: null,
            },
          })
        );
      }

      setSuccessMessage("Dům byl odstraněn.");
      setDeleteConfirmHouse(null);
    } catch (error) {
      console.error("Smazání domu selhalo:", error);
      setPageError(error?.message || "Dům se nepodařilo odstranit.");
    } finally {
      setDeletingHouseId("");
    }
  }

  async function toggleHouseActive(house) {
    if (!isAdministrator && !house.access_can_manage) {
      setPageError("Nemáte oprávnění měnit stav tohoto domu.");
      return;
    }

    setPageError("");

    try {
      const { data, error } = await supabase
        .from(HOUSES_TABLE)
        .update({
          active: house.active === false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", house.id)
        .select("*")
        .single();

      if (error) throw error;

      setHouses((current) =>
        current.map((item) => (String(item.id) === String(data.id) ? data : item))
      );

      setSuccessMessage(
        data.active
          ? "Dům byl znovu aktivován."
          : "Dům byl deaktivován."
      );
    } catch (error) {
      console.error("Změna stavu domu selhala:", error);
      setPageError(error?.message || "Stav domu se nepodařilo změnit.");
    }
  }

  async function openAccessModal(house) {
    if (!isAdministrator) {
      setPageError("Nemáte oprávnění spravovat přístup uživatelů.");
      return;
    }

    setAccessModalHouse(house);
    setAccessSearch("");
    setLoadingAccess(true);
    setPageError("");

    try {
      const [usersResult, accessResult] = await Promise.all([
        supabase
          .from(PROFILES_TABLE)
          .select("id, full_name, username, role, active")
          .neq("id", currentUser?.id || "")
          .order("full_name", { ascending: true }),

        supabase
          .from(HOUSE_ACCESS_TABLE)
          .select("user_id, can_view, can_manage")
          .eq("house_id", house.id),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (accessResult.error) throw accessResult.error;

      const users = (usersResult.data || []).filter(
        (user) => user.active !== false
      );

      const nextAccessMap = {};

      for (const user of users) {
        nextAccessMap[user.id] = {
          can_view: false,
          can_manage: false,
        };
      }

      for (const row of accessResult.data || []) {
        nextAccessMap[row.user_id] = {
          can_view: Boolean(row.can_view),
          can_manage: Boolean(row.can_manage),
        };
      }

      setAccessUsers(users);
      setAccessMap(nextAccessMap);
    } catch (error) {
      console.error("Načtení přístupů selhalo:", error);
      setPageError(
        error?.message || "Přístupy uživatelů se nepodařilo načíst."
      );
      setAccessModalHouse(null);
    } finally {
      setLoadingAccess(false);
    }
  }

  function updateAccess(userId, field, value) {
    setAccessMap((current) => {
      const next = {
        ...current,
        [userId]: {
          can_view: Boolean(current[userId]?.can_view),
          can_manage: Boolean(current[userId]?.can_manage),
          [field]: value,
        },
      };

      if (field === "can_view" && !value) {
        next[userId].can_manage = false;
      }

      if (field === "can_manage" && value) {
        next[userId].can_view = true;
      }

      return next;
    });
  }

  async function saveHouseAccess() {
    if (!accessModalHouse || savingAccess) return;

    setSavingAccess(true);
    setPageError("");

    try {
      const rows = accessUsers.map((user) => ({
        house_id: accessModalHouse.id,
        user_id: user.id,
        can_view: Boolean(accessMap[user.id]?.can_view),
        can_manage: Boolean(accessMap[user.id]?.can_manage),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from(HOUSE_ACCESS_TABLE)
        .upsert(rows, {
          onConflict: "house_id,user_id",
        });

      if (error) throw error;

      setSuccessMessage(
        `Přístupy k domu „${accessModalHouse.name}“ byly uloženy.`
      );
      setAccessModalHouse(null);
      setAccessUsers([]);
      setAccessMap({});
    } catch (error) {
      console.error("Uložení přístupů selhalo:", error);
      setPageError(
        error?.message || "Přístupy uživatelů se nepodařilo uložit."
      );
    } finally {
      setSavingAccess(false);
    }
  }

  return (
    <div className="houses-page">
      <style>{`
        .houses-page {
          display: grid;
          gap: 22px;
          color: #eaf2fb;
        }

        .houses-page * {
          box-sizing: border-box;
        }

        .houses-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .houses-title span {
          display: block;
          margin-bottom: 7px;
          color: #34d399;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .houses-title h1 {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(29px, 3vw, 40px);
          line-height: 1.05;
          letter-spacing: -0.045em;
        }

        .houses-title p {
          max-width: 650px;
          margin: 10px 0 0;
          color: #8596aa;
          font-size: 14px;
          line-height: 1.6;
        }

        .houses-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .houses-button {
          min-height: 43px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border-radius: 13px;
          font: inherit;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .houses-button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .houses-button.secondary {
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(15, 23, 42, 0.63);
          color: #b6c3d1;
        }

        .houses-button.primary {
          border: 0;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          box-shadow: 0 12px 28px rgba(5, 150, 105, 0.23);
        }

        .houses-button.danger {
          border: 1px solid rgba(248, 113, 113, 0.18);
          background: rgba(127, 29, 29, 0.15);
          color: #fca5a5;
        }

        .houses-button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
        }

        .houses-alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 15px;
          border-radius: 14px;
          font-size: 12px;
          line-height: 1.5;
        }

        .houses-alert.error {
          border: 1px solid rgba(248, 113, 113, 0.18);
          background: rgba(127, 29, 29, 0.15);
          color: #fecaca;
        }

        .houses-alert.success {
          border: 1px solid rgba(52, 211, 153, 0.18);
          background: rgba(6, 78, 59, 0.18);
          color: #a7f3d0;
        }

        .houses-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 13px;
        }

        .houses-stat {
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 92px;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 17px;
          background: rgba(8, 20, 36, 0.72);
        }

        .houses-stat-icon {
          width: 45px;
          height: 45px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(52, 211, 153, 0.14);
          border-radius: 14px;
          background: rgba(16, 185, 129, 0.08);
          color: #6ee7b7;
        }

        .houses-stat strong {
          display: block;
          color: #f8fafc;
          font-size: 23px;
          line-height: 1;
        }

        .houses-stat span {
          display: block;
          margin-top: 5px;
          color: #73859a;
          font-size: 11px;
        }

        .houses-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 13px;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 17px;
          background: rgba(8, 20, 36, 0.72);
        }

        .houses-search {
          min-width: 280px;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 43px;
          padding: 0 13px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 13px;
          background: rgba(15, 23, 42, 0.64);
          color: #64748b;
        }

        .houses-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #eef4fb;
          font: inherit;
          font-size: 13px;
        }

        .houses-filter {
          min-height: 43px;
          padding: 0 13px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          outline: 0;
          border-radius: 13px;
          background: rgba(15, 23, 42, 0.64);
          color: #dbe5ef;
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }

        .houses-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .house-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 20px;
          background: rgba(8, 20, 36, 0.76);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.11);
          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .house-card:hover {
          transform: translateY(-2px);
          border-color: rgba(52, 211, 153, 0.22);
          box-shadow: 0 22px 50px rgba(0, 0, 0, 0.15);
        }

        .house-card.selected {
          border-color: rgba(52, 211, 153, 0.42);
          box-shadow:
            0 20px 48px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(52, 211, 153, 0.12);
        }

        .house-card-image {
          position: relative;
          height: 150px;
          overflow: hidden;
          background:
            radial-gradient(circle at 30% 20%, rgba(52, 211, 153, 0.16), transparent 35%),
            linear-gradient(145deg, #102a27, #0b1625);
        }

        .house-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .house-card-placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
        }

        .house-card-placeholder span {
          width: 67px;
          height: 67px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(110, 231, 183, 0.18);
          border-radius: 21px;
          background: rgba(16, 185, 129, 0.1);
          color: #a7f3d0;
          font-size: 21px;
          font-weight: 900;
        }

        .house-card-badges {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .house-badge {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0 9px;
          border-radius: 999px;
          backdrop-filter: blur(10px);
          background: rgba(15, 23, 42, 0.72);
          color: #dbe5ef;
          font-size: 9px;
          font-weight: 850;
          text-transform: uppercase;
        }

        .house-badge.selected {
          background: rgba(5, 150, 105, 0.88);
          color: #fff;
        }

        .house-badge.inactive {
          background: rgba(127, 29, 29, 0.78);
          color: #fecaca;
        }

        .house-card-content {
          padding: 17px;
        }

        .house-card-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .house-card-heading h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 18px;
          letter-spacing: -0.025em;
        }

        .house-card-heading p {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin: 7px 0 0;
          color: #7f90a4;
          font-size: 11px;
          line-height: 1.45;
        }

        .house-card-status {
          width: 9px;
          height: 9px;
          flex: 0 0 auto;
          margin-top: 5px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.08);
        }

        .house-card-status.inactive {
          background: #f87171;
          box-shadow: 0 0 0 5px rgba(248, 113, 113, 0.08);
        }

        .house-card-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 15px;
        }

        .house-card-meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border: 1px solid rgba(148, 163, 184, 0.09);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.43);
          color: #74869a;
        }

        .house-card-meta-item svg {
          color: #6ee7b7;
        }

        .house-card-meta-item strong {
          display: block;
          color: #dbe5ef;
          font-size: 12px;
        }

        .house-card-meta-item span {
          display: block;
          margin-top: 2px;
          font-size: 9px;
        }

        .house-card-manager {
          margin-top: 11px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.36);
          color: #718399;
          font-size: 10px;
        }

        .house-card-manager strong {
          color: #cbd5e1;
        }

        .house-card-actions {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 8px;
          margin-top: 15px;
        }

        .house-card-action {
          min-height: 39px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 11px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.58);
          color: #aebccc;
          font: inherit;
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
        }

        .house-card-action.primary {
          border-color: rgba(52, 211, 153, 0.18);
          background: rgba(16, 185, 129, 0.1);
          color: #a7f3d0;
        }

        .house-card-action.icon-only {
          width: 39px;
          padding: 0;
        }

        .house-card-footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 9px;
        }

        .house-link-action {
          border: 0;
          background: transparent;
          color: #708399;
          font: inherit;
          font-size: 9px;
          font-weight: 750;
          cursor: pointer;
        }

        .house-link-action:hover {
          color: #dbe5ef;
        }

        .house-link-action.danger:hover {
          color: #fca5a5;
        }

        .houses-empty {
          min-height: 360px;
          display: grid;
          place-items: center;
          padding: 35px;
          border: 1px dashed rgba(148, 163, 184, 0.18);
          border-radius: 20px;
          background: rgba(8, 20, 36, 0.58);
          text-align: center;
        }

        .houses-empty-icon {
          width: 70px;
          height: 70px;
          display: grid;
          place-items: center;
          margin: 0 auto 15px;
          border: 1px solid rgba(52, 211, 153, 0.15);
          border-radius: 22px;
          background: rgba(16, 185, 129, 0.08);
          color: #6ee7b7;
        }

        .houses-empty h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 20px;
        }

        .houses-empty p {
          max-width: 440px;
          margin: 8px auto 17px;
          color: #788a9f;
          font-size: 12px;
          line-height: 1.6;
        }

        .houses-loading {
          min-height: 430px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.11);
          border-radius: 20px;
          background: rgba(8, 20, 36, 0.72);
        }

        .houses-loading-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #8394a8;
          font-size: 12px;
        }

        .houses-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(2, 6, 23, 0.76);
          backdrop-filter: blur(7px);
        }

        .houses-modal {
          width: min(760px, 100%);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 22px;
          background: #0b1728;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
        }

        .houses-modal.access {
          width: min(900px, 100%);
        }

        .houses-modal-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          background: rgba(11, 23, 40, 0.96);
          backdrop-filter: blur(12px);
        }

        .houses-modal-header span {
          display: block;
          margin-bottom: 5px;
          color: #34d399;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .houses-modal-header h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 22px;
        }

        .houses-modal-close {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.65);
          color: #94a3b8;
          cursor: pointer;
        }

        .houses-form {
          padding: 20px;
        }

        .houses-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .houses-field {
          display: grid;
          gap: 7px;
        }

        .houses-field.full {
          grid-column: 1 / -1;
        }

        .houses-field label {
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 800;
        }

        .houses-field input,
        .houses-field textarea,
        .houses-field select {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.14);
          outline: 0;
          border-radius: 13px;
          background: rgba(15, 23, 42, 0.68);
          color: #eef4fb;
          font: inherit;
          font-size: 12px;
        }

        .houses-field input,
        .houses-field select {
          min-height: 44px;
          padding: 0 13px;
        }

        .houses-field textarea {
          min-height: 115px;
          padding: 12px 13px;
          resize: vertical;
        }

        .houses-switch-row {
          min-height: 62px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 12px 14px;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.42);
        }

        .houses-switch-row strong {
          display: block;
          color: #dbe5ef;
          font-size: 12px;
        }

        .houses-switch-row span {
          display: block;
          margin-top: 3px;
          color: #718399;
          font-size: 10px;
        }

        .houses-switch {
          position: relative;
          width: 45px;
          height: 25px;
          flex: 0 0 auto;
        }

        .houses-switch input {
          position: absolute;
          opacity: 0;
        }

        .houses-switch-slider {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: #334155;
          cursor: pointer;
        }

        .houses-switch-slider::after {
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

        .houses-switch input:checked + .houses-switch-slider {
          background: #10b981;
        }

        .houses-switch input:checked + .houses-switch-slider::after {
          transform: translateX(20px);
        }

        .houses-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          padding-top: 17px;
          border-top: 1px solid rgba(148, 163, 184, 0.09);
        }

        .houses-access-content {
          padding: 20px;
        }

        .houses-access-search {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 43px;
          margin-bottom: 14px;
          padding: 0 13px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 13px;
          background: rgba(15, 23, 42, 0.64);
          color: #64748b;
        }

        .houses-access-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #eef4fb;
          font: inherit;
          font-size: 12px;
        }

        .houses-access-list {
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 15px;
        }

        .houses-access-row {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 130px 130px;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.08);
        }

        .houses-access-row:last-child {
          border-bottom: 0;
        }

        .houses-access-user {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .houses-access-avatar {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.1);
          color: #a7f3d0;
          font-size: 11px;
          font-weight: 900;
        }

        .houses-access-user strong {
          display: block;
          overflow: hidden;
          color: #e2e8f0;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .houses-access-user span {
          display: block;
          margin-top: 3px;
          color: #718399;
          font-size: 10px;
        }

        .houses-access-control {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #94a3b8;
          font-size: 10px;
        }

        .houses-access-empty {
          padding: 28px;
          color: #718399;
          font-size: 12px;
          text-align: center;
        }

        .houses-confirm-modal {
          width: min(460px, 100%);
          padding: 22px;
          border: 1px solid rgba(248, 113, 113, 0.16);
          border-radius: 20px;
          background: #0b1728;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
        }

        .houses-confirm-icon {
          width: 50px;
          height: 50px;
          display: grid;
          place-items: center;
          margin-bottom: 15px;
          border-radius: 16px;
          background: rgba(127, 29, 29, 0.18);
          color: #fca5a5;
        }

        .houses-confirm-modal h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 21px;
        }

        .houses-confirm-modal p {
          margin: 9px 0 18px;
          color: #8394a8;
          font-size: 12px;
          line-height: 1.6;
        }

        .houses-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
        }

        .houses-spin {
          animation: houses-spin 0.85s linear infinite;
        }

        @keyframes houses-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .houses-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .houses-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .houses-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .houses-search {
            min-width: 0;
          }

          .houses-filter {
            width: 100%;
          }

          .houses-access-row {
            grid-template-columns: 1fr 110px 110px;
          }
        }

        @media (max-width: 650px) {
          .houses-header {
            align-items: stretch;
            flex-direction: column;
          }

          .houses-header-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .houses-grid {
            grid-template-columns: 1fr;
          }

          .houses-form-grid {
            grid-template-columns: 1fr;
          }

          .houses-field.full {
            grid-column: auto;
          }

          .house-card-actions {
            grid-template-columns: 1fr auto auto auto;
          }

          .houses-access-row {
            grid-template-columns: 1fr;
          }

          .houses-access-control {
            justify-content: space-between;
          }
        }

        @media (max-width: 440px) {
          .houses-stats {
            grid-template-columns: 1fr;
          }

          .houses-header-actions {
            grid-template-columns: 1fr;
          }

          .houses-confirm-actions,
          .houses-modal-footer {
            align-items: stretch;
            flex-direction: column-reverse;
          }

          .houses-confirm-actions .houses-button,
          .houses-modal-footer .houses-button {
            width: 100%;
          }
        }
      `}</style>

      <header className="houses-header">
        <div className="houses-title">
          <span>Správa nemovitostí</span>
          <h1>Vyberte dům</h1>
          <p>
            Po přihlášení nejprve vyberte dům, se kterým chcete pracovat.
            Každý uživatel uvidí pouze domy, ke kterým má přidělený přístup.
          </p>
        </div>

        <div className="houses-header-actions">
          <button
            type="button"
            className="houses-button secondary"
            onClick={() => loadHouses({ silent: true })}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={17}
              className={refreshing ? "houses-spin" : ""}
            />
            {refreshing ? "Obnovuji…" : "Obnovit"}
          </button>

          {isAdministrator && (
            <button
              type="button"
              className="houses-button primary"
              onClick={openCreateModal}
            >
              <Plus size={18} />
              Nový dům
            </button>
          )}
        </div>
      </header>

      {pageError && (
        <div className="houses-alert error" role="alert">
          <CircleAlert size={17} />
          <span>{pageError}</span>
        </div>
      )}

      {successMessage && (
        <div className="houses-alert success" role="status">
          <Check size={17} />
          <span>{successMessage}</span>
        </div>
      )}

      <section className="houses-stats">
        <article className="houses-stat">
          <div className="houses-stat-icon">
            <Building2 size={21} />
          </div>
          <div>
            <strong>{statistics.total}</strong>
            <span>Dostupných domů</span>
          </div>
        </article>

        <article className="houses-stat">
          <div className="houses-stat-icon">
            <ShieldCheck size={21} />
          </div>
          <div>
            <strong>{statistics.active}</strong>
            <span>Aktivních domů</span>
          </div>
        </article>

        <article className="houses-stat">
          <div className="houses-stat-icon">
            <DoorOpen size={21} />
          </div>
          <div>
            <strong>{statistics.units}</strong>
            <span>Bytových jednotek</span>
          </div>
        </article>

        <article className="houses-stat">
          <div className="houses-stat-icon">
            <Users size={21} />
          </div>
          <div>
            <strong>{statistics.tenants}</strong>
            <span>Nájemníků</span>
          </div>
        </article>
      </section>

      <section className="houses-toolbar">
        <div className="houses-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hledat podle názvu, adresy nebo správce…"
          />

          {search && (
            <button
              type="button"
              className="house-link-action"
              onClick={() => setSearch("")}
              aria-label="Vymazat hledání"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          className="houses-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">Všechny dostupné domy</option>
          <option value="active">Pouze aktivní</option>
          <option value="inactive">Pouze neaktivní</option>
        </select>
      </section>

      {loading ? (
        <div className="houses-loading">
          <div className="houses-loading-inner">
            <LoaderCircle size={28} className="houses-spin" />
            <strong>Načítám dostupné domy…</strong>
          </div>
        </div>
      ) : filteredHouses.length === 0 ? (
        <div className="houses-empty">
          <div>
            <div className="houses-empty-icon">
              <Home size={29} />
            </div>

            <h2>
              {houses.length === 0
                ? isAdministrator
                  ? "Zatím tu není žádný dům"
                  : "Nemáte přístup k žádnému domu"
                : "Žádný dům neodpovídá filtru"}
            </h2>

            <p>
              {houses.length === 0
                ? isAdministrator
                  ? "Vytvořte první dům a následně nastavte, kteří uživatelé ho mohou vidět nebo spravovat."
                  : "Správce vám zatím nepřidělil přístup k žádnému domu."
                : "Změňte hledaný výraz nebo nastavení filtru."}
            </p>

            {houses.length === 0 && isAdministrator && (
              <button
                type="button"
                className="houses-button primary"
                onClick={openCreateModal}
              >
                <Plus size={18} />
                Vytvořit první dům
              </button>
            )}
          </div>
        </div>
      ) : (
        <section className="houses-grid">
          {filteredHouses.map((house) => {
            const isSelected = String(house.id) === String(selectedHouseId);
            const isInactive = house.active === false;
            const canManageHouse =
              isAdministrator || house.access_can_manage;

            return (
              <article
                key={house.id}
                className={`house-card ${isSelected ? "selected" : ""}`}
              >
                <div className="house-card-image">
                  {house.image_url ? (
                    <img src={house.image_url} alt={house.name} />
                  ) : (
                    <div className="house-card-placeholder">
                      <span>{getHouseInitials(house.name)}</span>
                    </div>
                  )}

                  <div className="house-card-badges">
                    {isSelected ? (
                      <span className="house-badge selected">
                        <Check size={12} />
                        Aktuální dům
                      </span>
                    ) : (
                      <span className="house-badge">
                        <Building2 size={12} />
                        Nemovitost
                      </span>
                    )}

                    {isInactive && (
                      <span className="house-badge inactive">
                        Neaktivní
                      </span>
                    )}
                  </div>
                </div>

                <div className="house-card-content">
                  <div className="house-card-heading">
                    <div>
                      <h2>{house.name}</h2>
                      <p>
                        <MapPin size={13} />
                        <span>
                          {getFullAddress(house) || "Adresa není vyplněná"}
                        </span>
                      </p>
                    </div>

                    <span
                      className={`house-card-status ${
                        isInactive ? "inactive" : ""
                      }`}
                      title={isInactive ? "Neaktivní dům" : "Aktivní dům"}
                    />
                  </div>

                  <div className="house-card-meta">
                    <div className="house-card-meta-item">
                      <DoorOpen size={17} />
                      <div>
                        <strong>{normalizeNumber(house.units)}</strong>
                        <span>Bytových jednotek</span>
                      </div>
                    </div>

                    <div className="house-card-meta-item">
                      <Users size={17} />
                      <div>
                        <strong>{normalizeNumber(house.tenants)}</strong>
                        <span>Nájemníků</span>
                      </div>
                    </div>
                  </div>

                  <div className="house-card-manager">
                    Správce:{" "}
                    <strong>
                      {house.manager_name || "Není přiřazen"}
                    </strong>
                  </div>

                  <div className="house-card-actions">
                    <button
                      type="button"
                      className="house-card-action primary"
                      onClick={() => handleOpenHouse(house)}
                      disabled={isInactive}
                    >
                      {isSelected ? <Home size={15} /> : <Check size={15} />}
                      {isSelected ? "Otevřít dům" : "Vybrat a otevřít"}
                      <ChevronRight size={14} />
                    </button>

                    {canManageHouse && (
                      <button
                        type="button"
                        className="house-card-action icon-only"
                        onClick={() => openEditModal(house)}
                        title="Upravit dům"
                      >
                        <Edit3 size={15} />
                      </button>
                    )}

                    {canManageHouse && (
                      <button
                        type="button"
                        className="house-card-action icon-only"
                        onClick={() => handleOpenSettings(house)}
                        title="Nastavení domu"
                      >
                        <ShieldCheck size={15} />
                      </button>
                    )}

                    {isAdministrator && (
                      <button
                        type="button"
                        className="house-card-action icon-only"
                        onClick={() => openAccessModal(house)}
                        title="Přístupy uživatelů k domu"
                      >
                        <UserCog size={15} />
                      </button>
                    )}
                  </div>

                  {canManageHouse && (
                    <div className="house-card-footer-actions">
                      <button
                        type="button"
                        className="house-link-action"
                        onClick={() => toggleHouseActive(house)}
                      >
                        {isInactive ? "Aktivovat dům" : "Deaktivovat dům"}
                      </button>

                      {isAdministrator && (
                        <button
                          type="button"
                          className="house-link-action danger"
                          onClick={() => setDeleteConfirmHouse(house)}
                        >
                          Odstranit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {modalOpen && (
        <div
          className="houses-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="houses-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="house-modal-title"
          >
            <div className="houses-modal-header">
              <div>
                <span>Správa domů</span>
                <h2 id="house-modal-title">
                  {editingHouse.id ? "Upravit dům" : "Vytvořit nový dům"}
                </h2>
              </div>

              <button
                type="button"
                className="houses-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Zavřít"
              >
                <X size={18} />
              </button>
            </div>

            <form className="houses-form" onSubmit={saveHouse}>
              <div className="houses-form-grid">
                <div className="houses-field full">
                  <label htmlFor="house-name">Název domu *</label>
                  <input
                    id="house-name"
                    type="text"
                    value={editingHouse.name}
                    onChange={(event) =>
                      updateEditingHouse("name", event.target.value)
                    }
                    placeholder="např. Vila Kolín"
                    autoFocus
                    required
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-street">Ulice</label>
                  <input
                    id="house-street"
                    type="text"
                    value={editingHouse.street}
                    onChange={(event) =>
                      updateEditingHouse("street", event.target.value)
                    }
                    placeholder="např. Martinská"
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-number">Číslo domu</label>
                  <input
                    id="house-number"
                    type="text"
                    value={editingHouse.house_number}
                    onChange={(event) =>
                      updateEditingHouse("house_number", event.target.value)
                    }
                    placeholder="např. 1435"
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-zip">PSČ</label>
                  <input
                    id="house-zip"
                    type="text"
                    value={editingHouse.zip_code}
                    onChange={(event) =>
                      updateEditingHouse("zip_code", event.target.value)
                    }
                    placeholder="např. 280 02"
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-city">Město</label>
                  <input
                    id="house-city"
                    type="text"
                    value={editingHouse.city}
                    onChange={(event) =>
                      updateEditingHouse("city", event.target.value)
                    }
                    placeholder="např. Kolín"
                  />
                </div>

                <div className="houses-field full">
                  <label htmlFor="house-country">Země</label>
                  <input
                    id="house-country"
                    type="text"
                    value={editingHouse.country}
                    onChange={(event) =>
                      updateEditingHouse("country", event.target.value)
                    }
                    placeholder="Česká republika"
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-units">Počet bytových jednotek</label>
                  <input
                    id="house-units"
                    type="number"
                    min="0"
                    step="1"
                    value={editingHouse.units}
                    onChange={(event) =>
                      updateEditingHouse("units", event.target.value)
                    }
                    placeholder="0"
                  />
                </div>

                <div className="houses-field">
                  <label htmlFor="house-tenants">Počet nájemníků</label>
                  <input
                    id="house-tenants"
                    type="number"
                    min="0"
                    step="1"
                    value={editingHouse.tenants}
                    onChange={(event) =>
                      updateEditingHouse("tenants", event.target.value)
                    }
                    placeholder="0"
                  />
                </div>

                <div className="houses-field full">
                  <label htmlFor="house-manager">Správce domu</label>
                  <input
                    id="house-manager"
                    type="text"
                    value={editingHouse.manager_name}
                    onChange={(event) =>
                      updateEditingHouse("manager_name", event.target.value)
                    }
                    placeholder="Jméno správce nebo správní společnosti"
                  />
                </div>

                <div className="houses-field full">
                  <label htmlFor="house-image">URL fotografie domu</label>
                  <input
                    id="house-image"
                    type="url"
                    value={editingHouse.image_url}
                    onChange={(event) =>
                      updateEditingHouse("image_url", event.target.value)
                    }
                    placeholder="https://…"
                  />
                </div>

                <div className="houses-field full">
                  <label htmlFor="house-description">Popis domu</label>
                  <textarea
                    id="house-description"
                    value={editingHouse.description}
                    onChange={(event) =>
                      updateEditingHouse("description", event.target.value)
                    }
                    placeholder="Doplňující informace o domu…"
                  />
                </div>

                <div className="houses-field full">
                  <div className="houses-switch-row">
                    <div>
                      <strong>Aktivní dům</strong>
                      <span>
                        Neaktivní dům nebude možné otevřít pro běžnou práci.
                      </span>
                    </div>

                    <label className="houses-switch">
                      <input
                        type="checkbox"
                        checked={Boolean(editingHouse.active)}
                        onChange={(event) =>
                          updateEditingHouse("active", event.target.checked)
                        }
                      />
                      <span className="houses-switch-slider" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="houses-modal-footer">
                <button
                  type="button"
                  className="houses-button secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Zrušit
                </button>

                <button
                  type="submit"
                  className="houses-button primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={17} className="houses-spin" />
                      Ukládám…
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      {editingHouse.id ? "Uložit změny" : "Vytvořit dům"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {accessModalHouse && (
        <div
          className="houses-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !savingAccess
            ) {
              setAccessModalHouse(null);
            }
          }}
        >
          <div
            className="houses-modal access"
            role="dialog"
            aria-modal="true"
            aria-labelledby="house-access-title"
          >
            <div className="houses-modal-header">
              <div>
                <span>Přístupy uživatelů</span>
                <h2 id="house-access-title">
                  {accessModalHouse.name}
                </h2>
              </div>

              <button
                type="button"
                className="houses-modal-close"
                onClick={() => setAccessModalHouse(null)}
                disabled={savingAccess}
                aria-label="Zavřít"
              >
                <X size={18} />
              </button>
            </div>

            <div className="houses-access-content">
              <div className="houses-access-search">
                <Search size={16} />
                <input
                  type="search"
                  value={accessSearch}
                  onChange={(event) =>
                    setAccessSearch(event.target.value)
                  }
                  placeholder="Hledat uživatele…"
                />
              </div>

              {loadingAccess ? (
                <div className="houses-loading" style={{ minHeight: 260 }}>
                  <div className="houses-loading-inner">
                    <LoaderCircle size={26} className="houses-spin" />
                    <strong>Načítám uživatele a jejich přístupy…</strong>
                  </div>
                </div>
              ) : filteredAccessUsers.length === 0 ? (
                <div className="houses-access-empty">
                  Nebyl nalezen žádný aktivní uživatel.
                </div>
              ) : (
                <div className="houses-access-list">
                  {filteredAccessUsers.map((user) => {
                    const access = accessMap[user.id] || {
                      can_view: false,
                      can_manage: false,
                    };

                    return (
                      <div className="houses-access-row" key={user.id}>
                        <div className="houses-access-user">
                          <div className="houses-access-avatar">
                            {getHouseInitials(getUserLabel(user))}
                          </div>

                          <div>
                            <strong>{getUserLabel(user)}</strong>
                            <span>
                              {user.role || "Bez role"}
                              {user.username
                                ? ` · @${user.username}`
                                : ""}
                            </span>
                          </div>
                        </div>

                        <div className="houses-access-control">
                          {access.can_view ? (
                            <Eye size={15} />
                          ) : (
                            <EyeOff size={15} />
                          )}
                          <span>Vidí dům</span>

                          <label className="houses-switch">
                            <input
                              type="checkbox"
                              checked={Boolean(access.can_view)}
                              onChange={(event) =>
                                updateAccess(
                                  user.id,
                                  "can_view",
                                  event.target.checked
                                )
                              }
                            />
                            <span className="houses-switch-slider" />
                          </label>
                        </div>

                        <div className="houses-access-control">
                          <KeyRound size={15} />
                          <span>Spravuje</span>

                          <label className="houses-switch">
                            <input
                              type="checkbox"
                              checked={Boolean(access.can_manage)}
                              onChange={(event) =>
                                updateAccess(
                                  user.id,
                                  "can_manage",
                                  event.target.checked
                                )
                              }
                            />
                            <span className="houses-switch-slider" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="houses-modal-footer">
                <button
                  type="button"
                  className="houses-button secondary"
                  onClick={() => setAccessModalHouse(null)}
                  disabled={savingAccess}
                >
                  Zrušit
                </button>

                <button
                  type="button"
                  className="houses-button primary"
                  onClick={saveHouseAccess}
                  disabled={savingAccess || loadingAccess}
                >
                  {savingAccess ? (
                    <>
                      <LoaderCircle size={17} className="houses-spin" />
                      Ukládám…
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      Uložit přístupy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmHouse && (
        <div
          className="houses-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !deletingHouseId
            ) {
              setDeleteConfirmHouse(null);
            }
          }}
        >
          <div
            className="houses-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-house-title"
          >
            <div className="houses-confirm-icon">
              <Trash2 size={23} />
            </div>

            <h2 id="delete-house-title">Odstranit dům?</h2>
            <p>
              Opravdu chcete odstranit dům{" "}
              <strong>„{deleteConfirmHouse.name}“</strong>? Tuto akci nelze
              vrátit zpět.
            </p>

            <div className="houses-confirm-actions">
              <button
                type="button"
                className="houses-button secondary"
                onClick={() => setDeleteConfirmHouse(null)}
                disabled={Boolean(deletingHouseId)}
              >
                Zrušit
              </button>

              <button
                type="button"
                className="houses-button danger"
                onClick={deleteHouse}
                disabled={Boolean(deletingHouseId)}
              >
                {deletingHouseId ? (
                  <>
                    <LoaderCircle size={17} className="houses-spin" />
                    Odstraňuji…
                  </>
                ) : (
                  <>
                    <Trash2 size={17} />
                    Odstranit dům
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
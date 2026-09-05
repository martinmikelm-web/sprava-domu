import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Camera,
  Check,
  CircleAlert,
  Edit3,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  ROLE_KEYS,
  ROLE_OPTIONS,
  getRoleLabel,
  hasPermission,
} from "../lib/permissions";

const PROFILE_PHOTOS_BUCKET = "profile-photos";

const EMPTY_FORM = {
  id: "",
  full_name: "",
  username: "",
  email: "",
  password: "",
  active: true,
  roles: [],
  houseAssignments: {},

  avatar_path: "",
  avatar_url: "",

  birth_surname: "",
  previous_surnames: "",
  birth_date: "",
  birth_place: "",
  personal_number: "",
  citizenship: "Česká republika",

  phone: "",

  permanent_street: "",
  permanent_house_number: "",
  permanent_zip: "",
  permanent_city: "",
  permanent_country: "Česká republika",

  contact_address_same: true,
  contact_street: "",
  contact_house_number: "",
  contact_zip: "",
  contact_city: "",
  contact_country: "Česká republika",

  id_document_type: "Občanský průkaz",
  id_document_number: "",
  id_document_issued_by: "",
  id_document_valid_until: "",

  health_insurance_company: "",
  bank_account: "",

  tax_residency: "Česká republika",
  foreign_tax_id: "",
  work_permit_number: "",
  work_permit_valid_until: "",

  emergency_contact_name: "",
  emergency_contact_phone: "",

  current_status: "employee",
  employer_name: "",
  employer_ico: "",
  employer_address: "",
  job_title: "",
  employment_type: "",
  employment_start_date: "",
  employment_end_date: "",
  average_monthly_income: "",
  employment_note: "",

  school_name: "",
  school_address: "",
  study_program: "",
  study_form: "",
  study_start_date: "",
  expected_graduation_date: "",
  student_id: "",
  study_note: "",
};

function initials(name, username) {
  const source = String(name || username || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return source.slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) return "Neuvedeno";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Neuvedeno";

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
  }).format(date);
}

function getCurrentStatusLabel(status) {
  const labels = {
    employee: "Zaměstnanec",
    self_employed: "OSVČ",
    student: "Student",
    employee_student: "Zaměstnanec a student",
    unemployed: "Bez zaměstnání",
    retired: "Důchodce",
    parental_leave: "Rodičovská / mateřská",
    other: "Jiný status",
  };

  return labels[status] || "Neuvedeno";
}

function getWorkStudySummary(user) {
  const status = String(user?.current_status || "").trim();

  if (status === "student") {
    return user?.school_name || "Škola neuvedena";
  }

  if (status === "employee_student") {
    const parts = [
      user?.employer_name,
      user?.school_name,
    ].filter(Boolean);

    return parts.join(" · ") || "Práce a škola neuvedena";
  }

  if (status === "employee" || status === "self_employed") {
    return (
      user?.employer_name ||
      user?.job_title ||
      "Zaměstnavatel neuveden"
    );
  }

  return user?.employment_note || user?.study_note || "Bez doplňujících údajů";
}

function roleNeedsHouse(roleKey) {
  return [
    ROLE_KEYS.OWNER,
    ROLE_KEYS.TENANT,
    ROLE_KEYS.SUBTENANT,
  ].includes(roleKey);
}

function czechError(error, fallback) {
  const message = String(error?.message || "");
  if (
    error?.code === "42501" ||
    message.toLowerCase().includes("row-level security")
  ) {
    return "Nemáte oprávnění tuto změnu provést.";
  }
  if (message.toLowerCase().includes("duplicate")) {
    return "Stejný údaj už používá jiný uživatel.";
  }
  return message || fallback;
}

async function getFunctionErrorMessage(error, fallback) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json();

      if (payload?.error) {
        return payload?.stage
          ? `${payload.error} (část: ${payload.stage})`
          : payload.error;
      }
    }
  } catch (parseError) {
    console.warn("Odpověď Edge Function nešla přečíst:", parseError);
  }

  return czechError(error, fallback);
}

function cleanText(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function getFileExtension(file) {
  const fromName = String(file?.name || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (fromName && fromName !== String(file?.name || "").toLowerCase()) {
    return fromName.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  const mimeExtension = String(file?.type || "")
    .split("/")
    .pop()
    .toLowerCase();

  return mimeExtension.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function createAvatarSignedUrl(avatarPath) {
  if (!avatarPath) return "";

  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(avatarPath, 60 * 60);

  if (error) {
    console.warn("Profilovou fotografii se nepodařilo načíst:", error);
    return "";
  }

  return data?.signedUrl || "";
}

export default function Users({
  permission,
  isAdministrator = false,
}) {
  const canView =
    isAdministrator || hasPermission(permission, "view");
  const canEdit =
    isAdministrator ||
    hasPermission(permission, "edit") ||
    hasPermission(permission, "manage");
  const canManage =
    isAdministrator || hasPermission(permission, "manage");

  const [users, setUsers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [pageError, setPageError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData({ silent = false } = {}) {
    if (!canView) {
      setLoading(false);
      setPageError("Nemáte oprávnění zobrazit uživatele.");
      return;
    }

    silent ? setRefreshing(true) : setLoading(true);
    setPageError("");

    try {
      const [usersResult, housesResult, rolesResult, assignmentsResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, full_name, username, email, active, created_at, updated_at, avatar_path, birth_surname, previous_surnames, birth_date, birth_place, personal_number, citizenship, phone, permanent_street, permanent_house_number, permanent_zip, permanent_city, permanent_country, contact_address_same, contact_street, contact_house_number, contact_zip, contact_city, contact_country, id_document_type, id_document_number, id_document_issued_by, id_document_valid_until, health_insurance_company, bank_account, tax_residency, foreign_tax_id, work_permit_number, work_permit_valid_until, emergency_contact_name, emergency_contact_phone, current_status, employer_name, employer_ico, employer_address, job_title, employment_type, employment_start_date, employment_end_date, average_monthly_income, employment_note, school_name, school_address, study_program, study_form, study_start_date, expected_graduation_date, student_id, study_note"
            )
            .order("full_name", { ascending: true }),
          supabase
            .from("houses")
            .select("id, name")
            .order("name", { ascending: true }),
          supabase
            .from("profile_roles")
            .select("user_id, role_key"),
          supabase
            .from("user_house_roles")
            .select("user_id, house_id, role_key"),
        ]);

      if (usersResult.error) throw usersResult.error;
      if (housesResult.error) throw housesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const rolesByUser = new Map();
      for (const row of rolesResult.data || []) {
        const values = rolesByUser.get(row.user_id) || [];
        values.push(row.role_key);
        rolesByUser.set(row.user_id, values);
      }

      const assignmentsByUser = new Map();
      for (const row of assignmentsResult.data || []) {
        const userMap =
          assignmentsByUser.get(row.user_id) || {};
        userMap[row.role_key] = [
          ...(userMap[row.role_key] || []),
          row.house_id,
        ];
        assignmentsByUser.set(row.user_id, userMap);
      }

      const usersWithDetails = await Promise.all(
        (usersResult.data || []).map(async (user) => ({
          ...user,
          avatar_url: await createAvatarSignedUrl(user.avatar_path),
          roles: rolesByUser.get(user.id) || [],
          houseAssignments:
            assignmentsByUser.get(user.id) || {},
        }))
      );

      setUsers(usersWithDetails);
      setHouses(housesResult.data || []);
    } catch (error) {
      console.error("Načtení uživatelů selhalo:", error);
      setPageError(
        czechError(error, "Uživatele se nepodařilo načíst.")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canView]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(timer);
  }, [success]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;

    return users.filter((user) => {
      const roles = user.roles.map(getRoleLabel).join(" ");
      return [
        user.full_name,
        user.username,
        user.email,
        user.phone,
        user.personal_number,
        user.birth_place,
        user.permanent_city,
        user.citizenship,
        user.employer_name,
        user.job_title,
        user.school_name,
        user.study_program,
        getCurrentStatusLabel(user.current_status),
        roles,
      ].some((value) =>
        String(value || "").toLowerCase().includes(needle)
      );
    });
  }, [users, search]);

  function openCreateUser() {
    if (!canManage) return;

    setSelectedUser(null);
    setIsCreating(true);
    setModalError("");
    setAvatarFile(null);
    setAvatarPreview("");
    setForm({
      ...EMPTY_FORM,
      active: true,
      roles: [ROLE_KEYS.TENANT],
    });
  }

  function openUser(user) {
    if (!canEdit) return;

    setSelectedUser(user);
    setIsCreating(false);
    setModalError("");
    setAvatarFile(null);
    setAvatarPreview(user.avatar_url || "");
    setForm({
      ...EMPTY_FORM,
      ...user,
      id: user.id,
      full_name: user.full_name || "",
      username: user.username || "",
      email: user.email || "",
      password: "",
      active: user.active !== false,
      avatar_path: user.avatar_path || "",
      avatar_url: user.avatar_url || "",
      roles: [...(user.roles || [])],
      houseAssignments: JSON.parse(
        JSON.stringify(user.houseAssignments || {})
      ),
      contact_address_same: user.contact_address_same !== false,
      citizenship: user.citizenship || "Česká republika",
      permanent_country:
        user.permanent_country || "Česká republika",
      contact_country:
        user.contact_country || "Česká republika",
      id_document_type:
        user.id_document_type || "Občanský průkaz",
      tax_residency:
        user.tax_residency || "Česká republika",
      current_status:
        user.current_status || "employee",
    });
  }

  function closeModal() {
    if (saving) return;
    setSelectedUser(null);
    setIsCreating(false);
    setForm(EMPTY_FORM);
    setAvatarFile(null);
    setAvatarPreview("");
    setModalError("");
  }

  function handleAvatarSelected(file) {
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) {
      setModalError("Vybraný soubor není obrázek.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setModalError("Profilová fotografie může mít nejvýše 8 MB.");
      return;
    }

    if (avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setModalError("");
  }

  function removeAvatar() {
    if (avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(null);
    setAvatarPreview("");
    setForm((current) => ({
      ...current,
      avatar_path: "",
      avatar_url: "",
    }));
  }

  async function uploadAvatar(targetUserId) {
    if (!avatarFile) {
      return form.avatar_path || "";
    }

    const extension = getFileExtension(avatarFile);
    const avatarPath = `${targetUserId}/avatar-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(avatarPath, avatarFile, {
        cacheControl: "3600",
        upsert: true,
        contentType: avatarFile.type || "image/jpeg",
      });

    if (error) throw error;

    if (
      form.avatar_path &&
      form.avatar_path !== avatarPath
    ) {
      const { error: removeError } = await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .remove([form.avatar_path]);

      if (removeError) {
        console.warn(
          "Původní profilovou fotografii se nepodařilo odstranit:",
          removeError
        );
      }
    }

    return avatarPath;
  }

  function toggleRole(roleKey) {
    if (!canManage) return;

    setForm((current) => {
      const enabled = current.roles.includes(roleKey);
      const roles = enabled
        ? current.roles.filter((role) => role !== roleKey)
        : [...current.roles, roleKey];

      const houseAssignments = {
        ...current.houseAssignments,
      };

      if (enabled) delete houseAssignments[roleKey];

      return { ...current, roles, houseAssignments };
    });
  }

  function toggleHouse(roleKey, houseId) {
    if (!canManage) return;

    setForm((current) => {
      const currentIds =
        current.houseAssignments[roleKey] || [];
      const enabled = currentIds.includes(houseId);
      const nextIds = enabled
        ? currentIds.filter((id) => id !== houseId)
        : [...currentIds, houseId];

      return {
        ...current,
        houseAssignments: {
          ...current.houseAssignments,
          [roleKey]: nextIds,
        },
      };
    });
  }

  async function saveUser(event) {
    event.preventDefault();
    if ((!selectedUser && !isCreating) || saving || !canEdit) return;

    const fullName = form.full_name.trim();
    const username = form.username.trim().toLowerCase();

    if (!fullName) {
      setModalError("Vyplňte celé jméno.");
      return;
    }

    if (!username) {
      setModalError("Vyplňte uživatelské jméno.");
      return;
    }

    if (!form.email.trim()) {
      setModalError("Vyplňte e-mail uživatele.");
      return;
    }

    if (isCreating && form.password.length < 8) {
      setModalError("Heslo musí mít alespoň 8 znaků.");
      return;
    }

    if (!form.roles.length) {
      setModalError("Přiřaďte uživateli alespoň jednu roli.");
      return;
    }

    for (const roleKey of form.roles.filter(roleNeedsHouse)) {
      if (!(form.houseAssignments[roleKey] || []).length) {
        setModalError(
          `Pro roli ${getRoleLabel(
            roleKey
          )} vyberte alespoň jeden dům.`
        );
        return;
      }
    }

    setSaving(true);
    setModalError("");

    try {
      let targetUserId = selectedUser?.id || "";

      if (isCreating) {
        const { data: createData, error: createError } =
          await supabase.functions.invoke("create-user", {
            body: {
              email: form.email.trim().toLowerCase(),
              password: form.password,
              full_name: fullName,
              username,
              active: Boolean(form.active),
              roles: form.roles,
              house_assignments: form.houseAssignments,
              profile: {
                birth_surname: cleanText(form.birth_surname),
                previous_surnames: cleanText(form.previous_surnames),
                birth_date: form.birth_date || null,
                birth_place: cleanText(form.birth_place),
                personal_number: cleanText(form.personal_number),
                citizenship: cleanText(form.citizenship),
                phone: cleanText(form.phone),
                permanent_street: cleanText(form.permanent_street),
                permanent_house_number: cleanText(form.permanent_house_number),
                permanent_zip: cleanText(form.permanent_zip),
                permanent_city: cleanText(form.permanent_city),
                permanent_country: cleanText(form.permanent_country),
                contact_address_same: Boolean(form.contact_address_same),
                contact_street: cleanText(form.contact_street),
                contact_house_number: cleanText(form.contact_house_number),
                contact_zip: cleanText(form.contact_zip),
                contact_city: cleanText(form.contact_city),
                contact_country: cleanText(form.contact_country),
                id_document_type: cleanText(form.id_document_type),
                id_document_number: cleanText(form.id_document_number),
                id_document_issued_by: cleanText(form.id_document_issued_by),
                id_document_valid_until:
                  form.id_document_valid_until || null,
                health_insurance_company:
                  cleanText(form.health_insurance_company),
                bank_account: cleanText(form.bank_account),
                tax_residency: cleanText(form.tax_residency),
                foreign_tax_id: cleanText(form.foreign_tax_id),
                work_permit_number:
                  cleanText(form.work_permit_number),
                work_permit_valid_until:
                  form.work_permit_valid_until || null,
                emergency_contact_name:
                  cleanText(form.emergency_contact_name),
                emergency_contact_phone:
                  cleanText(form.emergency_contact_phone),

                current_status: cleanText(form.current_status),
                employer_name: cleanText(form.employer_name),
                employer_ico: cleanText(form.employer_ico),
                employer_address: cleanText(form.employer_address),
                job_title: cleanText(form.job_title),
                employment_type: cleanText(form.employment_type),
                employment_start_date:
                  form.employment_start_date || null,
                employment_end_date:
                  form.employment_end_date || null,
                average_monthly_income:
                  form.average_monthly_income === ""
                    ? null
                    : Number(form.average_monthly_income),
                employment_note:
                  cleanText(form.employment_note),

                school_name: cleanText(form.school_name),
                school_address: cleanText(form.school_address),
                study_program: cleanText(form.study_program),
                study_form: cleanText(form.study_form),
                study_start_date:
                  form.study_start_date || null,
                expected_graduation_date:
                  form.expected_graduation_date || null,
                student_id: cleanText(form.student_id),
                study_note: cleanText(form.study_note),
              },
            },
          });

        if (createError) throw createError;
        if (!createData?.user_id) {
          throw new Error(
            createData?.error || "Nový uživatel nebyl vytvořen."
          );
        }

        targetUserId = createData.user_id;
      } else {
        const { error: rolesError } = await supabase.rpc(
          "replace_user_roles",
          {
            target_user_id: targetUserId,
            role_keys: form.roles,
          }
        );
        if (rolesError) throw rolesError;
      }

      const avatarPath = await uploadAvatar(targetUserId);

      const profilePayload = {
        full_name: fullName,
        username,
        email: form.email.trim().toLowerCase(),
        active: Boolean(form.active),
        avatar_path: avatarPath || null,

        birth_surname: cleanText(form.birth_surname),
        previous_surnames: cleanText(form.previous_surnames),
        birth_date: form.birth_date || null,
        birth_place: cleanText(form.birth_place),
        personal_number: cleanText(form.personal_number),
        citizenship: cleanText(form.citizenship),
        phone: cleanText(form.phone),

        permanent_street: cleanText(form.permanent_street),
        permanent_house_number:
          cleanText(form.permanent_house_number),
        permanent_zip: cleanText(form.permanent_zip),
        permanent_city: cleanText(form.permanent_city),
        permanent_country:
          cleanText(form.permanent_country),

        contact_address_same:
          Boolean(form.contact_address_same),
        contact_street: form.contact_address_same
          ? null
          : cleanText(form.contact_street),
        contact_house_number: form.contact_address_same
          ? null
          : cleanText(form.contact_house_number),
        contact_zip: form.contact_address_same
          ? null
          : cleanText(form.contact_zip),
        contact_city: form.contact_address_same
          ? null
          : cleanText(form.contact_city),
        contact_country: form.contact_address_same
          ? null
          : cleanText(form.contact_country),

        id_document_type:
          cleanText(form.id_document_type),
        id_document_number:
          cleanText(form.id_document_number),
        id_document_issued_by:
          cleanText(form.id_document_issued_by),
        id_document_valid_until:
          form.id_document_valid_until || null,

        health_insurance_company:
          cleanText(form.health_insurance_company),
        bank_account: cleanText(form.bank_account),

        tax_residency: cleanText(form.tax_residency),
        foreign_tax_id: cleanText(form.foreign_tax_id),
        work_permit_number:
          cleanText(form.work_permit_number),
        work_permit_valid_until:
          form.work_permit_valid_until || null,

        emergency_contact_name:
          cleanText(form.emergency_contact_name),
        emergency_contact_phone:
          cleanText(form.emergency_contact_phone),

        current_status: cleanText(form.current_status),
        employer_name: cleanText(form.employer_name),
        employer_ico: cleanText(form.employer_ico),
        employer_address: cleanText(form.employer_address),
        job_title: cleanText(form.job_title),
        employment_type: cleanText(form.employment_type),
        employment_start_date:
          form.employment_start_date || null,
        employment_end_date:
          form.employment_end_date || null,
        average_monthly_income:
          form.average_monthly_income === ""
            ? null
            : Number(form.average_monthly_income),
        employment_note: cleanText(form.employment_note),

        school_name: cleanText(form.school_name),
        school_address: cleanText(form.school_address),
        study_program: cleanText(form.study_program),
        study_form: cleanText(form.study_form),
        study_start_date:
          form.study_start_date || null,
        expected_graduation_date:
          form.expected_graduation_date || null,
        student_id: cleanText(form.student_id),
        study_note: cleanText(form.study_note),

        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", targetUserId);

      if (profileError) throw profileError;

      const houseRoleRows = [];
      for (const roleKey of form.roles.filter(roleNeedsHouse)) {
        for (const houseId of form.houseAssignments[roleKey] || []) {
          houseRoleRows.push({
            house_id: houseId,
            user_id: targetUserId,
            role_key: roleKey,
          });
        }
      }

      if (!isCreating) {
        const { error: houseRolesError } = await supabase.rpc(
          "replace_user_house_roles",
          {
            target_user_id: targetUserId,
            assignments: houseRoleRows,
          }
        );
        if (houseRolesError) throw houseRolesError;
      }

      setSuccess(
        isCreating
          ? `Uživatel ${fullName} byl vytvořen.`
          : `Uživatel ${fullName} byl uložen.`
      );
      closeModal();
      await loadData({ silent: true });

      window.dispatchEvent(
        new CustomEvent("application-permissions-changed", {
          detail: { userId: targetUserId },
        })
      );
    } catch (error) {
      console.error("Uložení uživatele selhalo:", error);
      setModalError(
        await getFunctionErrorMessage(
          error,
          isCreating
            ? "Nového uživatele se nepodařilo vytvořit."
            : "Uživatele se nepodařilo uložit."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="users-no-access">
        Nemáte oprávnění zobrazit správu uživatelů.
      </div>
    );
  }

  return (
    <div className="users-page">
      <style>{`
        .users-page {
          display: grid;
          gap: 20px;
          color: #17231f;
        }

        .users-page * { box-sizing: border-box; }

        .users-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
        }

        .users-header span {
          color: #059669;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .users-header h1 {
          margin: 6px 0 0;
          color: #111827;
          font-size: 34px;
        }

        .users-header p {
          color: #52665e;
        }

        .users-button,
        .users-icon-button {
          border: 0;
          border-radius: 12px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        .users-button {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 15px;
          background: #0b8f68;
          color: #fff;
        }

        .users-button.secondary {
          background: #e7eeeb;
          color: #263a33;
        }

        .users-button:disabled,
        .users-icon-button:disabled {
          pointer-events: none;
          cursor: not-allowed;
          opacity: .45;
        }

        .users-alert {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 14px;
          border-radius: 13px;
        }

        .users-alert.error {
          color: #7f1d1d;
          background: #fef2f2;
          border: 1px solid #fecaca;
        }

        .users-alert.success {
          color: #14532d;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .users-toolbar {
          display: flex;
          gap: 12px;
          padding: 14px;
          border: 1px solid #dce5e0;
          border-radius: 16px;
          background: #fff;
        }

        .users-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 44px;
          padding: 0 13px;
          border: 1px solid #d8e2dd;
          border-radius: 12px;
          color: #60736a;
        }

        .users-search input {
          width: 100%;
          border: 0;
          outline: 0;
          color: #111827;
          background: transparent;
        }

        .users-table-wrap {
          overflow: auto;
          border: 1px solid #dce5e0;
          border-radius: 17px;
          background: #fff;
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1180px;
        }

        .users-table th,
        .users-table td {
          padding: 13px 14px;
          border-bottom: 1px solid #e7eeea;
          text-align: left;
        }

        .users-table th {
          color: #52665e;
          font-size: 11px;
          text-transform: uppercase;
        }

        .users-person {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .users-avatar {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #def5eb;
          color: #087457;
          font-weight: 900;
        }

        .users-person strong {
          display: block;
          color: #111827;
        }

        .users-person small {
          color: #687b72;
        }

        .users-basic-grid {
          display: grid;
          gap: 4px;
          min-width: 190px;
        }

        .users-basic-line {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          color: #4f635a;
          font-size: 11px;
        }

        .users-basic-line strong,
        .users-basic-line span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .users-basic-line strong {
          color: #17231f;
          font-size: 12px;
        }

        .users-basic-label {
          color: #819087;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        .users-work-status {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          max-width: 100%;
          padding: 5px 8px;
          border-radius: 999px;
          background: #e9f7f1;
          color: #087457;
          font-size: 10px;
          font-weight: 850;
        }

        .users-person {
          min-width: 210px;
        }

        .users-avatar {
          overflow: hidden;
        }

        .role-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 999px;
          background: #edf4f1;
          color: #294139;
          font-size: 11px;
          font-weight: 800;
        }

        .status-badge {
          font-size: 12px;
          font-weight: 800;
          color: #9f1239;
        }

        .status-badge.active { color: #047857; }

        .users-icon-button {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          background: #edf3f0;
          color: #315047;
        }

        .users-loading {
          padding: 45px;
          text-align: center;
          color: #52665e;
        }

        .users-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 900;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(7, 24, 20, .62);
          backdrop-filter: blur(6px);
        }

        .users-modal {
          width: min(980px, 100%);
          max-height: calc(100vh - 36px);
          overflow: auto;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 28px 90px rgba(0,0,0,.28);
        }

        .users-modal-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px 22px;
          border-bottom: 1px solid #e2e9e5;
          background: #fff;
        }

        .users-modal-header h2 {
          margin: 4px 0 0;
          color: #111827;
        }

        .users-modal-body {
          display: grid;
          gap: 20px;
          padding: 22px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .profile-photo-section {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 18px;
          padding: 16px;
          border: 1px solid #dfe7e3;
          border-radius: 16px;
          background: #f8fbf9;
        }

        .profile-photo-preview {
          width: 112px;
          height: 112px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid #d5e2dc;
          border-radius: 24px;
          background: #e4f4ed;
          color: #087457;
          font-size: 24px;
          font-weight: 900;
        }

        .profile-photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profile-photo-copy {
          min-width: 0;
        }

        .profile-photo-copy strong {
          display: block;
          color: #17231f;
          font-size: 15px;
        }

        .profile-photo-copy p {
          margin: 5px 0 12px;
          color: #61756c;
          font-size: 12px;
          line-height: 1.5;
        }

        .profile-photo-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .users-button.danger {
          background: #fff1f2;
          color: #be123c;
        }

        .personal-section {
          display: grid;
          gap: 14px;
          padding: 16px;
          border: 1px solid #dfe7e3;
          border-radius: 16px;
          background: #fbfdfc;
        }

        .personal-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 11px;
          border-bottom: 1px solid #e5ece8;
        }

        .personal-section-heading strong {
          display: block;
          color: #17231f;
          font-size: 14px;
        }

        .personal-section-heading small {
          display: block;
          margin-top: 3px;
          color: #6a7d74;
          line-height: 1.45;
        }

        .field select {
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid #d7e1dc;
          border-radius: 12px;
          color: #111827;
          background: #fff;
        }

        .field-note {
          color: #6b7d75;
          font-size: 10px;
          line-height: 1.45;
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field.full { grid-column: 1 / -1; }

        .field label,
        .role-section > strong {
          color: #263a33;
          font-size: 12px;
          font-weight: 850;
        }

        .field input {
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid #d7e1dc;
          border-radius: 12px;
          color: #111827;
          background: #fff;
        }

        .role-section {
          display: grid;
          gap: 11px;
          padding: 15px;
          border: 1px solid #dfe7e3;
          border-radius: 15px;
          background: #f8fbf9;
        }

        .role-option {
          display: grid;
          gap: 9px;
          padding: 12px;
          border: 1px solid #dce5e0;
          border-radius: 13px;
          background: #fff;
        }

        .role-check {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
        }

        .role-check input {
          margin-top: 3px;
        }

        .role-check strong {
          display: block;
          color: #111827;
        }

        .role-check small {
          display: block;
          margin-top: 3px;
          color: #61756c;
          line-height: 1.45;
        }

        .house-picker {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-left: 25px;
        }

        .house-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 10px;
          border: 1px solid #dce5e0;
          border-radius: 10px;
          color: #263a33;
          background: #f8fbf9;
          cursor: pointer;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 5px;
          border-top: 1px solid #e3eae6;
        }

        @media (max-width: 680px) {
          .users-header,
          .users-toolbar {
            flex-direction: column;
          }

          .form-grid,
          .house-picker,
          .profile-photo-section {
            grid-template-columns: 1fr;
          }

          .profile-photo-preview {
            width: 96px;
            height: 96px;
          }

          .users-modal-backdrop {
            align-items: end;
            padding: 0;
          }

          .users-modal {
            width: 100%;
            max-height: 94vh;
            border-radius: 22px 22px 0 0;
          }
        }
      `}</style>

      <header className="users-header">
        <div>
          <span>Správa účtů</span>
          <h1>Uživatelé a role</h1>
          <p>
            Jeden uživatel může mít více rolí a více přiřazených domů.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="users-button"
            onClick={openCreateUser}
            disabled={!canManage}
          >
            <Plus size={17} />
            Přidat uživatele
          </button>

          <button
            type="button"
            className="users-button secondary"
            onClick={() => loadData({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw
              size={17}
              className={refreshing ? "users-spin" : ""}
            />
            {refreshing ? "Obnovuji…" : "Obnovit"}
          </button>
        </div>
      </header>

      {pageError && (
        <div className="users-alert error">
          <CircleAlert size={17} />
          {pageError}
        </div>
      )}

      {success && (
        <div className="users-alert success">
          <Check size={17} />
          {success}
        </div>
      )}

      <div className="users-toolbar">
        <label className="users-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hledat jméno, uživatelské jméno nebo roli…"
          />
        </label>
      </div>

      {loading ? (
        <div className="users-loading">
          <LoaderCircle size={24} />
          <p>Načítám uživatele…</p>
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Uživatel</th>
                <th>Kontakt</th>
                <th>Osobní údaje</th>
                <th>Práce / studium</th>
                <th>Role</th>
                <th>Stav</th>
                <th>Poslední změna</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="users-person">
                      <div className="users-avatar">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              borderRadius: 12,
                            }}
                          />
                        ) : (
                          initials(user.full_name, user.username)
                        )}
                      </div>
                      <div>
                        <strong>{user.full_name || "Bez jména"}</strong>
                        <small>@{user.username || "bez-jmena"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="users-basic-grid">
                      <span className="users-basic-label">Kontakt</span>
                      <div className="users-basic-line">
                        <strong>{user.email || "E-mail neuveden"}</strong>
                      </div>
                      <div className="users-basic-line">
                        <span>{user.phone || "Telefon neuveden"}</span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="users-basic-grid">
                      <span className="users-basic-label">Narození</span>
                      <div className="users-basic-line">
                        <strong>{formatDateOnly(user.birth_date)}</strong>
                      </div>
                      <div className="users-basic-line">
                        <span>
                          {[
                            user.birth_place,
                            user.citizenship,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Místo a občanství neuvedeno"}
                        </span>
                      </div>
                      <div className="users-basic-line">
                        <span>
                          {[
                            user.permanent_street,
                            user.permanent_house_number,
                            user.permanent_city,
                          ]
                            .filter(Boolean)
                            .join(" ") || "Adresa neuvedena"}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="users-basic-grid">
                      <span className="users-work-status">
                        {getCurrentStatusLabel(user.current_status)}
                      </span>
                      <div className="users-basic-line">
                        <strong>{getWorkStudySummary(user)}</strong>
                      </div>
                      <div className="users-basic-line">
                        <span>
                          {user.job_title ||
                            user.study_program ||
                            "Pozice nebo obor neuveden"}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="role-list">
                      {user.roles.length ? (
                        user.roles.map((role) => (
                          <span className="role-badge" key={role}>
                            <ShieldCheck size={12} />
                            {getRoleLabel(role)}
                          </span>
                        ))
                      ) : (
                        <span>Bez role</span>
                      )}
                    </div>
                  </td>

                  <td>
                    <span
                      className={`status-badge ${
                        user.active ? "active" : ""
                      }`}
                    >
                      {user.active ? "Aktivní" : "Neaktivní"}
                    </span>
                  </td>

                  <td>{formatDate(user.updated_at)}</td>

                  <td>
                    <button
                      type="button"
                      className="users-icon-button"
                      onClick={() => openUser(user)}
                      disabled={!canEdit}
                      aria-label="Upravit uživatele"
                    >
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(selectedUser || isCreating) && (
        <div
          className="users-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section className="users-modal" role="dialog" aria-modal="true">
            <header className="users-modal-header">
              <div>
                <small>
                  {isCreating ? "Nový uživatel" : "Úprava uživatele"}
                </small>
                <h2>
                  {isCreating
                    ? "Přidat uživatele"
                    : selectedUser?.full_name || "Uživatel"}
                </h2>
              </div>
              <button
                type="button"
                className="users-icon-button"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </header>

            <form className="users-modal-body" onSubmit={saveUser}>
              {modalError && (
                <div className="users-alert error">
                  <CircleAlert size={17} />
                  {modalError}
                </div>
              )}

              <div className="profile-photo-section">
                <div className="profile-photo-preview">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Profilová fotografie" />
                  ) : (
                    initials(form.full_name, form.username)
                  )}
                </div>

                <div className="profile-photo-copy">
                  <strong>Profilová fotografie</strong>
                  <p>
                    Fotografii lze vyfotit fotoaparátem zařízení nebo
                    vybrat z počítače či mobilu. Maximální velikost je 8 MB.
                  </p>

                  <div className="profile-photo-actions">
                    <button
                      type="button"
                      className="users-button secondary"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={!canEdit || saving}
                    >
                      <Camera size={16} />
                      Vyfotit
                    </button>

                    <button
                      type="button"
                      className="users-button secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canEdit || saving}
                    >
                      <ImagePlus size={16} />
                      Vybrat fotografii
                    </button>

                    {avatarPreview && (
                      <button
                        type="button"
                        className="users-button danger"
                        onClick={removeAvatar}
                        disabled={!canEdit || saving}
                      >
                        <Trash2 size={16} />
                        Odebrat
                      </button>
                    )}
                  </div>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    hidden
                    onChange={(event) => {
                      handleAvatarSelected(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      handleAvatarSelected(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Účet a základní kontakt</strong>
                    <small>Přihlašovací a základní kontaktní údaje.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Celé jméno</label>
                    <input
                      value={form.full_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          full_name: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Uživatelské jméno</label>
                    <input
                      value={form.username}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Telefon</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  {isCreating && (
                    <div className="field full">
                      <label>Dočasné heslo</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        disabled={!canManage || saving}
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>
                  )}

                  <div className="field full">
                    <label>
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            active: event.target.checked,
                          }))
                        }
                        disabled={!canManage || saving}
                      />{" "}
                      Aktivní účet
                    </label>
                  </div>
                </div>
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Osobní údaje pro smlouvy</strong>
                    <small>
                      Údaje používané při přípravě smluv a vedení
                      personální dokumentace.
                    </small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Rodné příjmení</label>
                    <input
                      value={form.birth_surname}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          birth_surname: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Dřívější příjmení</label>
                    <input
                      value={form.previous_surnames}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          previous_surnames: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Datum narození</label>
                    <input
                      type="date"
                      value={form.birth_date || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          birth_date: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Místo narození</label>
                    <input
                      value={form.birth_place}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          birth_place: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>

                  <div className="field">
                    <label>Rodné číslo / osobní identifikátor</label>
                    <input
                      value={form.personal_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          personal_number: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                    <span className="field-note">
                      Ukládejte pouze tehdy, pokud je údaj nezbytný
                      pro zákonný účel.
                    </span>
                  </div>

                  <div className="field">
                    <label>Státní občanství</label>
                    <input
                      value={form.citizenship}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          citizenship: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Trvalé bydliště</strong>
                    <small>Adresa uváděná ve smluvní dokumentaci.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Ulice</label>
                    <input
                      value={form.permanent_street}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          permanent_street: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Číslo domu</label>
                    <input
                      value={form.permanent_house_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          permanent_house_number: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>PSČ</label>
                    <input
                      value={form.permanent_zip}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          permanent_zip: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Město</label>
                    <input
                      value={form.permanent_city}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          permanent_city: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field full">
                    <label>Země</label>
                    <input
                      value={form.permanent_country}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          permanent_country: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Kontaktní adresa</strong>
                    <small>Vyplňte pouze tehdy, pokud se liší.</small>
                  </div>
                </div>

                <label className="role-check">
                  <input
                    type="checkbox"
                    checked={form.contact_address_same}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contact_address_same: event.target.checked,
                      }))
                    }
                    disabled={!canEdit || saving}
                  />
                  <span>
                    <strong>Shodná s trvalým bydlištěm</strong>
                  </span>
                </label>

                {!form.contact_address_same && (
                  <div className="form-grid">
                    <div className="field">
                      <label>Ulice</label>
                      <input
                        value={form.contact_street}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contact_street: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div className="field">
                      <label>Číslo domu</label>
                      <input
                        value={form.contact_house_number}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contact_house_number: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div className="field">
                      <label>PSČ</label>
                      <input
                        value={form.contact_zip}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contact_zip: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div className="field">
                      <label>Město</label>
                      <input
                        value={form.contact_city}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contact_city: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div className="field full">
                      <label>Země</label>
                      <input
                        value={form.contact_country}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contact_country: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Doklad totožnosti</strong>
                    <small>Identifikace smluvní strany.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Typ dokladu</label>
                    <select
                      value={form.id_document_type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          id_document_type: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    >
                      <option>Občanský průkaz</option>
                      <option>Cestovní pas</option>
                      <option>Povolení k pobytu</option>
                      <option>Jiný doklad</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Číslo dokladu</label>
                    <input
                      value={form.id_document_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          id_document_number: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Vydal</label>
                    <input
                      value={form.id_document_issued_by}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          id_document_issued_by: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Platnost do</label>
                    <input
                      type="date"
                      value={form.id_document_valid_until || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          id_document_valid_until: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Mzda, pojištění a daňové údaje</strong>
                    <small>Údaje potřebné pro personální a mzdovou agendu.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Zdravotní pojišťovna</label>
                    <input
                      value={form.health_insurance_company}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          health_insurance_company: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Bankovní účet</label>
                    <input
                      value={form.bank_account}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          bank_account: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Daňová rezidence</label>
                    <input
                      value={form.tax_residency}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tax_residency: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Zahraniční daňové číslo</label>
                    <input
                      value={form.foreign_tax_id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          foreign_tax_id: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Číslo pracovního oprávnění</label>
                    <input
                      value={form.work_permit_number}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          work_permit_number: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Pracovní oprávnění platí do</label>
                    <input
                      type="date"
                      value={form.work_permit_valid_until || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          work_permit_valid_until: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Práce nebo studium</strong>
                    <small>
                      Aktuální pracovní nebo studijní stav uživatele.
                    </small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field full">
                    <label>Aktuální status</label>
                    <select
                      value={form.current_status}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          current_status: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    >
                      <option value="employee">Zaměstnanec</option>
                      <option value="self_employed">OSVČ</option>
                      <option value="student">Student</option>
                      <option value="employee_student">
                        Zaměstnanec a student
                      </option>
                      <option value="unemployed">Bez zaměstnání</option>
                      <option value="retired">Důchodce</option>
                      <option value="parental_leave">
                        Rodičovská / mateřská dovolená
                      </option>
                      <option value="other">Jiný status</option>
                    </select>
                  </div>
                </div>

                {[
                  "employee",
                  "self_employed",
                  "employee_student",
                ].includes(form.current_status) && (
                  <div className="form-grid">
                    <div className="field">
                      <label>
                        {form.current_status === "self_employed"
                          ? "Obchodní jméno / název podnikání"
                          : "Zaměstnavatel"}
                      </label>
                      <input
                        value={form.employer_name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employer_name: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>IČO zaměstnavatele / OSVČ</label>
                      <input
                        value={form.employer_ico}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employer_ico: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field full">
                      <label>Adresa zaměstnavatele / sídla</label>
                      <input
                        value={form.employer_address}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employer_address: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Pracovní pozice / obor činnosti</label>
                      <input
                        value={form.job_title}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            job_title: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Typ pracovního vztahu</label>
                      <select
                        value={form.employment_type}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employment_type: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      >
                        <option value="">Nevybráno</option>
                        <option value="full_time">Hlavní pracovní poměr</option>
                        <option value="part_time">Zkrácený úvazek</option>
                        <option value="dpp">DPP</option>
                        <option value="dpc">DPČ</option>
                        <option value="contractor">OSVČ / dodavatel</option>
                        <option value="other">Jiný</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Pracovní vztah od</label>
                      <input
                        type="date"
                        value={form.employment_start_date || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employment_start_date: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Pracovní vztah do</label>
                      <input
                        type="date"
                        value={form.employment_end_date || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employment_end_date: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Průměrný měsíční příjem</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.average_monthly_income ?? ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            average_monthly_income: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field full">
                      <label>Poznámka k práci</label>
                      <input
                        value={form.employment_note}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            employment_note: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>
                )}

                {[
                  "student",
                  "employee_student",
                ].includes(form.current_status) && (
                  <div className="form-grid">
                    <div className="field">
                      <label>Název školy</label>
                      <input
                        value={form.school_name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            school_name: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Forma studia</label>
                      <select
                        value={form.study_form}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            study_form: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      >
                        <option value="">Nevybráno</option>
                        <option value="full_time">Prezenční</option>
                        <option value="distance">Dálková</option>
                        <option value="combined">Kombinovaná</option>
                        <option value="other">Jiná</option>
                      </select>
                    </div>

                    <div className="field full">
                      <label>Adresa školy</label>
                      <input
                        value={form.school_address}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            school_address: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Obor / studijní program</label>
                      <input
                        value={form.study_program}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            study_program: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Číslo studenta</label>
                      <input
                        value={form.student_id}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            student_id: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Studium od</label>
                      <input
                        type="date"
                        value={form.study_start_date || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            study_start_date: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field">
                      <label>Předpokládané ukončení</label>
                      <input
                        type="date"
                        value={form.expected_graduation_date || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            expected_graduation_date: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>

                    <div className="field full">
                      <label>Poznámka ke studiu</label>
                      <input
                        value={form.study_note}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            study_note: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="personal-section">
                <div className="personal-section-heading">
                  <div>
                    <strong>Nouzový kontakt</strong>
                    <small>Volitelný kontakt pro naléhavé situace.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Jméno kontaktní osoby</label>
                    <input
                      value={form.emergency_contact_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          emergency_contact_name: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="field">
                    <label>Telefon kontaktní osoby</label>
                    <input
                      type="tel"
                      value={form.emergency_contact_phone}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          emergency_contact_phone: event.target.value,
                        }))
                      }
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>
              </section>

              <div className="role-section">
                <strong>Role uživatele</strong>

                {ROLE_OPTIONS.map((role) => {
                  const selected = form.roles.includes(role.value);

                  return (
                    <div className="role-option" key={role.value}>
                      <label className="role-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRole(role.value)}
                          disabled={!canManage || saving}
                        />
                        <span>
                          <strong>{role.label}</strong>
                          <small>{role.description}</small>
                        </span>
                      </label>

                      {selected && roleNeedsHouse(role.value) && (
                        <div className="house-picker">
                          {houses.map((house) => (
                            <label className="house-chip" key={house.id}>
                              <input
                                type="checkbox"
                                checked={(
                                  form.houseAssignments[role.value] || []
                                ).includes(house.id)}
                                onChange={() =>
                                  toggleHouse(role.value, house.id)
                                }
                                disabled={!canManage || saving}
                              />
                              <Building2 size={14} />
                              {house.name}
                            </label>
                          ))}
                        </div>
                      )}

                      {selected &&
                        role.value === ROLE_KEYS.SUBTENANT && (
                          <small>
                            Konkrétní byty se přiřadí po dokončení
                            modulu Byty. Databázová tabulka je na to
                            připravená.
                          </small>
                        )}
                    </div>
                  );
                })}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="users-button secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="users-button"
                  disabled={!canEdit || saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={17} />
                      Ukládám…
                    </>
                  ) : (
                    <>
                      <Check size={17} />
                      {isCreating
                        ? "Vytvořit uživatele"
                        : "Uložit uživatele"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
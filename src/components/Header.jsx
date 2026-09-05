import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  Save,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { clearApplicationSession } from "../lib/appSession";

const EMPTY_PROFILE_FORM = {
  full_name: "",
  username: "",
  email: "",
};

const EMPTY_PASSWORD_FORM = {
  password: "",
  passwordConfirm: "",
};

export default function Header({
  title,
  selectedHouse,
  selectedHouseId,
  onChangeHouse,
  onMobileMenuOpen,
}) {
  const [houseMenuOpen, setHouseMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);

  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);

  const [message, setMessage] = useState(null);

  const houseMenuRef = useRef(null);
  const profileMenuRef = useRef(null);

  const houseName =
    selectedHouse?.name ||
    (selectedHouseId ? "Vybraný dům" : "Dům není vybrán");

  const userDisplay = useMemo(() => {
    const fullName = String(currentProfile?.full_name || "").trim();
    const username = String(currentProfile?.username || "").trim();
    const email = String(currentUser?.email || "").trim();

    const name = fullName || username || email || "Přihlášený uživatel";

    const initialsSource = fullName || username || email || "U";
    const initialsParts = initialsSource
      .replace(/@.*$/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const initials =
      initialsParts.length >= 2
        ? `${initialsParts[0][0] || ""}${
            initialsParts[initialsParts.length - 1][0] || ""
          }`.toUpperCase()
        : String(initialsParts[0] || "U").slice(0, 2).toUpperCase();

    const roleKey = String(currentProfile?.role || "").trim().toLowerCase();

    const roleLabels = {
      owner: "Majitel",
      majitel: "Majitel",
      admin: "Administrátor",
      administrator: "Administrátor",
      administrátor: "Administrátor",
      manager: "Správce",
      správce: "Správce",
      user: "Uživatel",
      tenant: "Nájemník",
      nájemník: "Nájemník",
      resident: "Obyvatel",
      demo: "Demo účet",
    };

    return {
      name,
      initials,
      role: roleLabels[roleKey] || currentProfile?.role || "Uživatel",
      email,
      username,
    };
  }, [currentProfile, currentUser]);

  async function loadCurrentUser() {
    setProfileLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = session?.user || null;

      setCurrentUser(user);

      if (!user?.id) {
        setCurrentProfile(null);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, username, role, active")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setCurrentProfile(profile || null);
    } catch (error) {
      console.error("Načtení přihlášeného uživatele selhalo:", error);
      setCurrentProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadCurrentUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event) {
      if (
        houseMenuRef.current &&
        !houseMenuRef.current.contains(event.target)
      ) {
        setHouseMenuOpen(false);
      }

      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setProfileMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setHouseMenuOpen(false);
        setProfileMenuOpen(false);
        setProfileDialogOpen(false);
        setPasswordDialogOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!profileDialogOpen) return;

    setProfileForm({
      full_name: currentProfile?.full_name || "",
      username: currentProfile?.username || "",
      email: currentUser?.email || "",
    });
    setMessage(null);
  }, [profileDialogOpen, currentProfile, currentUser]);

  useEffect(() => {
    if (!passwordDialogOpen) return;

    setPasswordForm(EMPTY_PASSWORD_FORM);
    setMessage(null);
  }, [passwordDialogOpen]);

  function handleChangeHouse() {
    setHouseMenuOpen(false);
    onChangeHouse?.();
  }

  function openProfileDialog() {
    setProfileMenuOpen(false);
    setProfileDialogOpen(true);
  }

  function openPasswordDialog() {
    setProfileMenuOpen(false);
    setPasswordDialogOpen(true);
  }

  async function handleSaveProfile(event) {
    event.preventDefault();

    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Nepodařilo se určit přihlášeného uživatele.",
      });
      return;
    }

    const fullName = profileForm.full_name.trim();
    const username = profileForm.username.trim();
    const email = profileForm.email.trim();

    if (!fullName) {
      setMessage({
        type: "error",
        text: "Vyplňte prosím celé jméno.",
      });
      return;
    }

    if (!email) {
      setMessage({
        type: "error",
        text: "Vyplňte prosím e-mail.",
      });
      return;
    }

    setProfileSaving(true);
    setMessage(null);

    try {
      if (username) {
        const { data: duplicateProfile, error: duplicateError } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .neq("id", currentUser.id)
          .maybeSingle();

        if (duplicateError) throw duplicateError;

        if (duplicateProfile) {
          throw new Error("Toto uživatelské jméno už používá jiný účet.");
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          username: username || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (profileError) throw profileError;

      if (email !== currentUser.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email,
        });

        if (emailError) throw emailError;
      }

      await loadCurrentUser();

      setMessage({
        type: "success",
        text:
          email !== currentUser.email
            ? "Profil byl uložen. Změnu e-mailu může být potřeba potvrdit v doručené zprávě."
            : "Profil byl úspěšně uložen.",
      });
    } catch (error) {
      console.error("Uložení profilu selhalo:", error);
      setMessage({
        type: "error",
        text: error?.message || "Profil se nepodařilo uložit.",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();

    if (passwordForm.password.length < 8) {
      setMessage({
        type: "error",
        text: "Nové heslo musí mít alespoň 8 znaků.",
      });
      return;
    }

    if (passwordForm.password !== passwordForm.passwordConfirm) {
      setMessage({
        type: "error",
        text: "Zadaná hesla se neshodují.",
      });
      return;
    }

    setPasswordSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.password,
      });

      if (error) throw error;

      setPasswordForm(EMPTY_PASSWORD_FORM);
      setMessage({
        type: "success",
        text: "Heslo bylo úspěšně změněno.",
      });
    } catch (error) {
      console.error("Změna hesla selhala:", error);
      setMessage({
        type: "error",
        text: error?.message || "Heslo se nepodařilo změnit.",
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSignOut() {
    setProfileMenuOpen(false);

    try {
      clearApplicationSession();

      const { error } = await supabase.auth.signOut({
        scope: "local",
      });
      if (error) throw error;
    } catch (error) {
      console.error("Odhlášení selhalo:", error);
      window.alert(error?.message || "Odhlášení se nepodařilo.");
    }
  }

  return (
    <>
      <style>{`
        /* Moderní responzivní horní lišta */
        .topbar {
          position: sticky;
          top: 0;
          z-index: 220;
          min-height: 76px;
          display: grid;
          grid-template-columns: minmax(190px, auto) minmax(0, 1fr);
          align-items: center;
          gap: 22px;
          padding: 10px clamp(16px, 2.3vw, 34px);
          border-bottom: 1px solid rgba(213, 226, 220, 0.92);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 8px 28px rgba(30, 63, 51, 0.055);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .topbar-left {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .topbar-page-identity {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .topbar-page-mark {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid #dce9e3;
          border-radius: 12px;
          background: linear-gradient(145deg, #f5fbf8, #eaf5f0);
          color: #08775a;
        }

        .topbar-title {
          min-width: 0;
        }

        .topbar-eyebrow {
          display: block;
          overflow: hidden;
          color: #16805f;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.13em;
          line-height: 1.25;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .topbar-title h1 {
          max-width: 250px;
          margin: 4px 0 0;
          overflow: hidden;
          color: #15251f;
          font-size: clamp(18px, 1.65vw, 24px);
          font-weight: 820;
          letter-spacing: -0.035em;
          line-height: 1.05;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-actions {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .topbar-search {
          min-width: 180px;
          width: clamp(210px, 29vw, 390px);
          height: 46px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          border: 1px solid #dce6e1;
          border-radius: 15px;
          background: #f8fbf9;
          color: #7a8b84;
        }

        .topbar-search:focus-within {
          border-color: rgba(17, 128, 92, 0.42);
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(17, 128, 92, 0.075);
        }

        .topbar-search input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #20322b;
          font: inherit;
          font-size: 12px;
        }

        .topbar-search input::placeholder {
          color: #98a59f;
        }

        .topbar-search kbd {
          flex: 0 0 auto;
          padding: 3px 6px;
          border: 1px solid #dce5e1;
          border-bottom-width: 2px;
          border-radius: 7px;
          background: #ffffff;
          color: #809089;
          font-family: inherit;
          font-size: 9px;
          line-height: 1;
        }

        .topbar-house-wrapper {
          position: relative;
          min-width: 0;
          flex: 0 1 250px;
        }

        .topbar-house-switch {
          width: 100%;
          max-width: 250px;
          height: 48px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          padding: 6px 10px;
          border: 1px solid #dce6e1;
          border-radius: 15px;
          background: #ffffff;
          color: #24352e;
          text-align: left;
          box-shadow: 0 4px 14px rgba(27, 61, 49, 0.045);
        }

        .topbar-house-switch:hover,
        .topbar-house-switch.is-open {
          border-color: rgba(15, 128, 91, 0.32);
          box-shadow: 0 9px 24px rgba(24, 76, 57, 0.09);
        }

        .topbar-house-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: #edf7f3;
          color: #08795b;
        }

        .topbar-house-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .topbar-house-copy small,
        .topbar-house-copy strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-house-copy small {
          color: #819087;
          font-size: 8px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .topbar-house-copy strong {
          color: #20312a;
          font-size: 11px;
          font-weight: 790;
        }

        .topbar-house-chevron,
        .profile-chevron {
          width: 16px;
          height: 16px;
          color: #87968f;
          transition: transform 180ms ease;
        }

        .topbar-house-switch.is-open .topbar-house-chevron {
          transform: rotate(180deg);
        }

        .topbar-house-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          z-index: 280;
          width: min(320px, calc(100vw - 24px));
          padding: 8px;
          border: 1px solid #dbe6e1;
          border-radius: 19px;
          background: rgba(255, 255, 255, 0.985);
          box-shadow:
            0 26px 70px rgba(21, 56, 43, 0.19),
            0 4px 12px rgba(21, 56, 43, 0.06);
          backdrop-filter: blur(20px);
        }

        .topbar-house-menu-label {
          padding: 8px 10px 7px;
          color: #16805f;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .topbar-house-menu-current {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 11px;
          padding: 12px;
          border: 1px solid #dcebe4;
          border-radius: 14px;
          background: linear-gradient(145deg, #eff9f5, #f8fcfa);
        }

        .topbar-house-menu-current-icon {
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #ffffff;
          color: #08795b;
        }

        .topbar-house-menu-current > div {
          min-width: 0;
        }

        .topbar-house-menu-current span,
        .topbar-house-menu-current strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-house-menu-current span {
          color: #7b8c84;
          font-size: 9px;
        }

        .topbar-house-menu-current strong {
          margin-top: 3px;
          color: #1f3029;
          font-size: 12px;
        }

        .topbar-house-menu-current > svg {
          color: #10805f;
        }

        .topbar-house-menu-action {
          width: 100%;
          min-height: 52px;
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 6px;
          padding: 9px 11px;
          border: 0;
          border-radius: 13px;
          background: transparent;
          color: #34483f;
          text-align: left;
        }

        .topbar-house-menu-action:hover {
          background: #edf7f3;
          color: #08775a;
        }

        .topbar-house-menu-action > span {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .topbar-house-menu-action strong,
        .topbar-house-menu-action small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-house-menu-action strong {
          font-size: 11px;
        }

        .topbar-house-menu-action small {
          color: #899790;
          font-size: 9px;
        }

        .topbar-icon-button {
          position: relative;
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid #dce6e1;
          border-radius: 14px;
          background: #ffffff;
          color: #5e7068;
        }

        .topbar-icon-button:hover {
          background: #f1f8f5;
          color: #08775a;
        }

        .notification-badge {
          position: absolute;
          top: -5px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          padding: 0 4px;
          border: 2px solid #ffffff;
          border-radius: 999px;
          background: #e54858;
          color: #ffffff;
          font-size: 8px;
          font-weight: 850;
        }

        .profile-button {
          width: clamp(150px, 14.5vw, 218px);
          height: 48px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          padding: 5px 9px 5px 6px;
          border: 1px solid #dce6e1;
          border-radius: 15px;
          background: #ffffff;
          color: #263830;
          text-align: left;
        }

        .profile-avatar {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: linear-gradient(145deg, #1b9873, #08795c);
          color: #ffffff;
          font-size: 10px;
          font-weight: 900;
        }

        .profile-details {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .profile-details strong,
        .profile-details small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-details strong {
          color: #21312b;
          font-size: 11px;
        }

        .profile-details small {
          color: #87958e;
          font-size: 8px;
        }

        .mobile-menu-button {
          width: 42px;
          height: 42px;
          display: none;
          place-items: center;
          border: 1px solid #dce6e1;
          border-radius: 13px;
          background: #ffffff;
          color: #52665d;
        }

        .profile-menu-wrapper {
          position: relative;
          flex: 0 0 auto;
        }

        .profile-button.is-open {
          border-color: rgba(21, 128, 94, 0.34);
          background: #ffffff;
          box-shadow: 0 10px 26px rgba(20, 47, 38, 0.1);
        }

        .profile-button.is-open .profile-chevron {
          transform: rotate(180deg);
        }

        .profile-chevron {
          transition: transform 180ms ease;
        }

        .profile-menu {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          z-index: 260;
          width: min(330px, calc(100vw - 28px));
          overflow: hidden;
          border: 1px solid #dce6e1;
          border-radius: 21px;
          background: rgba(255, 255, 255, 0.985);
          box-shadow:
            0 24px 70px rgba(19, 51, 40, 0.2),
            0 3px 10px rgba(19, 51, 40, 0.06);
          backdrop-filter: blur(20px);
        }

        .profile-menu-head {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background:
            radial-gradient(circle at 90% 0%, rgba(22, 142, 102, 0.12), transparent 35%),
            linear-gradient(145deg, #eff9f5, #fbfdfc);
          border-bottom: 1px solid #e1e9e5;
        }

        .profile-menu-avatar {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(145deg, #1b9873, #08795c);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          box-shadow: 0 9px 18px rgba(9, 117, 87, 0.2);
        }

        .profile-menu-copy {
          min-width: 0;
        }

        .profile-menu-copy strong,
        .profile-menu-copy span,
        .profile-menu-copy small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-menu-copy strong {
          color: #21312b;
          font-size: 14px;
        }

        .profile-menu-copy span {
          margin-top: 3px;
          color: #687b73;
          font-size: 10px;
        }

        .profile-menu-copy small {
          margin-top: 5px;
          color: #16805f;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .profile-menu-section {
          padding: 8px;
        }

        .profile-menu-section + .profile-menu-section {
          border-top: 1px solid #e6ede9;
        }

        .profile-menu-item {
          width: 100%;
          min-height: 50px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 8px 10px;
          border: 0;
          border-radius: 13px;
          background: transparent;
          color: #2a3b34;
          text-align: left;
          transition:
            color 180ms ease,
            background 180ms ease;
        }

        .profile-menu-item:hover {
          background: #eef8f4;
          color: #08765a;
        }

        .profile-menu-item.danger {
          color: #b93c49;
        }

        .profile-menu-item.danger:hover {
          background: #fff0f2;
          color: #aa2938;
        }

        .profile-menu-item > svg {
          width: 18px;
          height: 18px;
          flex: 0 0 auto;
        }

        .profile-menu-item > span {
          min-width: 0;
          flex: 1;
          display: grid;
          gap: 2px;
        }

        .profile-menu-item strong {
          font-size: 12px;
        }

        .profile-menu-item small {
          color: #89958f;
          font-size: 9px;
          line-height: 1.35;
        }

        .profile-menu-item .menu-item-arrow {
          width: 15px;
          height: 15px;
          color: #91a09a;
          transform: rotate(-90deg);
        }

        .global-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(7, 24, 20, 0.58);
          backdrop-filter: blur(6px);
        }

        .global-dialog {
          width: min(560px, 100%);
          max-height: min(760px, calc(100vh - 36px));
          overflow: auto;
          border: 1px solid rgba(220, 230, 225, 0.95);
          border-radius: 25px;
          background: #ffffff;
          box-shadow: 0 30px 90px rgba(5, 30, 22, 0.3);
        }

        .global-dialog-head {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 22px 24px;
          border-bottom: 1px solid #e4ebe7;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(16px);
        }

        .global-dialog-head-copy {
          min-width: 0;
        }

        .global-dialog-head-copy span {
          color: #16805f;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .global-dialog-head-copy h2 {
          margin: 6px 0 0;
          color: #1e2e28;
          font-size: 21px;
          letter-spacing: -0.03em;
        }

        .global-dialog-close {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid #e0e8e4;
          border-radius: 13px;
          background: #f7faf8;
          color: #5e6f68;
        }

        .global-dialog-close:hover {
          background: #edf6f2;
          color: #08775a;
        }

        .global-dialog-body {
          padding: 24px;
        }

        .global-account-summary {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
          padding: 15px;
          border: 1px solid #e2ebe6;
          border-radius: 17px;
          background: linear-gradient(145deg, #f1faf6, #fbfdfc);
        }

        .global-account-summary-avatar {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(145deg, #1b9873, #08795c);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
        }

        .global-account-summary strong,
        .global-account-summary span {
          display: block;
        }

        .global-account-summary strong {
          font-size: 13px;
        }

        .global-account-summary span {
          margin-top: 4px;
          color: #7b8b84;
          font-size: 10px;
        }

        .global-form {
          display: grid;
          gap: 17px;
        }

        .global-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .global-form-field {
          display: grid;
          gap: 7px;
        }

        .global-form-field label {
          color: #2a3934;
          font-size: 11px;
          font-weight: 750;
        }

        .global-form-field input {
          width: 100%;
          height: 46px;
          padding: 0 13px;
          border: 1px solid #d8e3de;
          border-radius: 13px;
          background: #ffffff;
          color: #25342e;
          font-size: 13px;
          outline: 0;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .global-form-field input:focus {
          border-color: rgba(18, 128, 92, 0.48);
          box-shadow: 0 0 0 4px rgba(18, 128, 92, 0.08);
        }

        .global-form-help {
          margin: -7px 0 0;
          color: #82918b;
          font-size: 9px;
          line-height: 1.5;
        }

        .global-message {
          padding: 11px 12px;
          border-radius: 12px;
          font-size: 10px;
          line-height: 1.5;
        }

        .global-message.success {
          border: 1px solid #cce9db;
          background: #edf9f3;
          color: #176b4e;
        }

        .global-message.error {
          border: 1px solid #f1cfd4;
          background: #fff1f3;
          color: #a52f3d;
        }

        .global-dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 4px;
          padding-top: 19px;
          border-top: 1px solid #e5ece8;
        }

        .global-button {
          min-height: 43px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border: 1px solid transparent;
          border-radius: 13px;
          font-size: 12px;
          font-weight: 750;
        }

        .global-button.secondary {
          border-color: #d9e3de;
          background: #ffffff;
          color: #4f6259;
        }

        .global-button.primary {
          border-color: #147456;
          background: linear-gradient(145deg, #1b8d69, #126c50);
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(18, 108, 80, 0.18);
        }

        @media (max-width: 1220px) {
          .topbar {
            gap: 14px;
            padding-inline: 18px;
          }

          .topbar-title h1 {
            max-width: 190px;
          }

          .topbar-search {
            width: clamp(180px, 22vw, 280px);
          }

          .topbar-house-wrapper {
            flex-basis: 210px;
          }

          .topbar-house-switch {
            max-width: 210px;
          }

          .profile-button {
            width: 152px;
          }
        }

        @media (max-width: 1040px) {
          .topbar-page-mark,
          .topbar-eyebrow,
          .topbar-search kbd {
            display: none;
          }

          .topbar-title h1 {
            max-width: 150px;
            margin-top: 0;
            font-size: 18px;
          }

          .topbar-search {
            min-width: 44px;
            width: min(230px, 23vw);
          }

          .topbar-house-wrapper {
            flex-basis: 190px;
          }

          .topbar-house-switch {
            max-width: 190px;
          }

          .profile-button {
            width: 48px;
            grid-template-columns: 1fr;
            padding: 5px;
          }

          .profile-details,
          .profile-button > .profile-chevron {
            display: none;
          }

          .profile-avatar {
            margin: auto;
          }
        }

        @media (max-width: 820px) {
          .topbar {
            min-height: 68px;
            grid-template-columns: auto minmax(0, 1fr);
            padding: 9px 12px;
          }

          .mobile-menu-button {
            display: grid;
          }

          .topbar-page-identity {
            display: none;
          }

          .topbar-actions {
            gap: 7px;
          }

          .topbar-search {
            width: min(250px, 38vw);
            height: 44px;
          }

          .topbar-house-wrapper {
            flex: 0 1 190px;
          }

          .topbar-house-switch {
            max-width: 190px;
            height: 44px;
          }

          .topbar-house-icon {
            width: 31px;
            height: 31px;
          }

          .topbar-icon-button,
          .profile-button {
            width: 44px;
            height: 44px;
          }
        }

        @media (max-width: 680px) {
          .topbar {
            display: flex;
            align-items: center;
          }

          .topbar-actions {
            min-width: 0;
            flex: 1;
          }

          .topbar-search {
            min-width: 0;
            flex: 1 1 auto;
            width: auto;
          }

          .topbar-house-wrapper {
            flex: 0 0 auto;
          }

          .topbar-house-switch {
            width: 44px;
            padding: 5px;
            grid-template-columns: 1fr;
          }

          .topbar-house-copy,
          .topbar-house-switch > .topbar-house-chevron {
            display: none;
          }

          .topbar-house-icon {
            margin: auto;
          }

          .topbar-house-menu {
            position: fixed;
            top: 66px;
            right: 10px;
            left: 10px;
            width: auto;
          }

          .profile-menu {
            position: fixed;
            top: 68px;
            right: 10px;
            left: 10px;
            width: auto;
          }

          .global-dialog-backdrop {
            align-items: end;
            padding: 0;
          }

          .global-dialog {
            width: 100%;
            max-height: 92vh;
            border-radius: 24px 24px 0 0;
          }

          .global-form-row {
            grid-template-columns: 1fr;
          }

          .global-dialog-actions {
            flex-direction: column-reverse;
          }

          .global-button {
            width: 100%;
          }
        }

        @media (max-width: 430px) {
          .topbar {
            gap: 7px;
            padding-inline: 9px;
          }

          .topbar-search {
            width: 44px;
            flex: 0 0 44px;
            justify-content: center;
            padding: 0;
          }

          .topbar-search input,
          .topbar-search kbd {
            display: none;
          }
        }
      `}</style>

      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Otevřít menu"
            onClick={onMobileMenuOpen}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-page-identity">
            <span className="topbar-page-mark">
              <Building2 size={18} />
            </span>

            <div className="topbar-title">
              <span className="topbar-eyebrow">Správa domů</span>
              <h1>{title}</h1>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <label className="topbar-search">
            <Search size={18} />

            <input
              type="search"
              placeholder="Hledat v aplikaci…"
              aria-label="Hledat v aplikaci"
            />

            <kbd>Ctrl K</kbd>
          </label>

          <div className="topbar-house-wrapper" ref={houseMenuRef}>
            <button
              type="button"
              className={`topbar-house-switch ${
                houseMenuOpen ? "is-open" : ""
              }`}
              onClick={() => {
                setHouseMenuOpen((current) => !current);
                setProfileMenuOpen(false);
              }}
              aria-expanded={houseMenuOpen}
              aria-haspopup="menu"
            >
              <span className="topbar-house-icon">
                <Building2 size={17} />
              </span>

              <span className="topbar-house-copy">
                <small>Vybraný dům</small>
                <strong>{houseName}</strong>
              </span>

              <ChevronDown className="topbar-house-chevron" />
            </button>

            {houseMenuOpen && (
              <div className="topbar-house-menu" role="menu">
                <div className="topbar-house-menu-label">
                  Přepnutí domu
                </div>

                <div className="topbar-house-menu-current">
                  <span className="topbar-house-menu-current-icon">
                    <Building2 size={18} />
                  </span>

                  <div>
                    <span>Aktuálně otevřený dům</span>
                    <strong>{houseName}</strong>
                  </div>

                  <Check size={17} />
                </div>

                <button
                  type="button"
                  className="topbar-house-menu-action"
                  onClick={handleChangeHouse}
                  role="menuitem"
                >
                  <Building2 size={17} />

                  <span>
                    <strong>Vybrat jiný dům</strong>
                    <small>Vrátit se do Správy domů</small>
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="topbar-icon-button"
            aria-label="Otevřít notifikace"
          >
            <Bell size={19} />
            <span className="notification-badge">0</span>
          </button>

          <div className="profile-menu-wrapper" ref={profileMenuRef}>
            <button
              type="button"
              className={`profile-button ${
                profileMenuOpen ? "is-open" : ""
              }`}
              aria-label={`Otevřít profil uživatele ${userDisplay.name}`}
              title={userDisplay.name}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setProfileMenuOpen((current) => !current);
                setHouseMenuOpen(false);
              }}
            >
              <span className="profile-avatar">
                {profileLoading ? "…" : userDisplay.initials}
              </span>

              <span className="profile-details">
                <strong>
                  {profileLoading
                    ? "Načítám uživatele…"
                    : userDisplay.name}
                </strong>
                <small>
                  {profileLoading
                    ? "Ověřuji profil"
                    : userDisplay.role}
                </small>
              </span>

              <ChevronDown className="profile-chevron" />
            </button>

            {profileMenuOpen && (
              <div className="profile-menu" role="menu">
                <div className="profile-menu-head">
                  <span className="profile-menu-avatar">
                    {profileLoading ? "…" : userDisplay.initials}
                  </span>

                  <div className="profile-menu-copy">
                    <strong>{userDisplay.name}</strong>
                    <span>{userDisplay.email || "E-mail není dostupný"}</span>
                    <small>{userDisplay.role}</small>
                  </div>
                </div>

                <div className="profile-menu-section">
                  <button
                    type="button"
                    className="profile-menu-item"
                    onClick={openProfileDialog}
                    role="menuitem"
                  >
                    <UserRound />
                    <span>
                      <strong>Můj profil</strong>
                      <small>Jméno, uživatelské jméno a e-mail</small>
                    </span>
                    <ChevronDown className="menu-item-arrow" />
                  </button>

                  <button
                    type="button"
                    className="profile-menu-item"
                    onClick={openPasswordDialog}
                    role="menuitem"
                  >
                    <KeyRound />
                    <span>
                      <strong>Změnit heslo</strong>
                      <small>Zabezpečení přihlášení k účtu</small>
                    </span>
                    <ChevronDown className="menu-item-arrow" />
                  </button>

                  <button
                    type="button"
                    className="profile-menu-item"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      window.alert(
                        "Globální nastavení aplikace zde můžeme postupně rozšiřovat."
                      );
                    }}
                    role="menuitem"
                  >
                    <Settings />
                    <span>
                      <strong>Nastavení aplikace</strong>
                      <small>Společná nastavení pro celý systém</small>
                    </span>
                    <ChevronDown className="menu-item-arrow" />
                  </button>
                </div>

                <div className="profile-menu-section">
                  <div className="profile-menu-item">
                    <ShieldCheck />
                    <span>
                      <strong>Stav účtu</strong>
                      <small>
                        {currentProfile?.active === false
                          ? "Účet je neaktivní"
                          : "Účet je aktivní a přihlášený"}
                      </small>
                    </span>
                  </div>
                </div>

                <div className="profile-menu-section">
                  <button
                    type="button"
                    className="profile-menu-item danger"
                    onClick={handleSignOut}
                    role="menuitem"
                  >
                    <LogOut />
                    <span>
                      <strong>Odhlásit se</strong>
                      <small>Bezpečně ukončit aktuální relaci</small>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {profileDialogOpen && (
        <div
          className="global-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfileDialogOpen(false);
            }
          }}
        >
          <section
            className="global-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-dialog-title"
          >
            <div className="global-dialog-head">
              <div className="global-dialog-head-copy">
                <span>Účet uživatele</span>
                <h2 id="profile-dialog-title">Můj profil</h2>
              </div>

              <button
                type="button"
                className="global-dialog-close"
                aria-label="Zavřít profil"
                onClick={() => setProfileDialogOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="global-dialog-body">
              <div className="global-account-summary">
                <span className="global-account-summary-avatar">
                  {userDisplay.initials}
                </span>

                <div>
                  <strong>{userDisplay.name}</strong>
                  <span>
                    {userDisplay.role} · {userDisplay.email}
                  </span>
                </div>
              </div>

              <form className="global-form" onSubmit={handleSaveProfile}>
                <div className="global-form-row">
                  <div className="global-form-field">
                    <label htmlFor="profile-full-name">Celé jméno</label>
                    <input
                      id="profile-full-name"
                      type="text"
                      value={profileForm.full_name}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          full_name: event.target.value,
                        }))
                      }
                      autoComplete="name"
                    />
                  </div>

                  <div className="global-form-field">
                    <label htmlFor="profile-username">
                      Uživatelské jméno
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      value={profileForm.username}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="global-form-field">
                  <label htmlFor="profile-email">E-mail</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    autoComplete="email"
                  />
                </div>

                <p className="global-form-help">
                  Změna e-mailu může podle nastavení Supabase vyžadovat
                  potvrzení na původní nebo nové adrese.
                </p>

                {message && (
                  <div className={`global-message ${message.type}`}>
                    {message.text}
                  </div>
                )}

                <div className="global-dialog-actions">
                  <button
                    type="button"
                    className="global-button secondary"
                    onClick={() => setProfileDialogOpen(false)}
                  >
                    Zrušit
                  </button>

                  <button
                    type="submit"
                    className="global-button primary"
                    disabled={profileSaving}
                  >
                    <Save size={17} />
                    {profileSaving ? "Ukládám…" : "Uložit profil"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {passwordDialogOpen && (
        <div
          className="global-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPasswordDialogOpen(false);
            }
          }}
        >
          <section
            className="global-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-dialog-title"
          >
            <div className="global-dialog-head">
              <div className="global-dialog-head-copy">
                <span>Zabezpečení účtu</span>
                <h2 id="password-dialog-title">Změna hesla</h2>
              </div>

              <button
                type="button"
                className="global-dialog-close"
                aria-label="Zavřít změnu hesla"
                onClick={() => setPasswordDialogOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="global-dialog-body">
              <form className="global-form" onSubmit={handleChangePassword}>
                <div className="global-form-field">
                  <label htmlFor="new-password">Nové heslo</label>
                  <input
                    id="new-password"
                    type="password"
                    value={passwordForm.password}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>

                <div className="global-form-field">
                  <label htmlFor="new-password-confirm">
                    Nové heslo znovu
                  </label>
                  <input
                    id="new-password-confirm"
                    type="password"
                    value={passwordForm.passwordConfirm}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        passwordConfirm: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>

                <p className="global-form-help">
                  Heslo musí mít alespoň 8 znaků. Po změně zůstane uživatel
                  přihlášený v aktuální relaci.
                </p>

                {message && (
                  <div className={`global-message ${message.type}`}>
                    {message.text}
                  </div>
                )}

                <div className="global-dialog-actions">
                  <button
                    type="button"
                    className="global-button secondary"
                    onClick={() => setPasswordDialogOpen(false)}
                  >
                    Zrušit
                  </button>

                  <button
                    type="submit"
                    className="global-button primary"
                    disabled={passwordSaving}
                  >
                    <KeyRound size={17} />
                    {passwordSaving ? "Měním heslo…" : "Změnit heslo"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
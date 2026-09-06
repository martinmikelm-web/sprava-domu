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
        /* =========================================================
           SPRÁVA DOMŮ – FINÁLNÍ HLAVIČKA
           ========================================================= */

        .topbar {
          position: sticky;
          top: 0;
          z-index: 220;
          width: 100%;
          min-height: 96px;
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0 20px;
          border-bottom: 1px solid #dce8e2;
          background: rgba(255,255,255,.97);
          box-shadow: 0 1px 0 rgba(17,58,47,.03);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          overflow: visible;
        }

        .topbar-section {
          position: relative;
          min-width: 0;
          display: flex;
          align-items: center;
        }

        .topbar-section + .topbar-section {
          margin-left: 14px;
          padding-left: 14px;
        }

        .topbar-section + .topbar-section::before {
          content: "";
          position: absolute;
          left: 0;
          top: 16px;
          bottom: 16px;
          width: 1px;
          background: #e3ebe7;
        }

        .topbar-brand-section {
          flex: 0 1 405px;
          gap: 12px;
        }

        .topbar-search-section {
          flex: 1 1 520px;
          min-width: 280px;
        }

        .topbar-house-section {
          flex: 0 0 350px;
        }

        .topbar-bell-section {
          flex: 0 0 66px;
        }

        .topbar-profile-section {
          flex: 0 0 285px;
        }

        .mobile-menu-button {
          box-sizing: border-box;
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          display: grid;
          place-items: center;
          border: 1px solid #dce7e2;
          border-radius: 15px;
          background: #ffffff;
          color: #52665d;
          box-shadow: 0 3px 12px rgba(17,58,47,.035);
        }

        .mobile-menu-button:hover {
          border-color: #bdd8cc;
          color: #147b5d;
        }

        .topbar-page-identity {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .topbar-page-mark {
          box-sizing: border-box;
          width: 58px;
          height: 58px;
          flex: 0 0 58px;
          display: grid;
          place-items: center;
          border: 1px solid #d7e7df;
          border-radius: 18px;
          background: linear-gradient(145deg,#f7fbf9,#e8f4ee);
          color: #147b5d;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.85);
        }

        .topbar-title {
          min-width: 0;
        }

        .topbar-eyebrow {
          display: block;
          margin: 0 0 6px;
          overflow: hidden;
          color: #147b5d;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .16em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .topbar-title h1 {
          max-width: 260px;
          margin: 0;
          overflow: hidden;
          color: #15231e;
          font-size: 25px;
          font-weight: 850;
          line-height: 1.05;
          letter-spacing: -.035em;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-search {
          width: 100%;
          min-width: 0;
          height: 56px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 15px 0 18px;
          border: 1px solid #dce7e2;
          border-radius: 18px;
          background: #fbfcfb;
          color: #71827b;
          box-shadow: 0 3px 14px rgba(17,58,47,.025);
          transition:
            border-color 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease;
        }

        .topbar-search:focus-within {
          border-color: #97c7b5;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(24,116,86,.07);
        }

        .topbar-search input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #20312b;
          font: inherit;
          font-size: 14px;
        }

        .topbar-search input::placeholder {
          color: #a0ada7;
        }

        .topbar-search kbd {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 5px 8px;
          border: 1px solid #dce6e1;
          border-bottom-width: 2px;
          border-radius: 8px;
          background: #fff;
          color: #7f8f89;
          font-family: inherit;
          font-size: 10px;
          line-height: 1;
        }

        .topbar-house-wrapper,
        .profile-menu-wrapper {
          position: relative;
          width: 100%;
          min-width: 0;
        }

        .topbar-house-switch {
          width: 100%;
          height: 58px;
          display: grid;
          grid-template-columns: 48px minmax(0,1fr) 18px;
          align-items: center;
          gap: 12px;
          padding: 5px 12px 5px 7px;
          border: 1px solid #dce7e2;
          border-radius: 19px;
          background: #fff;
          color: #22332c;
          text-align: left;
          box-shadow: 0 4px 16px rgba(17,58,47,.035);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .topbar-house-switch:hover,
        .topbar-house-switch.is-open,
        .profile-button:hover,
        .profile-button.is-open,
        .topbar-icon-button:hover {
          border-color: #bdd8cc;
          box-shadow: 0 8px 24px rgba(17,58,47,.075);
          transform: translateY(-1px);
        }

        .topbar-house-icon {
          box-sizing: border-box;
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: #e8f5ef;
          color: #16775a;
        }

        .topbar-house-copy {
          min-width: 0;
          display: block;
        }

        .topbar-house-copy small {
          display: block;
          margin: 0 0 4px;
          overflow: hidden;
          color: #778981;
          font-size: 9px;
          font-weight: 850;
          line-height: 1;
          letter-spacing: .12em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .topbar-house-copy strong {
          display: block;
          min-width: 0;
          overflow: hidden;
          color: #1f3029;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-house-chevron,
        .profile-chevron {
          width: 16px;
          height: 16px;
          color: #889791;
          transition: transform 180ms ease;
        }

        .topbar-house-switch.is-open .topbar-house-chevron,
        .profile-button.is-open .profile-chevron {
          transform: rotate(180deg);
        }

        .topbar-icon-button {
          position: relative;
          box-sizing: border-box;
          width: 56px;
          height: 56px;
          flex: 0 0 56px;
          display: grid;
          place-items: center;
          border: 1px solid #dce7e2;
          border-radius: 18px;
          background: #fff;
          color: #43564e;
          box-shadow: 0 4px 16px rgba(17,58,47,.03);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }


        .mobile-menu-button > svg,
        .topbar-page-mark > svg,
        .topbar-house-icon > svg,
        .topbar-icon-button > svg {
          display: block;
          margin: 0;
          flex: 0 0 auto;
          position: static;
          transform: none;
        }

        .mobile-menu-button,
        .topbar-page-mark,
        .topbar-house-icon,
        .topbar-icon-button {
          line-height: 0;
          text-align: center;
        }

        .profile-avatar {
          line-height: 1;
          text-align: center;
        }

        .notification-badge {
          position: absolute;
          top: -6px;
          right: -5px;
          min-width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          padding: 0 4px;
          border: 2px solid #fff;
          border-radius: 999px;
          background: #ef4755;
          color: #fff;
          font-size: 8px;
          font-weight: 900;
        }

        .profile-button {
          width: 100%;
          height: 58px;
          display: grid;
          grid-template-columns: 48px minmax(0,1fr) 18px;
          align-items: center;
          gap: 12px;
          padding: 5px 12px 5px 7px;
          border: 1px solid #dce7e2;
          border-radius: 19px;
          background: #fff;
          color: #23342d;
          text-align: left;
          box-shadow: 0 4px 16px rgba(17,58,47,.03);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .profile-avatar {
          box-sizing: border-box;
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(145deg,#238362,#0e684e);
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .02em;
        }

        .profile-details {
          min-width: 0;
          display: block;
        }

        .profile-details strong {
          display: block;
          min-width: 0;
          overflow: hidden;
          color: #1d2e27;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-details small {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: #7f8f88;
          font-size: 9px;
          font-weight: 750;
          line-height: 1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .topbar-house-menu,
        .profile-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          z-index: 280;
          width: min(330px,calc(100vw - 24px));
          overflow: hidden;
          border: 1px solid #dbe6e1;
          border-radius: 20px;
          background: rgba(255,255,255,.985);
          box-shadow:
            0 26px 70px rgba(21,56,43,.19),
            0 4px 12px rgba(21,56,43,.06);
          backdrop-filter: blur(20px);
        }

        .topbar-house-menu {
          padding: 8px;
        }

        .topbar-house-menu-label {
          padding: 8px 10px 7px;
          color: #16805f;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .topbar-house-menu-current {
          display: grid;
          grid-template-columns: 38px minmax(0,1fr) auto;
          align-items: center;
          gap: 11px;
          padding: 12px;
          border: 1px solid #dcebe4;
          border-radius: 14px;
          background: linear-gradient(145deg,#eff9f5,#f8fcfa);
        }

        .topbar-house-menu-current-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #fff;
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

        .profile-menu-head {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background:
            radial-gradient(circle at 90% 0%,rgba(22,142,102,.12),transparent 35%),
            linear-gradient(145deg,#eff9f5,#fbfdfc);
          border-bottom: 1px solid #e1e9e5;
        }

        .profile-menu-avatar {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(145deg,#1b9873,#08795c);
          color: #fff;
          font-size: 12px;
          font-weight: 900;
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
          letter-spacing: .06em;
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

        /* Dialogy profilu a hesla */
        .global-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(7,24,20,.58);
          backdrop-filter: blur(6px);
        }

        .global-dialog {
          width: min(560px,100%);
          max-height: min(760px,calc(100vh - 36px));
          overflow: auto;
          border: 1px solid rgba(220,230,225,.95);
          border-radius: 25px;
          background: #fff;
          box-shadow: 0 30px 90px rgba(5,30,22,.3);
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
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(16px);
        }

        .global-dialog-head-copy span {
          color: #16805f;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .global-dialog-head-copy h2 {
          margin: 6px 0 0;
          color: #1e2e28;
          font-size: 21px;
          letter-spacing: -.03em;
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
          background: linear-gradient(145deg,#f1faf6,#fbfdfc);
        }

        .global-account-summary-avatar {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(145deg,#1b9873,#08795c);
          color: #fff;
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
          background: #fff;
          color: #25342e;
          font-size: 13px;
          outline: 0;
        }

        .global-form-field input:focus {
          border-color: rgba(18,128,92,.48);
          box-shadow: 0 0 0 4px rgba(18,128,92,.08);
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
          background: #fff;
          color: #4f6259;
        }

        .global-button.primary {
          border-color: #147456;
          background: linear-gradient(145deg,#1b8d69,#126c50);
          color: #fff;
        }

        /* Škálování bez překrývání */
        @media (max-width: 1700px) {
          .topbar-brand-section { flex-basis: 340px; }
          .topbar-house-section { flex-basis: 300px; }
          .topbar-profile-section { flex-basis: 245px; }

          .topbar-page-mark {
            width: 50px;
            height: 50px;
            flex-basis: 50px;
          }

          .topbar-title h1 {
            max-width: 220px;
            font-size: 22px;
          }
        }

        @media (max-width: 1450px) {
          .topbar {
            padding-inline: 14px;
          }

          .topbar-section + .topbar-section {
            margin-left: 10px;
            padding-left: 10px;
          }

          .topbar-search-section {
            flex-basis: 360px;
            min-width: 220px;
          }

          .topbar-brand-section {
            flex-basis: 290px;
          }

          .topbar-house-section {
            flex-basis: 250px;
          }

          .topbar-profile-section {
            flex-basis: 210px;
          }

          .topbar-title h1 {
            max-width: 175px;
            font-size: 20px;
          }

          .topbar-eyebrow {
            font-size: 8px;
          }
        }

        @media (max-width: 1180px) {
          .topbar-search-section {
            display: none;
          }

          .topbar-brand-section {
            flex: 1 1 auto;
          }

          .topbar-house-section {
            flex-basis: 240px;
          }

          .topbar-profile-section {
            flex-basis: 190px;
          }
        }

        @media (max-width: 900px) {
          .topbar {
            min-height: 76px;
          }

          .topbar-title {
            display: none;
          }

          .topbar-page-mark {
            width: 48px;
            height: 48px;
            flex-basis: 48px;
          }

          .topbar-brand-section {
            flex: 0 0 auto;
          }

          .topbar-house-section {
            flex: 1 1 auto;
            min-width: 180px;
          }

          .topbar-profile-section {
            flex: 0 0 58px;
          }

          .profile-button {
            width: 58px;
            grid-template-columns: 48px;
            justify-content: center;
            padding: 5px;
          }

          .profile-details,
          .profile-button > .profile-chevron {
            display: none;
          }

          .topbar-section + .topbar-section::before {
            top: 12px;
            bottom: 12px;
          }
        }

        @media (max-width: 640px) {
          .topbar {
            min-height: 70px;
            padding-inline: 9px;
          }

          .topbar-section + .topbar-section {
            margin-left: 7px;
            padding-left: 7px;
          }

          .topbar-page-mark {
            display: none;
          }

          .mobile-menu-button {
            width: 44px;
            height: 44px;
            flex-basis: 44px;
          }

          .topbar-house-section {
            min-width: 0;
          }

          .topbar-house-switch {
            height: 50px;
            grid-template-columns: 40px minmax(0,1fr) 16px;
            gap: 8px;
            padding: 5px 8px 5px 5px;
          }

          .topbar-house-icon {
            width: 40px;
            height: 40px;
          }

          .topbar-house-copy small {
            display: none;
          }

          .topbar-house-copy strong {
            font-size: 11px;
          }

          .topbar-bell-section {
            flex-basis: 52px;
          }

          .topbar-icon-button {
            width: 48px;
            height: 48px;
            flex-basis: 48px;
          }

          .profile-button {
            width: 50px;
            height: 50px;
          }

          .profile-avatar {
            width: 40px;
            height: 40px;
          }

          .topbar-house-menu,
          .profile-menu {
            position: fixed;
            top: 76px;
            right: 8px;
            left: 8px;
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
      `}</style>

      <header className="topbar">
        <div className="topbar-section topbar-brand-section">
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
              <Building2 size={21} />
            </span>

            <div className="topbar-title">
              <span className="topbar-eyebrow">Správa domů</span>
              <h1>{title}</h1>
            </div>
          </div>
        </div>

        <div className="topbar-section topbar-search-section">
          <label className="topbar-search">
            <Search size={19} />
            <input
              type="search"
              placeholder="Hledat v aplikaci…"
              aria-label="Hledat v aplikaci"
            />
            <kbd>⌘ K</kbd>
          </label>
        </div>

        <div className="topbar-section topbar-house-section">
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
                <Building2 size={19} />
              </span>

              <span className="topbar-house-copy">
                <small>Vybraný dům</small>
                <strong title={houseName}>{houseName}</strong>
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
                    <strong title={houseName}>{houseName}</strong>
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
        </div>

        <div className="topbar-section topbar-bell-section">
          <button
            type="button"
            className="topbar-icon-button"
            aria-label="Otevřít notifikace"
          >
            <Bell size={20} />
            <span className="notification-badge">0</span>
          </button>
        </div>

        <div className="topbar-section topbar-profile-section">
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
                <strong title={userDisplay.name}>
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
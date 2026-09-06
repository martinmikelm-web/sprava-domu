import React, { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  House,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { clearApplicationSession } from "../lib/appSession";

export default function Sidebar({
  menuItems,
  activePageKey,
  onPageChange,
  mobileMenuOpen,
  onMobileMenuClose,
  collapsed,
  onCollapsedChange,
}) {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [permissionNotice, setPermissionNotice] = useState(null);

  function getPermissionSummary(item) {
    const permission = item?.permission || {};

    if (item?.locked) {
      return {
        title: `${item.title}: přístup zamčen`,
        text:
          "Tento modul vidíte v menu, ale nemáte oprávnění jej otevřít. " +
          "O přístup může rozhodnout správce domu.",
        allowed: false,
      };
    }

    const actions = [];

    if (permission.can_view) actions.push("zobrazit");
    if (permission.can_create) actions.push("vytvářet");
    if (permission.can_edit) actions.push("upravovat");
    if (permission.can_delete) actions.push("mazat");
    if (permission.can_manage) actions.push("spravovat");

    return {
      title: `${item.title}: přístup povolen`,
      text: actions.length
        ? `Můžete: ${actions.join(", ")}.`
        : "Modul můžete otevřít.",
      allowed: true,
    };
  }

  function showPermissionNotice(item) {
    const notice = getPermissionSummary(item);
    setPermissionNotice(notice);
  }

  useEffect(() => {
    function handleExternalPermissionNotice(event) {
      const pageKey = event?.detail?.pageKey;
      const item = menuItems.find((menuItem) => menuItem.key === pageKey);

      if (item) {
        showPermissionNotice(item);
      }
    }

    window.addEventListener(
      "menu-permission-notice",
      handleExternalPermissionNotice
    );

    return () => {
      window.removeEventListener(
        "menu-permission-notice",
        handleExternalPermissionNotice
      );
    };
  }, [menuItems]);

  useEffect(() => {
    if (!permissionNotice) return undefined;

    const timer = window.setTimeout(() => {
      setPermissionNotice(null);
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [permissionNotice]);

  function handleMenuItemClick(item) {
    showPermissionNotice(item);

    if (item.locked) {
      return;
    }

    onPageChange(item.key);
  }

  async function handleLogout() {
    if (logoutLoading) return;

    setLogoutLoading(true);
    setLogoutError("");

    try {
      clearApplicationSession();

      const { error } = await supabase.auth.signOut({
        scope: "local",
      });

      if (error) {
        throw error;
      }

      onMobileMenuClose?.();
    } catch (error) {
      console.error("Chyba při odhlášení:", error);

      setLogoutError(
        error?.message || "Odhlášení se nezdařilo. Zkus to znovu."
      );
    } finally {
      setLogoutLoading(false);
    }
  }

  return (
    <aside
      className={[
        "sidebar",
        mobileMenuOpen ? "sidebar-mobile-open" : "",
        collapsed ? "sidebar-is-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <House />
        </div>

        {!collapsed && (
          <div className="sidebar-brand-text">
            <strong>Správa domů</strong>
            <span>Správa nemovitostí</span>
          </div>
        )}

        <button
          type="button"
          className="sidebar-mobile-close"
          aria-label="Zavřít menu"
          onClick={onMobileMenuClose}
        >
          <X />
        </button>
      </div>

      <div className="sidebar-house">
        <div className="sidebar-house-icon">
          <House />
        </div>

        {!collapsed && (
          <div>
            <span>Aktuální dům</span>
            <strong>Není vybrán</strong>
          </div>
        )}
      </div>

      <nav className="sidebar-navigation">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activePageKey;
          const isLocked = Boolean(item.locked);

          return (
            <button
              type="button"
              key={item.key}
              className={[
                "sidebar-menu-item",
                isActive ? "active" : "",
                isLocked ? "sidebar-menu-item-locked" : "sidebar-menu-item-unlocked",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleMenuItemClick(item)}
              title={
                collapsed
                  ? `${item.title} – ${
                      isLocked ? "zamčeno" : "odemčeno"
                    }`
                  : undefined
              }
              aria-disabled={isLocked ? "true" : "false"}
            >
              <Icon />

              {!collapsed && (
                <span className="sidebar-menu-label">
                  {item.title}
                </span>
              )}

              <span
                className={[
                  "sidebar-access-lock",
                  isLocked ? "locked" : "unlocked",
                ].join(" ")}
                aria-label={isLocked ? "Zamčeno" : "Odemčeno"}
                title={
                  isLocked
                    ? "Nemáte oprávnění modul otevřít"
                    : "Máte oprávnění modul otevřít"
                }
              >
                {isLocked ? (
                  <LockKeyhole />
                ) : (
                  <LockKeyholeOpen />
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {permissionNotice && !collapsed && (
        <div
          className={[
            "sidebar-permission-notice",
            permissionNotice.allowed ? "allowed" : "denied",
          ].join(" ")}
          role="status"
        >
          <div className="sidebar-permission-notice-icon">
            <ShieldCheck />
          </div>

          <div>
            <strong>{permissionNotice.title}</strong>
            <span>{permissionNotice.text}</span>
          </div>

          <button
            type="button"
            onClick={() => setPermissionNotice(null)}
            aria-label="Zavřít oznámení oprávnění"
          >
            <X />
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        {logoutError && !collapsed && (
          <p
            role="alert"
            style={{
              margin: "0 0 10px",
              padding: "10px 12px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.12)",
              color: "#fca5a5",
              fontSize: "12px",
              lineHeight: "1.4",
            }}
          >
            {logoutError}
          </p>
        )}

        <button
          type="button"
          className="sidebar-menu-item sidebar-logout"
          title={collapsed ? "Odhlásit se" : undefined}
          onClick={handleLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? (
            <LoaderCircle
              style={{
                animation: "sidebar-logout-spin 0.8s linear infinite",
              }}
            />
          ) : (
            <LogOut />
          )}

          {!collapsed && (
            <span>
              {logoutLoading ? "Odhlašuji…" : "Odhlásit se"}
            </span>
          )}
        </button>

        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Rozbalit menu" : "Sbalit menu"}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
          {!collapsed && <span>Sbalit menu</span>}
        </button>
      </div>

      <style>{`
        @keyframes sidebar-logout-spin {
          to {
            transform: rotate(360deg);
          }
        }

        .sidebar-logout:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .sidebar-menu-item {
          position: relative;
        }

        .sidebar-menu-label {
          min-width: 0;
          flex: 1;
          text-align: left;
        }

        .sidebar-access-lock {
          width: 24px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 24px;
          border-radius: 8px;
          transition:
            background 160ms ease,
            color 160ms ease,
            opacity 160ms ease;
        }

        .sidebar-access-lock svg {
          width: 13px;
          height: 13px;
        }

        .sidebar-access-lock.unlocked {
          background: rgba(34, 197, 94, 0.12);
          color: #86efac;
        }

        .sidebar-access-lock.locked {
          background: rgba(245, 158, 11, 0.13);
          color: #fbbf24;
        }

        .sidebar-menu-item-locked {
          opacity: 0.72;
          cursor: pointer;
        }

        .sidebar-menu-item-locked:hover {
          opacity: 1;
        }

        .sidebar-is-collapsed .sidebar-access-lock {
          position: absolute;
          right: 2px;
          bottom: 2px;
          width: 17px;
          height: 17px;
          border-radius: 6px;
        }

        .sidebar-is-collapsed .sidebar-access-lock svg {
          width: 10px;
          height: 10px;
        }

        .sidebar-permission-notice {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: start;
          gap: 9px;
          margin: 0 0 10px;
          padding: 10px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.92);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        }

        .sidebar-permission-notice.allowed {
          border-color: rgba(34, 197, 94, 0.3);
        }

        .sidebar-permission-notice.denied {
          border-color: rgba(245, 158, 11, 0.32);
        }

        .sidebar-permission-notice-icon {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.06);
        }

        .sidebar-permission-notice-icon svg {
          width: 15px;
          height: 15px;
        }

        .sidebar-permission-notice strong,
        .sidebar-permission-notice span {
          display: block;
        }

        .sidebar-permission-notice strong {
          color: #f8fafc;
          font-size: 11px;
          line-height: 1.35;
        }

        .sidebar-permission-notice span {
          margin-top: 3px;
          color: #aebdca;
          font-size: 10px;
          line-height: 1.45;
        }

        .sidebar-permission-notice > button {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
        }

        .sidebar-permission-notice > button:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .sidebar-permission-notice > button svg {
          width: 13px;
          height: 13px;
        }
      `}</style>
    </aside>
  );
}
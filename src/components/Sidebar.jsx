import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  House,
  LoaderCircle,
  LogOut,
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
  selectedHouse,
}) {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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
            <strong>{selectedHouse?.name || "Není vybrán"}</strong>
          </div>
        )}
      </div>

      <nav className="sidebar-navigation">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activePageKey;

          return (
            <button
              type="button"
              key={item.key}
              className={`sidebar-menu-item ${isActive ? "active" : ""}`}
              onClick={() => onPageChange(item.key)}
              title={collapsed ? item.title : undefined}
            >
              <Icon />
              {!collapsed && <span>{item.title}</span>}
            </button>
          );
        })}
      </nav>

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
      `}</style>
    </aside>
  );
}
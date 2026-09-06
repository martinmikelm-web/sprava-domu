import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function AppShell({
  menuItems,
  activePageKey,
  activePageTitle,
  onPageChange,
  selectedHouse,
  selectedHouseId,
  onChangeHouse,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handlePageChange(pageKey) {
    onPageChange(pageKey);
    setMobileMenuOpen(false);
  }

  return (
    <div
      className={`app-shell shell-layout ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <Sidebar
        menuItems={menuItems}
        activePageKey={activePageKey}
        onPageChange={handlePageChange}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-sidebar-overlay"
          aria-label="Zavřít menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="app-main shell-main">
        <Header
          title={activePageTitle}
          selectedHouse={selectedHouse}
          selectedHouseId={selectedHouseId}
          onChangeHouse={onChangeHouse}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
        />

        <div className="app-content-stage shell-content-stage">
          <div className="page-content">{children}</div>
        </div>
      </main>
    </div>
  );
}

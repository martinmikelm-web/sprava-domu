import React, { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./layouts/AppShell";
import DeveloperSandboxPanel from "./components/DeveloperSandboxPanel";
import Login from "./pages/Login";
import Houses from "./pages/Houses";
import { MENU_ITEMS } from "./config/menu";
import {
  clearDeveloperPreviewData,
  isDataAccessResolved,
  realSupabase,
  resetDataAccessMode,
  setDeveloperPreviewMode,
  supabase,
} from "./lib/supabase";
import {
  clearApplicationSession,
  hasActiveTabSession,
  isLoginRemembered,
  markTabSessionActive,
  readApplicationState,
  saveApplicationState,
  SELECTED_HOUSE_STORAGE_KEY,
} from "./lib/appSession";
import {
  createPermissionMap,
  hasPermission,
  isAdministratorRole,
  isDeveloperRole,
  normalizeRoles,
  loadApplicationPermissions,
} from "./lib/permissions";

const HOUSES_PAGE_KEY = "houses";
const DEFAULT_HOUSE_PAGE_KEY = "dashboard";
const HOUSE_SETTINGS_PAGE_KEY = "house-settings";
const SANDBOX_SELECTED_HOUSE_KEY =
  "developer_sandbox_selected_house_id";
const PERMISSION_MODULE_KEYS = Array.from(
  new Set(["houses", ...MENU_ITEMS.map((item) => item.key)])
);

function getFirstVisibleHouseModule(permissionMap) {
  return (
    MENU_ITEMS.find(
      (item) =>
        item.key !== HOUSES_PAGE_KEY &&
        hasPermission(permissionMap[item.key], "view")
    ) || null
  );
}

function getInitialState() {
  if (typeof window === "undefined") {
    return {
      activePageKey: HOUSES_PAGE_KEY,
      selectedHouseId: "",
      scrollPositions: {},
    };
  }

  return readApplicationState();
}

export default function App() {
  const initialStateRef = useRef(getInitialState());

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activePageKey, setActivePageKey] = useState(
    initialStateRef.current.activePageKey || HOUSES_PAGE_KEY
  );

  const [selectedHouseId, setSelectedHouseId] = useState(
    initialStateRef.current.selectedHouseId || ""
  );

  const [selectedHouse, setSelectedHouse] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [dataModeReady, setDataModeReady] = useState(
    () => isDataAccessResolved()
  );
  const [resolvingInitialHouse, setResolvingInitialHouse] = useState(false);
  const [applicationPermissions, setApplicationPermissions] = useState(
    () => createPermissionMap(PERMISSION_MODULE_KEYS)
  );
  const permissionsLoadIdRef = useRef(0);
  const currentAuthUserIdRef = useRef(null);
  const authBootstrapFinishedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    function resetLocalApplicationState() {
      resetDataAccessMode();
      setDataModeReady(false);
      clearDeveloperPreviewData({ preserveIdentity: false });

      window.sessionStorage.removeItem(
        SANDBOX_SELECTED_HOUSE_KEY
      );

      clearApplicationSession();
      setCurrentProfile(null);
      setApplicationPermissions(
        createPermissionMap(PERMISSION_MODULE_KEYS)
      );
      setSelectedHouseId("");
      setSelectedHouse(null);
      setActivePageKey(HOUSES_PAGE_KEY);
    }

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;
        if (!mounted) return;

        const currentSession = data?.session || null;

        /*
         * Supabase relace je nově uložená pouze v sessionStorage.
         * Po zavření záložky ji prohlížeč automaticky odstraní.
         * Po běžném obnovení stejné záložky zůstane přihlášení aktivní.
         */
        if (!currentSession) {
          resetLocalApplicationState();
          setSession(null);
          setPermissionsLoading(false);
          return;
        }

        markTabSessionActive();

        const restoredState = readApplicationState();

        currentAuthUserIdRef.current =
          currentSession.user?.id || null;

        setSelectedHouseId(restoredState.selectedHouseId || "");
        setActivePageKey(
          restoredState.activePageKey || HOUSES_PAGE_KEY
        );
        setSession(currentSession);
      } catch (error) {
        console.error("Nepodařilo se načíst přihlášení:", error);

        if (mounted) {
          resetLocalApplicationState();
          setSession(null);
          setPermissionsLoading(false);
        }
      } finally {
        authBootstrapFinishedRef.current = true;

        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      const nextUserId = newSession?.user?.id || null;
      const previousUserId = currentAuthUserIdRef.current;

      setSession(newSession || null);
      setAuthLoading(false);

      /*
       * Supabase může událost SIGNED_IN poslat také při návratu do
       * záložky, obnovení tokenu nebo opětovném zaostření okna.
       * Navigaci resetujeme pouze při skutečně novém přihlášení:
       * předtím nebyl přihlášen žádný uživatel nebo se změnil účet.
       */
      const isRealNewLogin =
        event === "SIGNED_IN" &&
        Boolean(newSession) &&
        authBootstrapFinishedRef.current &&
        (!previousUserId || previousUserId !== nextUserId);

      if (isRealNewLogin) {
        clearApplicationSession();
        markTabSessionActive();

        currentAuthUserIdRef.current = nextUserId;
        setSelectedHouseId("");
        setSelectedHouse(null);
        setActivePageKey(HOUSES_PAGE_KEY);
        return;
      }

      if (newSession) {
        currentAuthUserIdRef.current = nextUserId;
        markTabSessionActive();
        return;
      }

      if (!newSession || event === "SIGNED_OUT") {
        currentAuthUserIdRef.current = null;
        resetLocalApplicationState();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadPermissions() {
      const loadId = ++permissionsLoadIdRef.current;
      const isCurrentLoad = () =>
        mounted && permissionsLoadIdRef.current === loadId;

      if (!session?.user?.id) {
        if (isCurrentLoad()) {
          setCurrentProfile(null);
          setApplicationPermissions(
            createPermissionMap(PERMISSION_MODULE_KEYS)
          );
          setPermissionsLoading(false);
        }
        return;
      }

      setPermissionsLoading(true);
      setDataModeReady(false);
      resetDataAccessMode();

      const loadingTimeout = window.setTimeout(() => {
        if (!isCurrentLoad()) return;

        console.error(
          "Načítání profilu a oprávnění trvalo příliš dlouho."
        );
        setPermissionsLoading(false);
      }, 10000);

      try {
        /*
         * Vlastní profil se načítá z reálného klienta pouze kvůli
         * rozpoznání role. Teprve potom bezpečně přepneme datovou vrstvu.
         * Developer tak nikdy neprovede běžný aplikační SELECT nad
         * produkčními tabulkami.
         */
        const { data: profile, error: profileError } =
          await realSupabase
            .from("profiles")
            .select("id, active, role, profile_roles(role_key)")
            .eq("id", session.user.id)
            .single();

        if (profileError) throw profileError;
        if (!isCurrentLoad()) return;

        // profiles.role je jediný autoritativní zdroj produkční role.
        // profile_roles může obsahovat staré historické řádky a nesmí
        // proto uživateli omylem udělit administrátorský přístup.
        const currentRoles = normalizeRoles(
          profile?.role
            ? [profile.role]
            : profile?.profile_roles
        );
        const developerSandbox =
          isDeveloperRole(currentRoles);

        setDeveloperPreviewMode(developerSandbox, {
          user: session.user,
          profile,
          roles: currentRoles,
        });

        /*
         * Produkční výběr domu se nikdy nesmí přenést do sandboxu.
         * Programátor má vlastní ID domu pouze v sessionStorage.
         */
        if (developerSandbox) {
          window.sessionStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);

          const sandboxHouseId =
            window.sessionStorage.getItem(
              SANDBOX_SELECTED_HOUSE_KEY
            ) || "";

          setSelectedHouseId(sandboxHouseId);
          setSelectedHouse(null);

          if (!sandboxHouseId) {
            setActivePageKey(HOUSES_PAGE_KEY);
          }
        }

        let nextPermissions;

        if (developerSandbox) {
          nextPermissions = createPermissionMap(
            PERMISSION_MODULE_KEYS
          );

          for (const moduleKey of PERMISSION_MODULE_KEYS) {
            nextPermissions[moduleKey] = {
              can_view: true,
              can_create: true,
              can_edit: true,
              can_delete: true,
              can_manage: true,
            };
          }
        } else {
          nextPermissions = await loadApplicationPermissions({
            userId: session.user.id,
            roles: currentRoles,
            houseId: selectedHouseId || null,
            moduleKeys: PERMISSION_MODULE_KEYS,
          });
        }

        if (!isCurrentLoad()) return;

        setCurrentProfile({
          ...profile,
          roles: currentRoles,
        });
        setApplicationPermissions(nextPermissions);
        setDataModeReady(true);
      } catch (error) {
        console.error("Načtení oprávnění aplikace selhalo:", error);

        if (isCurrentLoad()) {
          resetDataAccessMode();
          setDataModeReady(false);
          setApplicationPermissions(
            createPermissionMap(PERMISSION_MODULE_KEYS)
          );
        }
      } finally {
        window.clearTimeout(loadingTimeout);
        if (isCurrentLoad()) setPermissionsLoading(false);
      }
    }

    loadPermissions();

    function handlePermissionsChanged() {
      loadPermissions();
    }

    window.addEventListener(
      "application-permissions-changed",
      handlePermissionsChanged
    );

    return () => {
      mounted = false;
      permissionsLoadIdRef.current += 1;

      window.removeEventListener(
        "application-permissions-changed",
        handlePermissionsChanged
      );
    };
  }, [session?.user?.id, selectedHouseId]);

  useEffect(() => {
    const currentUserId = session?.user?.id || null;

    if (!currentUserId || !dataModeReady) {
      return undefined;
    }

    const permissionsChannel = supabase
      .channel(`app-permissions-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_permissions",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          window.dispatchEvent(
            new CustomEvent("application-permissions-changed")
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(permissionsChannel);
    };
  }, [session?.user?.id, dataModeReady]);

  /*
   * Uživatel nemusí mít přístup ke globálnímu modulu Správa domů,
   * ale stále může mít přístup k jednomu nebo více konkrétním domům.
   *
   * Pokud ještě není vybraný žádný dům, načteme první dům, který mu
   * Supabase přes RLS dovolí vidět. Díky tomu se dostane rovnou do
   * prvního povoleného modulu domu a nezůstane na stránce bez přístupu.
   */
  useEffect(() => {
    let mounted = true;

    async function resolveInitialHouse() {
      if (!session?.user?.id || !dataModeReady) {
        if (mounted) setResolvingInitialHouse(false);
        return;
      }

      if (permissionsLoading) {
        return;
      }

      if (
        selectedHouseId ||
        isDeveloperRole(currentProfile?.roles)
      ) {
        if (mounted) setResolvingInitialHouse(false);
        return;
      }

      const housesPermission =
        applicationPermissions[HOUSES_PAGE_KEY];

      if (hasPermission(housesPermission, "view")) {
        if (mounted) setResolvingInitialHouse(false);
        return;
      }

      setResolvingInitialHouse(true);

      try {
        const { data, error } = await supabase
          .from("houses")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!mounted) return;

        if (data?.id) {
          window.sessionStorage.setItem(
            SELECTED_HOUSE_STORAGE_KEY,
            data.id
          );
          setSelectedHouseId(data.id);
          setSelectedHouse(data);
        }
      } catch (error) {
        console.error(
          "Automatický výběr dostupného domu selhal:",
          error
        );
      } finally {
        if (mounted) {
          setResolvingInitialHouse(false);
        }
      }
    }

    resolveInitialHouse();

    return () => {
      mounted = false;
    };
  }, [
    session?.user?.id,
    dataModeReady,
    selectedHouseId,
    permissionsLoading,
    applicationPermissions,
    currentProfile?.roles,
  ]);

  /*
   * Po obnovení stránky známe uložené ID domu, ale ne celý objekt domu.
   * Načteme jej kvůli názvu domu v hlavičce.
   */
  useEffect(() => {
    let mounted = true;

    async function loadSelectedHouse() {
      if (
        !session ||
        !dataModeReady ||
        permissionsLoading ||
        !currentProfile ||
        !selectedHouseId
      ) {
        if (mounted) setSelectedHouse(null);
        return;
      }

      if (selectedHouse?.id === selectedHouseId) return;

      const { data, error } = await supabase
        .from("houses")
        .select("*")
        .eq("id", selectedHouseId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Vybraný dům se nepodařilo načíst:", error);
        setSelectedHouse(null);
        return;
      }

      setSelectedHouse(data || null);
    }

    loadSelectedHouse();

    return () => {
      mounted = false;
    };
  }, [
    session,
    dataModeReady,
    permissionsLoading,
    currentProfile,
    selectedHouseId,
    selectedHouse?.id,
  ]);

  /*
   * Uložení základního pracovního stavu celé aplikace.
   * Přepnutí záložky nebo minimalizace tento stav nemaže.
   */
  useEffect(() => {
    if (!session || !dataModeReady) return;

    saveApplicationState({
      activePageKey,
      selectedHouseId,
    });
  }, [
    session,
    dataModeReady,
    currentProfile?.roles,
    activePageKey,
    selectedHouseId,
  ]);

  useEffect(() => {
    function handleSelectedHouseChanged(event) {
      const houseId = event?.detail?.houseId || "";
      const house = event?.detail?.house || null;

      setSelectedHouseId(houseId);
      setSelectedHouse(house);

      if (houseId) {
        const dashboardPermission =
          applicationPermissions[DEFAULT_HOUSE_PAGE_KEY];

        if (
          isDeveloperRole(currentProfile?.roles) ||
          hasPermission(dashboardPermission, "view")
        ) {
          setActivePageKey(DEFAULT_HOUSE_PAGE_KEY);
        }
      }

      const developerMode = isDeveloperRole(
        currentProfile?.roles
      );

      if (houseId) {
        if (developerMode) {
          window.sessionStorage.setItem(
            SANDBOX_SELECTED_HOUSE_KEY,
            houseId
          );
        } else {
          window.sessionStorage.setItem(
            SELECTED_HOUSE_STORAGE_KEY,
            houseId
          );
        }
      } else {
        if (developerMode) {
          window.sessionStorage.removeItem(
            SANDBOX_SELECTED_HOUSE_KEY
          );
        } else {
          window.sessionStorage.removeItem(
            SELECTED_HOUSE_STORAGE_KEY
          );
        }
        setActivePageKey(HOUSES_PAGE_KEY);
      }
    }

    function handleNavigationRequest(event) {
      const requestedPageKey = event?.detail?.pageKey;
      const requestedHouseId = event?.detail?.houseId;
      const requestedHouse = event?.detail?.house || null;

      if (requestedHouseId) {
        if (isDeveloperRole(currentProfile?.roles)) {
          window.sessionStorage.setItem(
            SANDBOX_SELECTED_HOUSE_KEY,
            requestedHouseId
          );
        } else {
          window.sessionStorage.setItem(
            SELECTED_HOUSE_STORAGE_KEY,
            requestedHouseId
          );
        }

        setSelectedHouseId(requestedHouseId);

        if (requestedHouse) {
          setSelectedHouse(requestedHouse);
        }
      }

      if (requestedPageKey) {
        handlePageChange(requestedPageKey);
      } else if (requestedHouseId) {
        setActivePageKey(DEFAULT_HOUSE_PAGE_KEY);
      }
    }

    window.addEventListener(
      "selected-house-changed",
      handleSelectedHouseChanged
    );

    window.addEventListener(
      "app-navigation-request",
      handleNavigationRequest
    );

    return () => {
      window.removeEventListener(
        "selected-house-changed",
        handleSelectedHouseChanged
      );

      window.removeEventListener(
        "app-navigation-request",
        handleNavigationRequest
      );
    };
  }, [
    selectedHouseId,
    activePageKey,
    currentProfile?.roles,
    applicationPermissions,
  ]);

  const isDeveloperPreview = useMemo(
    () => isDeveloperRole(currentProfile?.roles),
    [currentProfile?.roles]
  );

  // Systémový správce je bezpečnostní administrátor a může oprávnění
  // přidělovat i v případě, že zatím neexistuje žádný řádek v app_permissions.
  // Ostatní produkční role jsou řízené výhradně explicitními oprávněními.
  const isAdministrator = useMemo(
    () => isAdministratorRole(currentProfile?.roles),
    [currentProfile?.roles]
  );

  const visibleMenuItems = useMemo(() => {
    // V produkci rozhodují vždy pouze explicitní oprávnění.
    // Plný automatický přístup má jen izolovaný Developer Sandbox.
    if (isDeveloperPreview) return MENU_ITEMS;

    return MENU_ITEMS.filter((item) =>
      hasPermission(applicationPermissions[item.key], "view")
    );
  }, [applicationPermissions, isDeveloperPreview]);

  const activeMenuItem = useMemo(() => {
    return (
      visibleMenuItems.find((item) => item.key === activePageKey) ||
      visibleMenuItems[0] ||
      null
    );
  }, [activePageKey, visibleMenuItems]);

  const ActivePage = activeMenuItem?.component;
  const activePermission =
    applicationPermissions[activePageKey] || null;
  const canRenderActivePage =
    isDeveloperPreview ||
    hasPermission(activePermission, "view");

  /*
   * Správa domů je pouze globální seznam domů.
   * Není podmínkou pro vstup do konkrétního domu.
   *
   * Pokud ji uživatel nemá povolenou, ale má vybraný dům a přístup
   * alespoň k jednomu jeho modulu, automaticky ho přesměrujeme tam.
   */
  useEffect(() => {
    if (
      !session ||
      permissionsLoading ||
      resolvingInitialHouse ||
      activePageKey !== HOUSES_PAGE_KEY
    ) {
      return;
    }

    const housesPermission =
      applicationPermissions[HOUSES_PAGE_KEY];

    if (
      isDeveloperPreview ||
      hasPermission(housesPermission, "view")
    ) {
      return;
    }

    if (!selectedHouseId) {
      return;
    }

    const firstAllowedModule = getFirstVisibleHouseModule(
      applicationPermissions
    );

    if (firstAllowedModule?.key) {
      setActivePageKey(firstAllowedModule.key);
    }
  }, [
    session,
    permissionsLoading,
    resolvingInitialHouse,
    activePageKey,
    selectedHouseId,
    applicationPermissions,
    isAdministrator,
    isDeveloperPreview,
  ]);

  // Po odebrání oprávnění nesmí zůstat aktivní zakázaná stránka.
  useEffect(() => {
    if (permissionsLoading || isDeveloperPreview) return;

    if (activePageKey === HOUSES_PAGE_KEY) {
      if (hasPermission(applicationPermissions[HOUSES_PAGE_KEY], "view")) {
        return;
      }
    } else if (hasPermission(applicationPermissions[activePageKey], "view")) {
      return;
    }

    const fallback = getFirstVisibleHouseModule(applicationPermissions);

    if (selectedHouseId && fallback?.key) {
      setActivePageKey(fallback.key);
      return;
    }

    if (hasPermission(applicationPermissions[HOUSES_PAGE_KEY], "view")) {
      setActivePageKey(HOUSES_PAGE_KEY);
    }
  }, [
    permissionsLoading,
    isAdministrator,
    isDeveloperPreview,
    activePageKey,
    selectedHouseId,
    applicationPermissions,
  ]);

  async function handleLogout() {
    try {
      clearApplicationSession();
      resetDataAccessMode();
      clearDeveloperPreviewData({ preserveIdentity: false });
      window.sessionStorage.removeItem(SANDBOX_SELECTED_HOUSE_KEY);
      window.sessionStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
      window.localStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Odhlášení selhalo:", error);
    } finally {
      currentAuthUserIdRef.current = null;
      setSelectedHouseId("");
      setSelectedHouse(null);
      setCurrentProfile(null);
      setApplicationPermissions(createPermissionMap(PERMISSION_MODULE_KEYS));
      setActivePageKey(HOUSES_PAGE_KEY);
      setDataModeReady(false);
      setSession(null);
    }
  }

  function handlePageChange(pageKey) {
    if (!pageKey || pageKey === activePageKey) return;

    const requestedPermission = applicationPermissions[pageKey];

    if (
      !isDeveloperPreview &&
      !hasPermission(requestedPermission, "view")
    ) {
      return;
    }

    if (pageKey === HOUSES_PAGE_KEY) {
      setActivePageKey(HOUSES_PAGE_KEY);
      return;
    }

    const currentHouseId =
      selectedHouseId ||
      (isDeveloperPreview
        ? window.sessionStorage.getItem(
            SANDBOX_SELECTED_HOUSE_KEY
          )
        : window.sessionStorage.getItem(
            SELECTED_HOUSE_STORAGE_KEY
          )) ||
      "";

    if (!currentHouseId && !isDeveloperPreview) {
      setActivePageKey(HOUSES_PAGE_KEY);
      return;
    }

    setActivePageKey(pageKey);
  }

  function handleHouseSelected(house) {
    if (!house?.id) return;

    if (isDeveloperPreview) {
      window.sessionStorage.setItem(
        SANDBOX_SELECTED_HOUSE_KEY,
        house.id
      );
    } else {
      localStorage.setItem(
        SELECTED_HOUSE_STORAGE_KEY,
        house.id
      );
    }

    setSelectedHouseId(house.id);
    setSelectedHouse(house);
  }

  function handleOpenHouse(house) {
    if (!house?.id) return;

    handleHouseSelected(house);

    const dashboardPermission =
      applicationPermissions[DEFAULT_HOUSE_PAGE_KEY];

    if (
      isDeveloperPreview ||
      hasPermission(dashboardPermission, "view")
    ) {
      setActivePageKey(DEFAULT_HOUSE_PAGE_KEY);
      return;
    }

    const firstAllowedModule = getFirstVisibleHouseModule(
      applicationPermissions
    );

    if (firstAllowedModule?.key) {
      setActivePageKey(firstAllowedModule.key);
    }
  }

  function handleOpenHouseSettings(house) {
    if (!house?.id) return;

    handleHouseSelected(house);
    setActivePageKey(HOUSE_SETTINGS_PAGE_KEY);
  }

  function handleChangeHouse() {
    if (isDeveloperPreview) {
      setActivePageKey(HOUSES_PAGE_KEY);
      return;
    }

    const housesPermission =
      applicationPermissions[HOUSES_PAGE_KEY];

    if (
      isDeveloperPreview ||
      hasPermission(housesPermission, "view")
    ) {
      setActivePageKey(HOUSES_PAGE_KEY);
      return;
    }

    const firstAllowedModule = getFirstVisibleHouseModule(
      applicationPermissions
    );

    if (firstAllowedModule?.key) {
      setActivePageKey(firstAllowedModule.key);
    }
  }

  if (
    authLoading ||
    (session && (!dataModeReady || permissionsLoading)) ||
    (resolvingInitialHouse && !isDeveloperPreview)
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#07111f",
          color: "#f8fafc",
          fontFamily: "inherit",
        }}
      >
        Načítání…
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  /*
   * Správa domů zůstává samostatná stránka mimo AppShell.
   * Právě tento blok v předchozí úpravě chyběl, takže se stránka
   * Správy domů vůbec správně nevykreslila.
   */
  if (activePageKey === HOUSES_PAGE_KEY) {
    const housesPermission = applicationPermissions[HOUSES_PAGE_KEY];

    if (
      !isDeveloperPreview &&
      !hasPermission(housesPermission, "view")
    ) {
      const firstAllowedModule = getFirstVisibleHouseModule(
        applicationPermissions
      );

      if (selectedHouseId && firstAllowedModule?.component) {
        const FallbackPage = firstAllowedModule.component;
        const fallbackPermission =
          applicationPermissions[firstAllowedModule.key] || null;

        return (
          <AppShell
            menuItems={visibleMenuItems}
            activePageKey={firstAllowedModule.key}
            activePageTitle={firstAllowedModule.title || "Přehled"}
            onPageChange={handlePageChange}
            session={session}
            selectedHouse={selectedHouse}
            selectedHouseId={selectedHouseId}
            onChangeHouse={handleChangeHouse}
          >
            <FallbackPage
              session={session}
              selectedHouseId={selectedHouseId}
              selectedHouse={selectedHouse}
              permission={fallbackPermission}
              permissions={applicationPermissions}
              isAdministrator={isAdministrator}
              developerPreview={isDeveloperPreview}
              onPageChange={handlePageChange}
            />
          </AppShell>
        );
      }

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "30px",
            background: "#07111f",
            color: "#f8fafc",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "560px" }}>
            <h1>Nemáte přiřazený dostupný dům</h1>
            <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>
              Správce vám musí přiřadit přístup alespoň k jednomu domu
              a povolit minimálně jeden jeho modul.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                marginTop: "22px",
                minHeight: "44px",
                padding: "0 20px",
                border: "1px solid rgba(248, 113, 113, 0.28)",
                borderRadius: "13px",
                background: "rgba(127, 29, 29, 0.22)",
                color: "#fecaca",
                font: "inherit",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Odhlásit se
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          style={{
            minHeight: "100vh",
            padding: "30px",
            background: "#07111f",
          }}
        >
          <Houses
            session={session}
            permission={housesPermission}
            isAdministrator={isAdministrator}
            developerPreview={isDeveloperPreview}
            onHouseSelected={handleHouseSelected}
            onOpenHouse={handleOpenHouse}
            onOpenHouseSettings={handleOpenHouseSettings}
          />
        </div>

        {isDeveloperPreview && <DeveloperSandboxPanel />}
      </>
    );
  }

  return (
    <>
      <AppShell
        menuItems={visibleMenuItems}
        activePageKey={activePageKey}
        activePageTitle={activeMenuItem?.title || "Přehled"}
        onPageChange={handlePageChange}
        session={session}
        selectedHouse={selectedHouse}
        selectedHouseId={selectedHouseId}
        onChangeHouse={handleChangeHouse}
      >
        {ActivePage && canRenderActivePage ? (
          <ActivePage
            session={session}
            selectedHouseId={selectedHouseId}
            selectedHouse={selectedHouse}
            permission={activePermission}
            permissions={applicationPermissions}
            isAdministrator={isAdministrator}
            developerPreview={isDeveloperPreview}
            onPageChange={handlePageChange}
          />
        ) : (
          <div className="empty-page">
            <h1>Žádná stránka</h1>
            <p>V konfiguraci zatím není žádná položka menu.</p>
          </div>
        )}
      </AppShell>

      {isDeveloperPreview && <DeveloperSandboxPanel />}
    </>
  );
}
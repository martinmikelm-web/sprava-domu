export const REMEMBER_LOGIN_KEY = "sprava_domu_remember_login";
export const TAB_SESSION_KEY = "sprava_domu_tab_session";
export const APP_STATE_KEY = "sprava_domu_app_state";
export const SELECTED_HOUSE_STORAGE_KEY = "selected_house_id";

function clearLegacyPersistentState() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
  window.localStorage.removeItem(APP_STATE_KEY);
  window.localStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
}

/*
 * Přihlášení i pracovní stav smějí existovat pouze po dobu otevřené
 * záložky. Zavřením záložky sessionStorage automaticky zanikne.
 */
export function isLoginRemembered() {
  return false;
}

export function hasActiveTabSession() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(TAB_SESSION_KEY) === "true";
}

export function markTabSessionActive() {
  if (typeof window === "undefined") return;

  clearLegacyPersistentState();
  window.sessionStorage.setItem(TAB_SESSION_KEY, "true");
}

export function configureLoginPersistence() {
  /*
   * Parametr „zapamatovat“ se z bezpečnostních důvodů ignoruje.
   * Aplikace nikdy nepřenáší relaci ani rozepsanou práci do nové záložky.
   */
  markTabSessionActive();
}

export function readApplicationState() {
  if (typeof window === "undefined") {
    return {
      activePageKey: "houses",
      selectedHouseId: "",
      scrollPositions: {},
    };
  }

  clearLegacyPersistentState();

  const rawState = window.sessionStorage.getItem(APP_STATE_KEY);

  if (!rawState) {
    return {
      activePageKey: "houses",
      selectedHouseId:
        window.sessionStorage.getItem(
          SELECTED_HOUSE_STORAGE_KEY
        ) || "",
      scrollPositions: {},
    };
  }

  try {
    const parsed = JSON.parse(rawState);

    return {
      activePageKey: parsed?.activePageKey || "houses",
      selectedHouseId:
        parsed?.selectedHouseId ||
        window.sessionStorage.getItem(
          SELECTED_HOUSE_STORAGE_KEY
        ) ||
        "",
      scrollPositions:
        parsed?.scrollPositions &&
        typeof parsed.scrollPositions === "object"
          ? parsed.scrollPositions
          : {},
    };
  } catch (error) {
    console.error(
      "Nepodařilo se načíst stav aplikace:",
      error
    );

    clearApplicationState();

    return {
      activePageKey: "houses",
      selectedHouseId: "",
      scrollPositions: {},
    };
  }
}

export function saveApplicationState(nextState) {
  if (typeof window === "undefined") return nextState;

  clearLegacyPersistentState();

  const currentState = readApplicationState();

  const mergedState = {
    ...currentState,
    ...nextState,
    scrollPositions: {
      ...(currentState.scrollPositions || {}),
      ...(nextState?.scrollPositions || {}),
    },
  };

  window.sessionStorage.setItem(
    APP_STATE_KEY,
    JSON.stringify(mergedState)
  );

  if (mergedState.selectedHouseId) {
    window.sessionStorage.setItem(
      SELECTED_HOUSE_STORAGE_KEY,
      mergedState.selectedHouseId
    );
  } else {
    window.sessionStorage.removeItem(
      SELECTED_HOUSE_STORAGE_KEY
    );
  }

  return mergedState;
}

export function clearApplicationState() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(APP_STATE_KEY);
  window.sessionStorage.removeItem(APP_STATE_KEY);
  window.localStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
  window.sessionStorage.removeItem(SELECTED_HOUSE_STORAGE_KEY);
}

export function clearLoginPersistence() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
  window.sessionStorage.removeItem(TAB_SESSION_KEY);
}

export function clearApplicationSession() {
  clearApplicationState();
  clearLoginPersistence();
}

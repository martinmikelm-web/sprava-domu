import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Clock3,
  Home,
  Lightbulb,
  Loader2,
  LockOpen,
  RefreshCw,
  Shield,
  ShieldCheck,
  Siren,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const MODE_LABELS = {
  disarmed: "Vypnuto",
  disarm: "Vypnuto",
  off: "Vypnuto",
  arm: "Zabezpečeno",
  armed: "Zabezpečeno",
  away: "Režim Pryč",
  arm_away: "Režim Pryč",
  home: "Režim Doma",
  stay: "Režim Doma",
  arm_home: "Režim Doma",
  sos: "SOS",
  panic: "SOS",
  emergency: "SOS",
};

function getStatusValue(statuses, code, fallback = null) {
  if (!Array.isArray(statuses)) return fallback;

  const item = statuses.find((status) => status?.code === code);
  return item?.value ?? fallback;
}

function formatDateTime(timestamp) {
  if (!timestamp) return "Neuvedeno";

  const milliseconds =
    Number(timestamp) < 10_000_000_000
      ? Number(timestamp) * 1000
      : Number(timestamp);

  const date = new Date(milliseconds);

  if (Number.isNaN(date.getTime())) {
    return "Neuvedeno";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}


function findSupportedMode(supportedModes, candidates) {
  if (!Array.isArray(supportedModes)) return null;

  return (
    candidates.find((candidate) => supportedModes.includes(candidate)) || null
  );
}

async function getEdgeFunctionErrorMessage(error, fallback) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === "function") {
      const clone = response.clone();
      const contentType = clone.headers?.get?.("content-type") || "";

      if (contentType.includes("application/json")) {
        const payload = await clone.json();

        if (payload?.error) {
          return payload?.stage
            ? `${payload.error} (část: ${payload.stage})`
            : payload.error;
        }

        if (payload?.message) {
          return payload.message;
        }
      } else {
        const text = await clone.text();
        if (text?.trim()) return text.trim();
      }
    }
  } catch (parseError) {
    console.warn("Chybu Edge Function se nepodařilo rozbalit:", parseError);
  }

  const message = String(error?.message || "").trim();

  if (
    message === "Edge Function returned a non-2xx status code" ||
    message.includes("non-2xx")
  ) {
    return `${fallback} Edge Function vrátila chybu serveru. Zkontrolujte prosím Supabase Edge Function „tuya-api“ a její Secrets.`;
  }

  return message || fallback;
}
export default function Security({ selectedHouseId }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [changingMode, setChangingMode] = useState("");
  const [device, setDevice] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadSecurity({ silent = false } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        throw new Error("Nejsi přihlášený do aplikace.");
      }

      const { data, error: functionError } =
        await supabase.functions.invoke("tuya-api", {
          body: {
            action: "inspect",
          },
        });

      if (functionError) {
        throw functionError;
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "Nepodařilo se načíst zabezpečení domu."
        );
      }

      setDevice(data.result || null);

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Načtení zabezpečení selhalo:", err);

      setError(
        await getEdgeFunctionErrorMessage(
          err,
          "Nepodařilo se načíst zabezpečení domu."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function changeSecurityMode(mode, label) {
    if (!mode || changingMode) return;

    const confirmed = window.confirm(
      `Opravdu chceš přepnout alarm do režimu „${label}“?`
    );

    if (!confirmed) return;

    setChangingMode(mode);
    setError("");

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke("tuya-api", {
          body: {
            action: "set-mode",
            mode,
          },
        });

      if (functionError) {
        throw functionError;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Alarm příkaz nepřijal.");
      }

      await loadSecurity({ silent: true });
    } catch (err) {
      console.error("Změna režimu alarmu selhala:", err);

      setError(
        await getEdgeFunctionErrorMessage(
          err,
          "Nepodařilo se změnit režim alarmu."
        )
      );
    } finally {
      setChangingMode("");
    }
  }

  useEffect(() => {
    loadSecurity();
  }, [selectedHouseId]);

  const securityState = useMemo(() => {
    const detail = device?.detail || {};
    const statuses = Array.isArray(device?.status)
      ? device.status
      : Array.isArray(detail?.status)
        ? detail.status
        : [];

    const functions = Array.isArray(device?.functions)
      ? device.functions
      : [];

    const masterModeFunction = functions.find(
      (item) => item?.code === "master_mode"
    );

    let supportedModes = [];

    try {
      const parsedValues = JSON.parse(
        masterModeFunction?.values || "{}"
      );

      supportedModes = Array.isArray(parsedValues?.range)
        ? parsedValues.range.map(String)
        : [];
    } catch {
      supportedModes = [];
    }

    const mode = String(
      getStatusValue(statuses, "master_mode", "unknown")
    );
    const online = Boolean(detail?.online);
    const alarmSound = Boolean(
      getStatusValue(statuses, "switch_alarm_sound", false)
    );
    const alarmLight = Boolean(
      getStatusValue(statuses, "switch_alarm_light", false)
    );
    const delay = getStatusValue(statuses, "delay_set", null);
    const alarmTime = getStatusValue(statuses, "alarm_time", null);

    return {
      detail,
      statuses,
      functions,
      supportedModes,
      mode,
      online,
      alarmSound,
      alarmLight,
      delay,
      alarmTime,
      modeLabel: MODE_LABELS[mode] || String(mode || "Neznámý stav"),
    };
  }, [device]);

  const isDisarmed = ["disarmed", "disarm", "off"].includes(
    securityState.mode
  );
  const isAlarmMode = ["sos", "panic", "emergency"].includes(
    securityState.mode
  );

  // Pokud Tuya nevrátí seznam podporovaných režimů, použijeme pro
  // otestování standardní hodnoty tohoto alarmu. Tlačítka tak zůstanou
  // dostupná a případnou nepodporovanou hodnotu odmítne až Edge Function.
  const disarmedCommand =
    findSupportedMode(
      securityState.supportedModes,
      ["disarmed", "disarm", "off"]
    ) || "disarmed";

  const homeCommand =
    findSupportedMode(
      securityState.supportedModes,
      ["home", "stay", "arm_home"]
    ) || "home";

  const awayCommand =
    findSupportedMode(
      securityState.supportedModes,
      ["arm", "away", "armed", "arm_away"]
    ) || "arm";

  const sosCommand =
    findSupportedMode(
      securityState.supportedModes,
      ["sos", "panic", "emergency"]
    ) || "sos";

  if (loading) {
    return (
      <div className="security-page">
        <style>{securityStyles}</style>

        <div className="security-loading">
          <Loader2 size={30} className="security-spin" />
          <strong>Načítám zabezpečení domu…</strong>
          <span>Ověřuji stav alarmu a komunikaci s ústřednou.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="security-page">
      <style>{securityStyles}</style>

      <header className="security-header">
        <div>
          <div className="security-eyebrow">
            <ShieldCheck size={15} />
            Zabezpečení domu
          </div>

          <h1>Centrum zabezpečení</h1>

          <p>
            Aktuální stav zakódování, připojení ústředny a nastavení alarmu.
          </p>
        </div>

        <button
          type="button"
          className="security-refresh"
          onClick={() => loadSecurity({ silent: true })}
          disabled={refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? "security-spin" : ""}
          />
          {refreshing ? "Obnovuji…" : "Obnovit stav"}
        </button>
      </header>

      {error && (
        <div className="security-error">
          <AlertTriangle size={22} />

          <div>
            <strong>Nepodařilo se načíst zabezpečení</strong>
            <span>{error}</span>
          </div>

          <button type="button" onClick={() => loadSecurity()}>
            Zkusit znovu
          </button>
        </div>
      )}

      {!error && (
        <>
          <section
            className={[
              "security-hero",
              isAlarmMode
                ? "is-alarm"
                : isDisarmed
                  ? "is-disarmed"
                  : "is-armed",
            ].join(" ")}
          >
            <div className="security-hero-icon">
              {isAlarmMode ? (
                <Siren size={38} />
              ) : isDisarmed ? (
                <LockOpen size={38} />
              ) : (
                <ShieldCheck size={38} />
              )}
            </div>

            <div className="security-hero-content">
              <span className="security-hero-label">
                Aktuální stav domu
              </span>

              <h2>{securityState.modeLabel}</h2>

              <p>
                {isAlarmMode
                  ? "Alarm hlásí nouzový nebo poplachový stav."
                  : isDisarmed
                    ? "Alarm je vypnutý a dům momentálně není střežen."
                    : "Alarm je aktivní a dům je zabezpečen."}
              </p>
            </div>

            <div className="security-connection">
              {securityState.online ? (
                <>
                  <Wifi size={18} />
                  <span>Ústředna online</span>
                </>
              ) : (
                <>
                  <WifiOff size={18} />
                  <span>Ústředna offline</span>
                </>
              )}
            </div>
          </section>

          <section className="security-section">
            <div className="security-section-heading">
              <div>
                <span>Ovládání alarmu</span>
                <h2>Režim zabezpečení</h2>
              </div>

              <small>
                {securityState.supportedModes.length
                  ? `Dostupné režimy: ${securityState.supportedModes.join(", ")}`
                  : "Ústředna používá podporované výchozí režimy"}
              </small>
            </div>

            <div className="security-modes">
              <button
                type="button"
                className={
                  isDisarmed
                    ? "security-mode is-active"
                    : "security-mode"
                }
                disabled={Boolean(changingMode)}
                onClick={() =>
                  changeSecurityMode(disarmedCommand, "Vypnuto")
                }
              >
                {changingMode === disarmedCommand ? (
                  <Loader2 size={21} className="security-spin" />
                ) : (
                  <LockOpen size={21} />
                )}

                <span>Vypnuto</span>

                <small>
                  {changingMode === disarmedCommand
                    ? "Vypínám alarm…"
                    : "Bez střežení"}
                </small>
              </button>

              <button
                type="button"
                className={
                  ["home", "stay", "arm_home"].includes(
                    securityState.mode
                  )
                    ? "security-mode is-active"
                    : "security-mode"
                }
                disabled={Boolean(changingMode)}
                onClick={() => changeSecurityMode(homeCommand, "Doma")}
              >
                {changingMode === homeCommand ? (
                  <Loader2 size={21} className="security-spin" />
                ) : (
                  <Home size={21} />
                )}

                <span>Doma</span>

                <small>
                  {changingMode === homeCommand
                    ? "Aktivuji režim Doma…"
                    : "Částečné střežení"}
                </small>
              </button>

              <button
                type="button"
                className={
                  ["away", "arm", "armed", "arm_away"].includes(
                    securityState.mode
                  )
                    ? "security-mode is-active"
                    : "security-mode"
                }
                disabled={Boolean(changingMode)}
                onClick={() => changeSecurityMode(awayCommand, "Pryč")}
              >
                {changingMode === awayCommand ? (
                  <Loader2 size={21} className="security-spin" />
                ) : (
                  <Shield size={21} />
                )}

                <span>Pryč</span>

                <small>
                  {changingMode === awayCommand
                    ? "Aktivuji režim Pryč…"
                    : "Plné střežení"}
                </small>
              </button>

              <button
                type="button"
                className={
                  isAlarmMode
                    ? "security-mode security-mode-danger is-active"
                    : "security-mode security-mode-danger"
                }
                disabled={Boolean(changingMode)}
                onClick={() => changeSecurityMode(sosCommand, "SOS")}
              >
                {changingMode === sosCommand ? (
                  <Loader2 size={21} className="security-spin" />
                ) : (
                  <BellRing size={21} />
                )}

                <span>SOS</span>

                <small>
                  {changingMode === sosCommand
                    ? "Spouštím SOS…"
                    : "Nouzový poplach"}
                </small>
              </button>
            </div>
          </section>

          <section className="security-grid">
            <article className="security-card">
              <div className="security-card-icon">
                <ShieldCheck size={21} />
              </div>

              <div>
                <span>Ústředna</span>
                <strong>
                  {securityState.detail?.name || "EVOLVEO SecuPro 2"}
                </strong>
                <small>
                  {securityState.online ? "Připojena" : "Nedostupná"}
                </small>
              </div>
            </article>

            <article className="security-card">
              <div className="security-card-icon">
                <Volume2 size={21} />
              </div>

              <div>
                <span>Zvuk alarmu</span>
                <strong>
                  {securityState.alarmSound ? "Zapnutý" : "Vypnutý"}
                </strong>
                <small>Siréna ústředny</small>
              </div>
            </article>

            <article className="security-card">
              <div className="security-card-icon">
                <Lightbulb size={21} />
              </div>

              <div>
                <span>Světelný alarm</span>
                <strong>
                  {securityState.alarmLight ? "Zapnutý" : "Vypnutý"}
                </strong>
                <small>Signalizace ústředny</small>
              </div>
            </article>

            <article className="security-card">
              <div className="security-card-icon">
                <Clock3 size={21} />
              </div>

              <div>
                <span>Zpoždění aktivace</span>
                <strong>
                  {securityState.delay !== null
                    ? `${securityState.delay} s`
                    : "Neuvedeno"}
                </strong>
                <small>Čas pro opuštění domu</small>
              </div>
            </article>

            <article className="security-card">
              <div className="security-card-icon">
                <Siren size={21} />
              </div>

              <div>
                <span>Délka poplachu</span>
                <strong>
                  {securityState.alarmTime !== null
                    ? `${securityState.alarmTime} min`
                    : "Neuvedeno"}
                </strong>
                <small>Nastavená doba sirény</small>
              </div>
            </article>

            <article className="security-card">
              <div className="security-card-icon">
                <Wifi size={21} />
              </div>

              <div>
                <span>Poslední kontrola</span>
                <strong>
                  {lastUpdated
                    ? lastUpdated.toLocaleTimeString("cs-CZ", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "Neuvedeno"}
                </strong>
                <small>Aktuální komunikace s cloudem</small>
              </div>
            </article>
          </section>

          <section className="security-info-grid">
            <article className="security-panel">
              <div className="security-panel-heading">
                <div>
                  <span>Informace o zabezpečení</span>
                  <h2>Stav ústředny a zakódování</h2>
                </div>
              </div>

              <div className="security-info-list">
                <div className="security-info-row">
                  <span>Aktuální režim</span>
                  <strong>{securityState.modeLabel}</strong>
                </div>

                <div className="security-info-row">
                  <span>Stav připojení</span>
                  <strong>{securityState.online ? "Online" : "Offline"}</strong>
                </div>

                <div className="security-info-row">
                  <span>Zvuková signalizace</span>
                  <strong>{securityState.alarmSound ? "Zapnutá" : "Vypnutá"}</strong>
                </div>

                <div className="security-info-row">
                  <span>Světelná signalizace</span>
                  <strong>{securityState.alarmLight ? "Zapnutá" : "Vypnutá"}</strong>
                </div>

                <div className="security-info-row">
                  <span>Zpoždění aktivace</span>
                  <strong>
                    {securityState.delay !== null
                      ? `${securityState.delay} sekund`
                      : "Neuvedeno"}
                  </strong>
                </div>

                <div className="security-info-row">
                  <span>Délka poplachu</span>
                  <strong>
                    {securityState.alarmTime !== null
                      ? `${securityState.alarmTime} minut`
                      : "Neuvedeno"}
                  </strong>
                </div>
              </div>
            </article>

            <article className="security-panel">
              <div className="security-panel-heading">
                <div>
                  <span>Aktuální informace</span>
                  <h2>Komunikace se systémem</h2>
                </div>
              </div>

              <div className="security-timeline">
                <div className="security-event">
                  <div className="security-event-dot" />
                  <div>
                    <strong>Stav alarmu načten</strong>
                    <span>
                      {lastUpdated
                        ? formatDateTime(lastUpdated.getTime())
                        : "Právě teď"}
                    </span>
                  </div>
                </div>

                <div className="security-event">
                  <div className={securityState.online ? "security-event-dot" : "security-event-dot muted"} />
                  <div>
                    <strong>
                      {securityState.online
                        ? "Ústředna je připojena"
                        : "Ústředna je offline"}
                    </strong>
                    <span>
                      {securityState.online
                        ? "Komunikace s Tuya Cloud je aktivní"
                        : "Zařízení momentálně nekomunikuje s cloudem"}
                    </span>
                  </div>
                </div>

                <div className="security-event">
                  <div className="security-event-dot muted" />
                  <div>
                    <strong>
                      {isDisarmed
                        ? "Dům není zakódovaný"
                        : isAlarmMode
                          ? "Aktivní poplachový stav"
                          : "Dům je zakódovaný"}
                    </strong>
                    <span>
                      {isDisarmed
                        ? "Pro zapnutí střežení zvol režim Doma nebo Pryč"
                        : isAlarmMode
                          ? "Zkontroluj objekt a stav ústředny"
                          : `Aktivní režim: ${securityState.modeLabel}`}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

const securityStyles = `
  .security-page {
    width: 100%;
    padding: 30px;
    color: #17201d;
  }

  .security-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }

  .security-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
    color: #16765f;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .security-header h1 {
    margin: 0;
    font-size: clamp(28px, 3vw, 40px);
    line-height: 1.08;
  }

  .security-header p {
    margin: 10px 0 0;
    color: #71807a;
    font-size: 15px;
  }

  .security-refresh {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 1px solid #dce5e1;
    border-radius: 13px;
    padding: 0 16px;
    background: #ffffff;
    color: #26332e;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 22px rgba(22, 42, 35, 0.06);
  }

  .security-refresh:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .security-loading {
    min-height: 440px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 10px;
    text-align: center;
  }

  .security-loading strong {
    font-size: 18px;
  }

  .security-loading span {
    color: #77847f;
    font-size: 14px;
  }

  .security-spin {
    animation: security-spin 0.8s linear infinite;
  }

  @keyframes security-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .security-error {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    border: 1px solid #f4c7c7;
    border-radius: 18px;
    padding: 16px;
    background: #fff4f4;
    color: #a52b2b;
  }

  .security-error div {
    display: grid;
    gap: 3px;
  }

  .security-error span {
    font-size: 13px;
  }

  .security-error button {
    border: 0;
    border-radius: 10px;
    padding: 10px 13px;
    background: #a52b2b;
    color: #ffffff;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .security-hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 20px;
    border: 1px solid #dce7e2;
    border-radius: 26px;
    padding: 25px;
    background:
      radial-gradient(circle at 85% 15%, rgba(255,255,255,0.55), transparent 28%),
      linear-gradient(135deg, #eaf8f3, #f8fcfa);
    box-shadow: 0 18px 45px rgba(21, 66, 51, 0.08);
  }

  .security-hero.is-disarmed {
    background:
      radial-gradient(circle at 85% 15%, rgba(255,255,255,0.65), transparent 28%),
      linear-gradient(135deg, #f4f6f5, #fbfcfc);
  }

  .security-hero.is-alarm {
    border-color: #f3c0c0;
    background:
      radial-gradient(circle at 85% 15%, rgba(255,255,255,0.55), transparent 28%),
      linear-gradient(135deg, #fff0f0, #fffafa);
  }

  .security-hero-icon {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    border-radius: 22px;
    background: #16765f;
    color: #ffffff;
    box-shadow: 0 14px 30px rgba(22, 118, 95, 0.2);
  }

  .is-disarmed .security-hero-icon {
    background: #68756f;
    box-shadow: 0 14px 30px rgba(50, 65, 58, 0.16);
  }

  .is-alarm .security-hero-icon {
    background: #c43e3e;
    box-shadow: 0 14px 30px rgba(196, 62, 62, 0.2);
  }

  .security-hero-content {
    min-width: 0;
  }

  .security-hero-label {
    color: #6d7d76;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .security-hero h2 {
    margin: 5px 0;
    font-size: 28px;
  }

  .security-hero p {
    margin: 0;
    color: #65756e;
    font-size: 14px;
  }

  .security-connection {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(22, 118, 95, 0.16);
    border-radius: 999px;
    padding: 9px 13px;
    background: rgba(255, 255, 255, 0.72);
    color: #16765f;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .security-section {
    margin-top: 24px;
  }

  .security-section-heading,
  .security-panel-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .security-section-heading span,
  .security-panel-heading span {
    color: #16765f;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .security-section-heading h2,
  .security-panel-heading h2 {
    margin: 4px 0 0;
    font-size: 19px;
  }

  .security-section-heading small {
    color: #89948f;
    font-size: 12px;
  }

  .security-modes {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .security-mode {
    min-height: 112px;
    display: grid;
    justify-items: start;
    align-content: center;
    gap: 6px;
    border: 1px solid #e0e7e4;
    border-radius: 18px;
    padding: 17px;
    background: #ffffff;
    color: #26322e;
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }

  .security-mode:not(:disabled):hover {
    transform: translateY(-2px);
    border-color: #9fcbbd;
    box-shadow: 0 12px 24px rgba(20, 49, 39, 0.08);
  }

  .security-mode:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .security-mode.is-active:disabled {
    opacity: 1;
  }

  .security-mode span {
    font-size: 15px;
    font-weight: 850;
  }

  .security-mode small {
    color: #87928d;
    font-size: 11px;
  }

  .security-mode.is-active {
    border-color: #16765f;
    background: #edf8f4;
    color: #11624e;
    box-shadow: inset 0 0 0 1px rgba(22, 118, 95, 0.08);
  }

  .security-mode-danger.is-active {
    border-color: #c43e3e;
    background: #fff1f1;
    color: #a52b2b;
  }

  .security-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 24px;
  }

  .security-card {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 13px;
    min-width: 0;
    border: 1px solid #e2e8e5;
    border-radius: 18px;
    padding: 17px;
    background: #ffffff;
    box-shadow: 0 10px 25px rgba(20, 49, 39, 0.045);
  }

  .security-card-icon {
    width: 43px;
    height: 43px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: #edf7f3;
    color: #16765f;
  }

  .security-card > div:last-child {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .security-card span {
    color: #7b8983;
    font-size: 11px;
    font-weight: 700;
  }

  .security-card strong {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .security-card small {
    color: #98a29e;
    font-size: 11px;
  }

  .security-info-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
    gap: 16px;
    margin-top: 24px;
  }

  .security-panel {
    min-width: 0;
    border: 1px solid #e2e8e5;
    border-radius: 22px;
    padding: 20px;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(20, 49, 39, 0.045);
  }

  .security-info-list {
    display: grid;
    gap: 10px;
  }

  .security-info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-radius: 14px;
    padding: 13px 14px;
    background: #f7faf9;
  }

  .security-info-row span {
    color: #74817c;
    font-size: 12px;
    font-weight: 700;
  }

  .security-info-row strong {
    color: #26322e;
    font-size: 13px;
    text-align: right;
  }

  .security-timeline {
    display: grid;
    gap: 12px;
  }

  .security-event {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 11px;
    border-radius: 14px;
    padding: 13px;
    background: #f7faf9;
  }

  .security-event-dot {
    width: 10px;
    height: 10px;
    margin-top: 4px;
    border-radius: 999px;
    background: #16765f;
    box-shadow: 0 0 0 4px rgba(22, 118, 95, 0.11);
  }

  .security-event-dot.muted {
    background: #96a19c;
    box-shadow: 0 0 0 4px rgba(80, 95, 88, 0.09);
  }

  .security-event div:last-child {
    display: grid;
    gap: 4px;
  }

  .security-event strong {
    font-size: 13px;
  }

  .security-event span {
    color: #7d8984;
    font-size: 11px;
  }

  @media (max-width: 980px) {
    .security-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .security-info-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .security-page {
      padding: 18px;
    }

    .security-header {
      display: grid;
    }

    .security-refresh {
      width: 100%;
    }

    .security-hero {
      grid-template-columns: auto 1fr;
    }

    .security-connection {
      grid-column: 1 / -1;
      justify-content: center;
    }

    .security-modes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .security-section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 520px) {
    .security-grid {
      grid-template-columns: 1fr;
    }

    .security-hero {
      grid-template-columns: 1fr;
      text-align: center;
    }

    .security-hero-icon {
      margin: 0 auto;
    }

    .security-modes {
      grid-template-columns: 1fr;
    }
  }
`;
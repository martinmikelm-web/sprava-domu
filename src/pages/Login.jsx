import React, { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  clearApplicationState,
  configureLoginPersistence,
} from "../lib/appSession";

const SUSPENDED_NOTICE_KEY = "sprava_domu_suspended_notice";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [suspendedModalOpen, setSuspendedModalOpen] = useState(false);

  useEffect(() => {
    const suspendedNotice =
      localStorage.getItem(SUSPENDED_NOTICE_KEY);

    if (suspendedNotice === "1") {
      localStorage.removeItem(SUSPENDED_NOTICE_KEY);
      setErrorMessage("");
      setInfoMessage("");
      setSuspendedModalOpen(true);
    }
  }, []);

  function clearMessages() {
    if (errorMessage) setErrorMessage("");
    if (infoMessage) setInfoMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || forgotPasswordLoading) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Zadejte e-mailovou adresu.");
      return;
    }

    if (!password) {
      setErrorMessage("Zadejte heslo.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      clearApplicationState();
      configureLoginPersistence(rememberMe);

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      /*
       * Stav profiles.active se nekontroluje zde.
       * Po vytvoření session jej autoritativně ověří App.jsx.
       * Tím se vyhneme závodu mezi Login komponentou a auth listenerem
       * a aktivní účet se přihlásí normálně.
       */
    } catch (error) {
      clearApplicationState();
      localStorage.removeItem("sprava_domu_remember_login");
      sessionStorage.removeItem("sprava_domu_tab_session");

      console.error("Chyba při přihlášení:", error);

      const message = String(error?.message || "").toLowerCase();

      if (
        message.includes("profil je dočasně pozastaven") ||
        message.includes("profil je docasne pozastaven")
      ) {
        setErrorMessage(
          "Profil je dočasně pozastaven. Kontaktujte správce systému."
        );
      } else if (message.includes("invalid login credentials")) {
        setErrorMessage("Nesprávný e-mail nebo heslo.");
      } else if (message.includes("email not confirmed")) {
        setErrorMessage("E-mailová adresa zatím nebyla potvrzena.");
      } else if (
        message.includes("network") ||
        message.includes("failed to fetch")
      ) {
        setErrorMessage(
          "Nepodařilo se připojit k serveru. Zkontrolujte internetové připojení."
        );
      } else {
        setErrorMessage(
          error?.message || "Přihlášení se nezdařilo. Zkuste to znovu."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (loading || forgotPasswordLoading) return;

    const normalizedEmail = email.trim().toLowerCase();

    setErrorMessage("");
    setInfoMessage("");

    if (!normalizedEmail) {
      setErrorMessage(
        "Nejprve vyplňte e-mailovou adresu pro obnovení hesla."
      );
      return;
    }

    setForgotPasswordLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: window.location.origin,
        }
      );

      if (error) throw error;

      setInfoMessage(
        "Odkaz pro obnovení hesla jsme odeslali na zadaný e-mail."
      );
    } catch (error) {
      console.error("Chyba při obnovení hesla:", error);

      setErrorMessage(
        error?.message || "Odkaz pro obnovení hesla se nepodařilo odeslat."
      );
    } finally {
      setForgotPasswordLoading(false);
    }
  }

  return (
    <main className="new-login-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .new-login-page {
          --green-950: #0d3028;
          --green-900: #123d32;
          --green-800: #155442;
          --green-700: #1b7558;
          --green-600: #238b68;
          --green-100: #e8f5ef;
          --green-50: #f4faf7;
          --text: #18231f;
          --muted: #71827b;
          --border: #dbe7e1;
          --surface: #ffffff;

          width: 100%;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 8% 8%,
              rgba(47, 143, 109, 0.13),
              transparent 28%
            ),
            radial-gradient(
              circle at 92% 90%,
              rgba(18, 107, 80, 0.09),
              transparent 30%
            ),
            #f4f8f6;
          color: var(--text);
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .new-login-shell {
          width: min(1120px, 100%);
          min-height: 680px;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(420px, 0.75fr);
          overflow: hidden;
          border: 1px solid rgba(205, 221, 214, 0.95);
          border-radius: 34px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow:
            0 38px 100px rgba(18, 61, 50, 0.15),
            0 1px 0 rgba(255, 255, 255, 0.95) inset;
          backdrop-filter: blur(18px);
        }

        .new-login-visual {
          position: relative;
          min-height: 680px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 42px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 80% 20%,
              rgba(92, 211, 164, 0.17),
              transparent 34%
            ),
            linear-gradient(145deg, #0e382f 0%, #0b2b25 100%);
          color: #ffffff;
        }

        .new-login-visual::before {
          content: "";
          position: absolute;
          width: 390px;
          height: 390px;
          right: -150px;
          top: 90px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 50%;
        }

        .new-login-visual::after {
          content: "";
          position: absolute;
          width: 270px;
          height: 270px;
          right: -80px;
          top: 150px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 50%;
        }

        .new-login-brand {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .new-login-brand-logo {
          width: 54px;
          height: 54px;
          flex: 0 0 54px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 17px;
          background: linear-gradient(
            145deg,
            rgba(62, 174, 132, 0.33),
            rgba(37, 124, 94, 0.2)
          );
          color: #d9f7ea;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .new-login-brand-copy strong {
          display: block;
          font-size: 18px;
          font-weight: 820;
          letter-spacing: -0.02em;
        }

        .new-login-brand-copy span {
          display: block;
          margin-top: 4px;
          color: #9fc3b5;
          font-size: 11px;
        }

        .new-login-hero {
          position: relative;
          z-index: 2;
          max-width: 520px;
          margin: 45px 0;
        }

        .new-login-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          padding: 7px 11px;
          border: 1px solid rgba(126, 224, 186, 0.14);
          border-radius: 999px;
          background: rgba(74, 176, 136, 0.09);
          color: #88dfbd;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .new-login-hero h1 {
          max-width: 480px;
          margin: 20px 0 16px;
          font-size: clamp(44px, 5vw, 64px);
          line-height: 0.98;
          letter-spacing: -0.055em;
        }

        .new-login-hero > p {
          max-width: 480px;
          margin: 0;
          color: #a9c5ba;
          font-size: 15px;
          line-height: 1.7;
        }

        .new-login-features {
          display: grid;
          gap: 11px;
          margin-top: 28px;
        }

        .new-login-feature {
          display: flex;
          align-items: center;
          gap: 11px;
          color: #d8ebe4;
          font-size: 12px;
        }

        .new-login-feature span:first-child {
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(82, 181, 143, 0.1);
          color: #77d7b2;
        }

        .new-login-visual-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #6f9e8d;
          font-size: 10px;
        }

        .new-login-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 46px;
          background: rgba(255, 255, 255, 0.98);
        }

        .new-login-form-wrap {
          width: min(390px, 100%);
        }

        .new-login-form-head {
          margin-bottom: 28px;
        }

        .new-login-form-icon {
          width: 50px;
          height: 50px;
          display: grid;
          place-items: center;
          margin-bottom: 20px;
          border: 1px solid #d7e8df;
          border-radius: 16px;
          background: linear-gradient(145deg, #f4faf7, #e7f4ee);
          color: var(--green-700);
        }

        .new-login-form-head span {
          display: block;
          margin-bottom: 7px;
          color: var(--green-700);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .new-login-form-head h2 {
          margin: 0;
          color: var(--text);
          font-size: 32px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        .new-login-form-head p {
          margin: 10px 0 0;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.65;
        }

        .new-login-form {
          display: grid;
          gap: 16px;
        }

        .new-login-field {
          display: grid;
          gap: 7px;
        }

        .new-login-field label {
          color: #33453e;
          font-size: 11px;
          font-weight: 800;
        }

        .new-login-input {
          min-height: 54px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 14px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: #fbfcfb;
          color: #75867f;
          transition:
            border-color 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease;
        }

        .new-login-input:focus-within {
          border-color: #92c7b3;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(31, 126, 92, 0.07);
        }

        .new-login-input input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          color: #1f3029;
          font: inherit;
          font-size: 14px;
        }

        .new-login-input input::placeholder {
          color: #a2aea9;
        }

        .new-login-input > svg {
          flex: 0 0 auto;
        }

        .new-login-password-toggle {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          flex: 0 0 36px;
          padding: 0;
          border: 0;
          border-radius: 11px;
          background: transparent;
          color: #81928b;
          cursor: pointer;
        }

        .new-login-password-toggle:hover:not(:disabled) {
          background: #eef6f2;
          color: var(--green-700);
        }

        .new-login-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: -2px;
        }

        .new-login-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #71827b;
          font-size: 11px;
          cursor: pointer;
          user-select: none;
        }

        .new-login-checkbox input {
          width: 16px;
          height: 16px;
          accent-color: var(--green-700);
        }

        .new-login-forgot {
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--green-700);
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .new-login-forgot:hover:not(:disabled) {
          text-decoration: underline;
        }

        .new-login-message {
          margin: 0;
          padding: 11px 12px;
          border-radius: 12px;
          font-size: 11px;
          line-height: 1.5;
        }

        .new-login-message.error {
          border: 1px solid #f1cfd4;
          background: #fff2f3;
          color: #a62f3d;
        }

        .new-login-message.info {
          border: 1px solid #cce8dc;
          background: #eef9f4;
          color: #176b4e;
        }

        .new-login-submit {
          width: 100%;
          min-height: 54px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 18px;
          border: 1px solid #176a50;
          border-radius: 16px;
          background: linear-gradient(145deg, #238561, #14694e);
          color: #ffffff;
          font: inherit;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(20, 105, 78, 0.19);
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            opacity 160ms ease;
        }

        .new-login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 16px 34px rgba(20, 105, 78, 0.24);
        }

        .new-login-submit:disabled,
        .new-login-forgot:disabled,
        .new-login-password-toggle:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .new-login-spinner {
          width: 17px;
          height: 17px;
          border: 2px solid rgba(255, 255, 255, 0.28);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: new-login-spin 0.8s linear infinite;
        }

        .new-login-security {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin: 22px 0 0;
          padding-top: 18px;
          border-top: 1px solid #e7eeea;
          color: #8a9993;
          text-align: center;
          font-size: 10px;
          line-height: 1.5;
        }

        .new-login-security svg {
          flex: 0 0 auto;
          color: #5a8f7b;
        }

        .new-login-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(8, 24, 20, 0.58);
          backdrop-filter: blur(8px);
        }

        .new-login-modal {
          width: min(430px, 100%);
          overflow: hidden;
          border: 1px solid #d9e6e0;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(8, 38, 29, 0.28);
          color: var(--text);
        }

        .new-login-modal-top {
          padding: 26px 26px 18px;
          text-align: center;
        }

        .new-login-modal-icon {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          margin: 0 auto 16px;
          border: 1px solid #f1cfd4;
          border-radius: 18px;
          background: #fff2f3;
          color: #a62f3d;
        }

        .new-login-modal h3 {
          margin: 0;
          font-size: 23px;
          line-height: 1.15;
          letter-spacing: -0.03em;
        }

        .new-login-modal p {
          margin: 11px 0 0;
          color: #71827b;
          font-size: 13px;
          line-height: 1.65;
        }

        .new-login-modal-actions {
          padding: 0 26px 26px;
        }

        .new-login-modal-button {
          width: 100%;
          min-height: 48px;
          border: 1px solid #176a50;
          border-radius: 14px;
          background: linear-gradient(145deg, #238561, #14694e);
          color: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
        }

        .new-login-modal-button:hover {
          filter: brightness(1.04);
        }

        @keyframes new-login-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .new-login-page {
            padding: 18px;
          }

          .new-login-shell {
            width: min(560px, 100%);
            min-height: auto;
            grid-template-columns: 1fr;
          }

          .new-login-visual {
            min-height: auto;
            padding: 28px;
          }

          .new-login-hero {
            margin: 34px 0 12px;
          }

          .new-login-hero h1 {
            max-width: 420px;
            font-size: 42px;
          }

          .new-login-hero > p {
            max-width: 430px;
          }

          .new-login-features {
            display: none;
          }

          .new-login-visual-footer {
            display: none;
          }

          .new-login-panel {
            padding: 38px 30px;
          }
        }

        @media (max-width: 560px) {
          .new-login-page {
            min-height: 100dvh;
            padding: 10px;
          }

          .new-login-shell {
            border-radius: 24px;
          }

          .new-login-visual {
            padding: 22px 20px;
          }

          .new-login-brand-logo {
            width: 46px;
            height: 46px;
            flex-basis: 46px;
            border-radius: 14px;
          }

          .new-login-brand-copy strong {
            font-size: 16px;
          }

          .new-login-brand-copy span {
            display: none;
          }

          .new-login-hero {
            margin: 24px 0 4px;
          }

          .new-login-kicker {
            min-height: 30px;
            font-size: 9px;
          }

          .new-login-hero h1 {
            margin: 14px 0 10px;
            font-size: 34px;
          }

          .new-login-hero > p {
            font-size: 12px;
            line-height: 1.55;
          }

          .new-login-panel {
            padding: 28px 20px 24px;
          }

          .new-login-form-icon {
            display: none;
          }

          .new-login-form-head {
            margin-bottom: 22px;
          }

          .new-login-form-head h2 {
            font-size: 28px;
          }

          .new-login-options {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-height: 760px) and (min-width: 901px) {
          .new-login-page {
            padding: 14px;
          }

          .new-login-shell {
            min-height: 620px;
          }

          .new-login-visual {
            min-height: 620px;
            padding: 32px 38px;
          }

          .new-login-hero {
            margin: 30px 0;
          }

          .new-login-hero h1 {
            font-size: 50px;
          }

          .new-login-panel {
            padding-block: 30px;
          }

          .new-login-form-head {
            margin-bottom: 22px;
          }
        }
      `}</style>

      {suspendedModalOpen && (
        <div
          className="new-login-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSuspendedModalOpen(false);
            }
          }}
        >
          <section
            className="new-login-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="suspended-account-title"
          >
            <div className="new-login-modal-top">
              <div className="new-login-modal-icon">
                <LockKeyhole size={27} strokeWidth={2} />
              </div>

              <h3 id="suspended-account-title">
                Profil je dočasně pozastaven
              </h3>

              <p>
                K tomuto účtu je momentálně zablokovaný přístup do aplikace.
                Pro obnovení přístupu kontaktujte správce systému.
              </p>
            </div>

            <div className="new-login-modal-actions">
              <button
                type="button"
                className="new-login-modal-button"
                onClick={() => setSuspendedModalOpen(false)}
              >
                Rozumím
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="new-login-shell">
        <aside className="new-login-visual">
          <div className="new-login-brand">
            <div className="new-login-brand-logo">
              <Building2 size={25} strokeWidth={2} />
            </div>

            <div className="new-login-brand-copy">
              <strong>Správa domů</strong>
              <span>Interní systém správy nemovitostí</span>
            </div>
          </div>

          <div className="new-login-hero">
            <div className="new-login-kicker">
              <Sparkles size={14} />
              Jeden systém. Celý dům.
            </div>

            <h1>Všechno důležité na jednom místě.</h1>

            <p>
              Přehled domů, bytů, uživatelů, financí, oprav, dokumentů,
              zabezpečení i komunikace v jednom přehledném prostředí.
            </p>

            <div className="new-login-features">
              <div className="new-login-feature">
                <span>
                  <CheckCircle2 size={16} />
                </span>
                <span>Přístup řízený uživatelskými oprávněními</span>
              </div>

              <div className="new-login-feature">
                <span>
                  <ShieldCheck size={16} />
                </span>
                <span>Bezpečné přihlášení přes Supabase Auth</span>
              </div>

              <div className="new-login-feature">
                <span>
                  <Building2 size={16} />
                </span>
                <span>Správa více domů z jednoho účtu</span>
              </div>
            </div>
          </div>

          <div className="new-login-visual-footer">
            <ShieldCheck size={14} />
            Zabezpečená interní aplikace Správa domů
          </div>
        </aside>

        <section className="new-login-panel">
          <div className="new-login-form-wrap">
            <header className="new-login-form-head">
              <div className="new-login-form-icon">
                <LockKeyhole size={24} strokeWidth={1.9} />
              </div>

              <span>Přístup do aplikace</span>
              <h2>Přihlášení</h2>

              <p>
                Zadejte přihlašovací údaje ke svému účtu a pokračujte do
                systému.
              </p>
            </header>

            <form className="new-login-form" onSubmit={handleSubmit}>
              <div className="new-login-field">
                <label htmlFor="new-login-email">E-mailová adresa</label>

                <div className="new-login-input">
                  <Mail size={19} strokeWidth={2} />

                  <input
                    id="new-login-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearMessages();
                    }}
                    placeholder="vas@email.cz"
                    autoComplete="email"
                    spellCheck="false"
                    disabled={loading || forgotPasswordLoading}
                    required
                  />
                </div>
              </div>

              <div className="new-login-field">
                <label htmlFor="new-login-password">Heslo</label>

                <div className="new-login-input">
                  <KeyRound size={19} strokeWidth={2} />

                  <input
                    id="new-login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearMessages();
                    }}
                    placeholder="Zadejte své heslo"
                    autoComplete="current-password"
                    disabled={loading || forgotPasswordLoading}
                    required
                  />

                  <button
                    type="button"
                    className="new-login-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
                    title={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
                    disabled={loading || forgotPasswordLoading}
                  >
                    {showPassword ? (
                      <EyeOff size={18} strokeWidth={2} />
                    ) : (
                      <Eye size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              <div className="new-login-options">
                <label className="new-login-checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                    disabled={loading || forgotPasswordLoading}
                  />
                  <span>Zapamatovat přihlášení</span>
                </label>

                <button
                  type="button"
                  className="new-login-forgot"
                  onClick={handleForgotPassword}
                  disabled={loading || forgotPasswordLoading}
                >
                  {forgotPasswordLoading
                    ? "Odesílám…"
                    : "Zapomenuté heslo"}
                </button>
              </div>

              {errorMessage && (
                <p className="new-login-message error" role="alert">
                  {errorMessage}
                </p>
              )}

              {infoMessage && (
                <p className="new-login-message info" role="status">
                  {infoMessage}
                </p>
              )}

              <button
                type="submit"
                className="new-login-submit"
                disabled={loading || forgotPasswordLoading}
              >
                {loading ? (
                  <>
                    <span className="new-login-spinner" />
                    Přihlašuji…
                  </>
                ) : (
                  <>
                    <LockKeyhole size={17} />
                    Přihlásit se
                  </>
                )}
              </button>
            </form>

            <p className="new-login-security">
              <ShieldCheck size={15} />
              Přihlášení je ověřováno prostřednictvím Supabase Auth.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

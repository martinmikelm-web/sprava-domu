import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  House,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  clearApplicationState,
  configureLoginPersistence,
} from "../lib/appSession";

const WELCOME_DURATION = 15;

export default function Login() {
  const [screen, setScreen] = useState("welcome");
  const [screenVisible, setScreenVisible] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(WELCOME_DURATION);
  const [initializationText, setInitializationText] = useState(
    "Inicializace systému…"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const progress =
    ((WELCOME_DURATION - secondsLeft) / WELCOME_DURATION) * 100;

  useEffect(() => {
    if (screen !== "welcome") return undefined;

    let active = true;

    async function initializeApplication() {
      setInitializationText("Ověřuji zabezpečené připojení…");

      try {
        await supabase.auth.getSession();

        if (!active) return;

        setInitializationText("Připravuji přihlašovací systém…");
      } catch (error) {
        console.error("Inicializace přihlášení selhala:", error);

        if (!active) return;

        setInitializationText("Připravuji přihlášení…");
      }
    }

    initializeApplication();

    return () => {
      active = false;
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== "welcome") return undefined;

    const countdownInterval = window.setInterval(() => {
      setSecondsLeft((currentValue) => {
        if (currentValue <= 1) {
          window.clearInterval(countdownInterval);
          return 0;
        }

        return currentValue - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(countdownInterval);
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "welcome" && secondsLeft === 0) {
      openLogin();
    }
  }, [secondsLeft, screen]);

  function changeScreen(nextScreen) {
    setScreenVisible(false);

    window.setTimeout(() => {
      setScreen(nextScreen);
      setScreenVisible(true);
    }, 260);
  }

  function openLogin() {
    setErrorMessage("");
    setInfoMessage("");
    changeScreen("login");
  }

  function openWelcome() {
    if (loading || forgotPasswordLoading) return;

    setErrorMessage("");
    setInfoMessage("");
    setSecondsLeft(WELCOME_DURATION);
    setInitializationText("Inicializace systému…");
    changeScreen("welcome");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || forgotPasswordLoading) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Zadej e-mailovou adresu.");
      return;
    }

    if (!password) {
      setErrorMessage("Zadej heslo.");
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

      if (error) {
        throw error;
      }
    } catch (error) {
      clearApplicationState();
      localStorage.removeItem("sprava_domu_remember_login");
      sessionStorage.removeItem("sprava_domu_tab_session");

      console.error("Chyba při přihlášení:", error);

      const message = String(error?.message || "").toLowerCase();

      if (message.includes("invalid login credentials")) {
        setErrorMessage("Nesprávný e-mail nebo heslo.");
      } else if (message.includes("email not confirmed")) {
        setErrorMessage("E-mailová adresa zatím nebyla potvrzena.");
      } else if (
        message.includes("network") ||
        message.includes("failed to fetch")
      ) {
        setErrorMessage(
          "Nepodařilo se připojit k serveru. Zkontroluj internetové připojení."
        );
      } else {
        setErrorMessage(
          error?.message || "Přihlášení se nezdařilo. Zkus to znovu."
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
        "Nejprve vyplň e-mailovou adresu pro obnovení hesla."
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

      if (error) {
        throw error;
      }

      setInfoMessage(
        "Odkaz pro obnovení hesla byl odeslán na zadanou e-mailovou adresu."
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
    <main className="login-page">
      <style>{`
        .login-page {
          box-sizing: border-box;
          width: 100%;
          height: 100vh;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 12% 12%,
              rgba(20, 184, 166, 0.16),
              transparent 32%
            ),
            radial-gradient(
              circle at 88% 88%,
              rgba(16, 185, 129, 0.1),
              transparent 34%
            ),
            #06111f;
          color: #f8fafc;
        }

        .login-card {
          position: relative;
          width: min(470px, 100%);
          max-height: calc(100vh - 36px);
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 30px;
          background: rgba(8, 20, 36, 0.96);
          box-shadow:
            0 35px 100px rgba(0, 0, 0, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(22px);
        }

        .login-card::before {
          content: "";
          position: absolute;
          top: -170px;
          right: -140px;
          width: 330px;
          height: 330px;
          border-radius: 50%;
          background: rgba(20, 184, 166, 0.11);
          pointer-events: none;
        }

        .login-card::after {
          content: "";
          position: absolute;
          bottom: -220px;
          left: -180px;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          background: rgba(5, 150, 105, 0.08);
          pointer-events: none;
        }

        .login-screen {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          padding: 26px 34px;
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 0.26s ease,
            transform 0.26s ease;
        }

        .login-screen.is-hidden {
          opacity: 0;
          transform: translateY(12px);
        }

        .login-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 13px;
          text-align: left;
        }

        .login-brand-logo {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid rgba(94, 234, 212, 0.21);
          border-radius: 16px;
          background: linear-gradient(
            145deg,
            rgba(20, 184, 166, 0.3),
            rgba(13, 148, 136, 0.14)
          );
          color: #ccfbf1;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }

        .login-brand-text strong {
          display: block;
          color: #f8fafc;
          font-size: 18px;
          line-height: 1.2;
        }

        .login-brand-text span {
          display: block;
          margin-top: 4px;
          color: #8293a8;
          font-size: 12px;
          line-height: 1.35;
        }

        .welcome-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 0 24px;
          text-align: center;
        }

        .welcome-icon {
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          margin-bottom: 18px;
          border: 1px solid rgba(52, 211, 153, 0.21);
          border-radius: 26px;
          background:
            linear-gradient(
              145deg,
              rgba(16, 185, 129, 0.22),
              rgba(15, 118, 110, 0.1)
            );
          color: #6ee7b7;
          box-shadow:
            0 18px 45px rgba(5, 150, 105, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        .login-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 31px;
          padding: 6px 12px;
          border: 1px solid rgba(52, 211, 153, 0.14);
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.09);
          color: #6ee7b7;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .welcome-content h1 {
          margin: 14px 0 10px;
          color: #f8fafc;
          font-size: clamp(38px, 7vw, 52px);
          line-height: 1.02;
          letter-spacing: -0.052em;
        }

        .welcome-content > p {
          max-width: 370px;
          margin: 0;
          color: #9aabba;
          font-size: 14px;
          line-height: 1.7;
        }

        .welcome-status {
          width: 100%;
          margin-top: 22px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 17px;
          background: rgba(15, 23, 42, 0.43);
        }

        .welcome-status-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
        }

        .welcome-status-copy {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 9px;
          color: #aab8c7;
          font-size: 12px;
        }

        .welcome-status-copy svg {
          flex: 0 0 auto;
          color: #34d399;
          animation: login-spin 1.1s linear infinite;
        }

        .welcome-countdown {
          flex: 0 0 auto;
          color: #6ee7b7;
          font-size: 12px;
          font-weight: 800;
        }

        .welcome-progress-track {
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.12);
        }

        .welcome-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #10b981, #2dd4bf);
          box-shadow: 0 0 14px rgba(45, 212, 191, 0.35);
          transition: width 1s linear;
        }

        .primary-button {
          width: 100%;
          min-height: 50px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 20px;
          border: 0;
          border-radius: 17px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 16px 38px rgba(5, 150, 105, 0.24);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .primary-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 20px 44px rgba(5, 150, 105, 0.32);
        }

        .primary-button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .welcome-footer {
          margin: 12px 0 0;
          color: #5f7186;
          text-align: center;
          font-size: 11px;
          line-height: 1.5;
        }

        .login-form-screen {
          display: flex;
          flex-direction: column;
        }

        .login-back-button {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 18px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #8191a5;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .login-back-button:hover:not(:disabled) {
          color: #e2e8f0;
        }

        .login-form-heading {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 18px;
          text-align: center;
        }

        .login-heading-icon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          margin-bottom: 10px;
          border: 1px solid rgba(52, 211, 153, 0.17);
          border-radius: 20px;
          background: rgba(16, 185, 129, 0.1);
          color: #6ee7b7;
        }

        .login-form-heading span {
          color: #34d399;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .login-form-heading h1 {
          margin: 5px 0 0;
          color: #f8fafc;
          font-size: 30px;
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .login-form-heading p {
          max-width: 345px;
          margin: 6px 0 0;
          color: #8495a9;
          font-size: 13px;
          line-height: 1.6;
        }

        .login-form {
          display: grid;
          gap: 12px;
        }

        .login-field {
          display: grid;
          gap: 6px;
        }

        .login-field label {
          color: #bdc9d7;
          font-size: 12px;
          font-weight: 700;
        }

        .login-input-wrap {
          min-height: 50px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 16px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.68);
          transition:
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .login-input-wrap:focus-within {
          border-color: rgba(52, 211, 153, 0.57);
          background: rgba(15, 23, 42, 0.96);
          box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.09);
        }

        .login-input-icon {
          flex: 0 0 auto;
          color: #64748b;
        }

        .login-input-wrap input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #f8fafc;
          font: inherit;
          font-size: 14px;
        }

        .login-input-wrap input::placeholder {
          color: #475569;
        }

        .login-password-toggle {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          padding: 0;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition:
            color 0.2s ease,
            background 0.2s ease;
        }

        .login-password-toggle:hover:not(:disabled) {
          background: rgba(148, 163, 184, 0.09);
          color: #e2e8f0;
        }

        .login-remember-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .login-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #8495a9;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
        }

        .login-checkbox input {
          width: 16px;
          height: 16px;
          accent-color: #10b981;
        }

        .login-message {
          margin: 0;
          padding: 12px 14px;
          border-radius: 13px;
          font-size: 12px;
          line-height: 1.5;
        }

        .login-error {
          border: 1px solid rgba(248, 113, 113, 0.21);
          background: rgba(127, 29, 29, 0.2);
          color: #fecaca;
        }

        .login-info {
          border: 1px solid rgba(52, 211, 153, 0.18);
          background: rgba(6, 78, 59, 0.23);
          color: #a7f3d0;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.28);
          border-top-color: #fff;
          border-radius: 50%;
          animation: login-spin 0.8s linear infinite;
        }

        .forgot-password-button {
          width: fit-content;
          margin: 0 auto;
          padding: 2px 0;
          border: 0;
          background: transparent;
          color: #6ee7b7;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .forgot-password-button:hover:not(:disabled) {
          text-decoration: underline;
        }

        .login-security-note {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          gap: 9px;
          margin: 12px 0 0;
          padding-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.09);
          color: #5f7186;
          text-align: left;
          font-size: 11px;
          line-height: 1.5;
        }

        .login-security-note svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }

        @keyframes login-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 560px) {
          .login-page {
            height: 100vh;
            min-height: 100vh;
            align-items: center;
            padding: 10px;
            overflow: hidden;
          }

          .login-card {
            width: 100%;
            max-height: calc(100vh - 20px);
            border-radius: 22px;
          }

          .login-screen {
            box-sizing: border-box;
            padding: 20px 18px;
          }

          .login-brand-logo {
            width: 42px;
            height: 42px;
            border-radius: 14px;
          }

          .login-brand-text span {
            display: none;
          }

          .welcome-content {
            padding: 22px 0 18px;
          }

          .welcome-icon {
            width: 62px;
            height: 62px;
            margin-bottom: 14px;
            border-radius: 21px;
          }

          .welcome-content h1 {
            font-size: 34px;
          }

          .login-form-heading h1 {
            font-size: 27px;
          }

          .login-form-heading p {
            font-size: 12px;
          }
        }

        @media (max-height: 760px) {
          .login-page {
            padding: 10px;
          }

          .login-card {
            max-height: calc(100vh - 20px);
          }

          .login-screen {
            padding: 18px 28px;
          }

          .login-brand-logo {
            width: 42px;
            height: 42px;
          }

          .login-back-button {
            margin-bottom: 8px;
          }

          .login-heading-icon {
            width: 46px;
            height: 46px;
            margin-bottom: 7px;
          }

          .login-form-heading {
            margin-bottom: 13px;
          }

          .login-form-heading h1 {
            font-size: 27px;
          }

          .login-form-heading p {
            margin-top: 4px;
            line-height: 1.45;
          }

          .login-form {
            gap: 9px;
          }

          .login-input-wrap {
            min-height: 44px;
          }

          .primary-button {
            min-height: 46px;
          }

          .login-security-note {
            margin-top: 9px;
            padding-top: 9px;
          }

          .welcome-content {
            padding: 18px 0 14px;
          }

          .welcome-status {
            margin-top: 16px;
          }
        }
      `}</style>

      <section className="login-card">
        <div
          className={`login-screen ${
            screenVisible ? "" : "is-hidden"
          }`}
        >
          <div className="login-brand">
            <div className="login-brand-logo">
              <House size={23} strokeWidth={2.2} />
            </div>

            <div className="login-brand-text">
              <strong>Správa domů</strong>
              <span>Moderní systém pro správu nemovitostí</span>
            </div>
          </div>

          {screen === "welcome" ? (
            <>
              <div className="welcome-content">
                <div className="welcome-icon">
                  <Building2 size={39} strokeWidth={1.8} />
                </div>

                <span className="login-eyebrow">
                  <ShieldCheck size={14} />
                  Vítejte v aplikaci
                </span>

                <h1>Správa domů</h1>

                <p>
                  Přehledné a bezpečné prostředí pro správu domů,
                  bytů, nájemníků, financí, oprav a dokumentů.
                </p>

                <div className="welcome-status">
                  <div className="welcome-status-header">
                    <div className="welcome-status-copy">
                      <LoaderCircle size={16} />
                      <span>{initializationText}</span>
                    </div>

                    <span className="welcome-countdown">
                      {secondsLeft} s
                    </span>
                  </div>

                  <div className="welcome-progress-track">
                    <div
                      className="welcome-progress-bar"
                      style={{
                        width: `${Math.min(
                          Math.max(progress, 0),
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={openLogin}
              >
                Pokračovat k přihlášení
                <ArrowRight size={18} />
              </button>

              <p className="welcome-footer">
                Přihlašovací obrazovka se otevře automaticky.
              </p>
            </>
          ) : (
            <div className="login-form-screen">
              <button
                type="button"
                className="login-back-button"
                onClick={openWelcome}
                disabled={loading || forgotPasswordLoading}
              >
                <ArrowLeft size={16} />
                Zpět na úvod
              </button>

              <header className="login-form-heading">
                <div className="login-heading-icon">
                  <LockKeyhole size={28} strokeWidth={1.9} />
                </div>

                <span>Zabezpečený přístup</span>
                <h1>Přihlášení</h1>

                <p>
                  Zadejte přihlašovací údaje přiřazené k vašemu
                  uživatelskému účtu.
                </p>
              </header>

              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-field">
                  <label htmlFor="login-email">
                    E-mailová adresa
                  </label>

                  <div className="login-input-wrap">
                    <Mail
                      className="login-input-icon"
                      size={19}
                      strokeWidth={2}
                    />

                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);

                        if (errorMessage) {
                          setErrorMessage("");
                        }

                        if (infoMessage) {
                          setInfoMessage("");
                        }
                      }}
                      placeholder="např. martin@email.cz"
                      autoComplete="email"
                      spellCheck="false"
                      disabled={loading || forgotPasswordLoading}
                      required
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label htmlFor="login-password">Heslo</label>

                  <div className="login-input-wrap">
                    <LockKeyhole
                      className="login-input-icon"
                      size={19}
                      strokeWidth={2}
                    />

                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);

                        if (errorMessage) {
                          setErrorMessage("");
                        }

                        if (infoMessage) {
                          setInfoMessage("");
                        }
                      }}
                      placeholder="Zadejte své heslo"
                      autoComplete="current-password"
                      disabled={loading || forgotPasswordLoading}
                      required
                    />

                    <button
                      type="button"
                      className="login-password-toggle"
                      onClick={() =>
                        setShowPassword((currentValue) => !currentValue)
                      }
                      aria-label={
                        showPassword ? "Skrýt heslo" : "Zobrazit heslo"
                      }
                      title={
                        showPassword ? "Skrýt heslo" : "Zobrazit heslo"
                      }
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

                <div className="login-remember-row">
                  <label className="login-checkbox">
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
                </div>

                {errorMessage && (
                  <p
                    className="login-message login-error"
                    role="alert"
                  >
                    {errorMessage}
                  </p>
                )}

                {infoMessage && (
                  <p
                    className="login-message login-info"
                    role="status"
                  >
                    {infoMessage}
                  </p>
                )}

                <button
                  className="primary-button"
                  type="submit"
                  disabled={loading || forgotPasswordLoading}
                >
                  {loading ? (
                    <>
                      <span className="login-spinner" />
                      Přihlašuji…
                    </>
                  ) : (
                    "Přihlásit se"
                  )}
                </button>

                <button
                  type="button"
                  className="forgot-password-button"
                  onClick={handleForgotPassword}
                  disabled={loading || forgotPasswordLoading}
                >
                  {forgotPasswordLoading
                    ? "Odesílám odkaz…"
                    : "Zapomenuté heslo"}
                </button>
              </form>

              <p className="login-security-note">
                <ShieldCheck size={15} strokeWidth={2} />
                Přihlášení je bezpečně ověřováno prostřednictvím
                Supabase Auth.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
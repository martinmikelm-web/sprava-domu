import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  clearDeveloperPreviewData,
  getDeveloperPreviewSnapshot,
  getDeveloperPreviewStats,
  importDeveloperPreviewSnapshot,
} from "../lib/supabase";

export default function DeveloperSandboxPanel() {
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function refresh() {
      setRevision((value) => value + 1);
    }

    window.addEventListener(
      "developer-sandbox-data-changed",
      refresh
    );

    return () => {
      window.removeEventListener(
        "developer-sandbox-data-changed",
        refresh
      );
    };
  }, []);

  const stats = useMemo(
    () => getDeveloperPreviewStats(),
    [revision, open]
  );

  function showMessage(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function handleClear() {
    const confirmed = window.confirm(
      "Opravdu chcete vymazat všechna data vytvořená v Developer Sandboxu? Přihlášený účet zůstane zachovaný."
    );

    if (!confirmed) return;

    clearDeveloperPreviewData({ preserveIdentity: true });
    localStorage.removeItem("selected_house_id");
    setRevision((value) => value + 1);
    showMessage("Sandboxová data byla vymazána. Obnovuji aplikaci…");

    window.setTimeout(() => {
      window.location.reload();
    }, 450);
  }

  function handleExport() {
    const snapshot = getDeveloperPreviewSnapshot();
    const content = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([content], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `developer-sandbox-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
    showMessage("Sandbox byl exportován.");
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);

      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot)
      ) {
        throw new Error("Soubor nemá platný formát sandboxu.");
      }

      importDeveloperPreviewSnapshot(snapshot);

      const firstHouse = Array.isArray(snapshot.houses)
        ? snapshot.houses[0]
        : null;

      if (firstHouse?.id) {
        localStorage.setItem(
          "selected_house_id",
          String(firstHouse.id)
        );
      } else {
        localStorage.removeItem("selected_house_id");
      }

      setRevision((value) => value + 1);
      showMessage("Sandbox byl úspěšně načten. Obnovuji aplikaci…");

      window.setTimeout(() => {
        window.location.reload();
      }, 450);
    } catch (error) {
      console.error("Import sandboxu selhal:", error);
      showMessage(
        error?.message || "Sandbox se nepodařilo načíst."
      );
    }
  }

  return (
    <>
      <style>{`
        .developer-sandbox-trigger {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 10000;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 44px;
          padding: 0 15px;
          border: 1px solid rgba(167, 139, 250, 0.45);
          border-radius: 999px;
          background: rgba(46, 16, 101, 0.94);
          color: #f5f3ff;
          box-shadow: 0 14px 38px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(16px);
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
        }

        .developer-sandbox-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #c4b5fd;
          box-shadow: 0 0 14px rgba(196, 181, 253, 0.9);
        }

        .developer-sandbox-panel {
          position: fixed;
          right: 18px;
          bottom: 72px;
          z-index: 10001;
          width: min(380px, calc(100vw - 36px));
          border: 1px solid rgba(167, 139, 250, 0.28);
          border-radius: 24px;
          padding: 18px;
          background: rgba(10, 18, 33, 0.98);
          color: #f8fafc;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(20px);
        }

        .developer-sandbox-panel h3 {
          margin: 0 0 7px;
          font-size: 18px;
        }

        .developer-sandbox-panel p {
          margin: 0;
          color: #a8b5c7;
          font-size: 13px;
          line-height: 1.55;
        }

        .developer-sandbox-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 16px 0;
        }

        .developer-sandbox-stat {
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.78);
        }

        .developer-sandbox-stat strong {
          display: block;
          margin-bottom: 3px;
          font-size: 20px;
        }

        .developer-sandbox-stat span {
          color: #91a2b8;
          font-size: 12px;
        }

        .developer-sandbox-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .developer-sandbox-action {
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 13px;
          background: #111c2f;
          color: #f8fafc;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
        }

        .developer-sandbox-action-danger {
          border-color: rgba(248, 113, 113, 0.28);
          color: #fecaca;
        }

        .developer-sandbox-message {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(139, 92, 246, 0.14);
          color: #ddd6fe;
          font-size: 12px;
          line-height: 1.45;
        }
      `}</style>

      {open && (
        <section className="developer-sandbox-panel">
          <h3>Developer Sandbox</h3>
          <p>
            Pracujete v odděleném testovacím prostředí. Žádná
            změna se nepropíše do ostrých dat.
          </p>

          <div className="developer-sandbox-stats">
            <div className="developer-sandbox-stat">
              <strong>{stats.records}</strong>
              <span>testovacích záznamů</span>
            </div>

            <div className="developer-sandbox-stat">
              <strong>{stats.tables}</strong>
              <span>použitých tabulek</span>
            </div>
          </div>

          <div className="developer-sandbox-actions">
            <button
              type="button"
              className="developer-sandbox-action"
              onClick={handleExport}
            >
              Exportovat JSON
            </button>

            <button
              type="button"
              className="developer-sandbox-action"
              onClick={() => fileInputRef.current?.click()}
            >
              Načíst JSON
            </button>

            <button
              type="button"
              className="developer-sandbox-action developer-sandbox-action-danger"
              onClick={handleClear}
            >
              Vymazat sandbox
            </button>

            <button
              type="button"
              className="developer-sandbox-action"
              onClick={() => setOpen(false)}
            >
              Zavřít
            </button>
          </div>

          {message && (
            <div className="developer-sandbox-message">
              {message}
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        className="developer-sandbox-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="developer-sandbox-dot" />
        SANDBOX MODE
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleImport}
      />
    </>
  );
}
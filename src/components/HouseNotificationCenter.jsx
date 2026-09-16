import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CircleAlert,
  Mail,
  RefreshCw,
  Save,
  Smartphone,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const RULES_TABLE = "house_notification_rules";

function channelLabel(enabled, count) {
  return enabled ? count : "—";
}

export default function HouseNotificationCenter({
  houseId,
  houseName = "",
  canEdit = false,
  savingSettings = false,
  emailNotifications = true,
  pushNotifications = true,
  smsNotifications = false,
  onChangeHouseChannel,
  onMessage,
  onError,
}) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadRules();
  }, [houseId]);

  const filteredRules = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rules;

    return rules.filter((rule) =>
      [
        rule.display_name,
        rule.system_name,
        rule.description,
        rule.notification_key,
        rule.module_key,
      ].some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }, [rules, search]);

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.enabled !== false);
    return {
      total: rules.length,
      active: active.length,
      push: active.filter((rule) => rule.push_enabled === true).length,
      email: active.filter((rule) => rule.email_enabled === true).length,
      sms: active.filter((rule) => rule.sms_enabled === true).length,
    };
  }, [rules]);

  async function loadRules() {
    if (!houseId) {
      setRules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    onError?.("");

    try {
      const { data, error } = await supabase
        .from(RULES_TABLE)
        .select(
          "id, house_id, notification_key, system_name, display_name, description, module_key, enabled, push_enabled, email_enabled, sms_enabled, is_system, created_at, updated_at"
        )
        .eq("house_id", houseId)
        .order("system_name", { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error("Načtení notifikací selhalo:", error);
      setRules([]);
      onError?.(
        error?.message ||
          "Přehled notifikací se nepodařilo načíst. Zkontroluj Supabase SQL."
      );
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(id, field, value) {
    if (!canEdit) return;
    setRules((current) =>
      current.map((rule) =>
        rule.id === id ? { ...rule, [field]: value } : rule
      )
    );
    onError?.("");
  }

  async function saveRule(rule) {
    if (!canEdit || !rule?.id) return;

    const displayName = String(rule.display_name || "").trim();
    if (!displayName) {
      onError?.("Každá notifikace musí mít vlastní název.");
      return;
    }

    setSavingId(rule.id);
    onError?.("");

    try {
      const payload = {
        display_name: displayName,
        description: String(rule.description || "").trim() || null,
        enabled: Boolean(rule.enabled),
        push_enabled: Boolean(rule.push_enabled),
        email_enabled: Boolean(rule.email_enabled),
        sms_enabled: Boolean(rule.sms_enabled),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(RULES_TABLE)
        .update(payload)
        .eq("id", rule.id)
        .eq("house_id", houseId)
        .select(
          "id, house_id, notification_key, system_name, display_name, description, module_key, enabled, push_enabled, email_enabled, sms_enabled, is_system, created_at, updated_at"
        )
        .single();

      if (error) throw error;

      setRules((current) =>
        current.map((item) => (item.id === rule.id ? data : item))
      );
      onMessage?.(`Notifikace „${displayName}“ byla uložena.`);
    } catch (error) {
      console.error("Uložení notifikace selhalo:", error);
      onError?.(error?.message || "Nastavení notifikace se nepodařilo uložit.");
    } finally {
      setSavingId("");
    }
  }

  async function setAll(enabled) {
    if (!canEdit || !houseId || !rules.length) return;

    setSavingId("__all__");
    onError?.("");

    try {
      const { error } = await supabase
        .from(RULES_TABLE)
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("house_id", houseId);

      if (error) throw error;

      setRules((current) => current.map((rule) => ({ ...rule, enabled })));
      onMessage?.(
        enabled
          ? "Všechny systémové notifikace byly zapnuty."
          : "Všechny systémové notifikace byly vypnuty."
      );
    } catch (error) {
      console.error("Hromadná změna notifikací selhala:", error);
      onError?.(error?.message || "Hromadné nastavení notifikací se nepodařilo uložit.");
    } finally {
      setSavingId("");
    }
  }

  function HouseChannelSwitch({ field, checked, title, description }) {
    return (
      <div className="hnc-channel-master-row">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <label className="hnc-switch">
          <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(event) =>
              onChangeHouseChannel?.(field, event.target.checked)
            }
            disabled={!canEdit || savingSettings}
          />
          <span />
        </label>
      </div>
    );
  }

  return (
    <div className="house-notification-center">
      <style>{`
        .house-notification-center { display:grid; gap:16px; }
        .house-notification-center * { box-sizing:border-box; }
        .hnc-heading { display:flex; align-items:flex-start; gap:14px; padding-bottom:19px; border-bottom:1px solid rgba(148,163,184,.09); }
        .hnc-heading-icon { width:46px; height:46px; display:grid; place-items:center; flex:0 0 auto; border:1px solid rgba(52,211,153,.15); border-radius:15px; background:rgba(16,185,129,.09); color:#6ee7b7; }
        .hnc-heading span { display:block; margin-bottom:4px; color:#34d399; font-size:10px; font-weight:800; text-transform:uppercase; }
        .hnc-heading h2 { margin:0; color:#fff; font-size:23px; }
        .hnc-heading p { margin:7px 0 0; color:#8fa1b6; font-size:12px; line-height:1.55; }
        .hnc-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
        .hnc-stat { padding:15px; border:1px solid rgba(148,163,184,.11); border-radius:16px; background:rgba(15,23,42,.44); }
        .hnc-stat span { display:block; color:#8294a9; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; }
        .hnc-stat strong { display:block; margin-top:7px; color:#f8fafc; font-size:26px; line-height:1; }
        .hnc-stat small { display:block; margin-top:7px; color:#6f8196; font-size:10px; line-height:1.45; }
        .hnc-master { display:grid; gap:12px; padding:16px; border:1px solid rgba(52,211,153,.12); border-radius:17px; background:rgba(16,185,129,.045); }
        .hnc-master-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; color:#7ce9bd; }
        .hnc-master-head strong { color:#edf8f4; font-size:13px; }
        .hnc-master-head span { display:block; margin-top:4px; color:#8294a9; font-size:11px; line-height:1.5; }
        .hnc-channel-master-row { min-height:62px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 14px; border:1px solid rgba(148,163,184,.1); border-radius:14px; background:rgba(15,23,42,.42); }
        .hnc-channel-master-row strong { display:block; color:#eaf2fb; font-size:12px; }
        .hnc-channel-master-row span { display:block; margin-top:3px; color:#718399; font-size:10px; }
        .hnc-switch { position:relative; width:45px; height:25px; flex:0 0 auto; }
        .hnc-switch input { position:absolute; opacity:0; }
        .hnc-switch > span { position:absolute; inset:0; border-radius:999px; background:#334155; cursor:pointer; }
        .hnc-switch > span::after { content:""; position:absolute; width:19px; height:19px; left:3px; top:3px; border-radius:50%; background:#fff; transition:transform .2s ease; }
        .hnc-switch input:checked + span { background:#10b981; }
        .hnc-switch input:checked + span::after { transform:translateX(20px); }
        .hnc-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .hnc-search { min-height:43px; flex:1; display:flex; align-items:center; gap:9px; padding:0 12px; border:1px solid rgba(148,163,184,.14); border-radius:13px; background:rgba(15,23,42,.68); color:#71849a; }
        .hnc-search input { width:100%; border:0; outline:0; background:transparent; color:#eef4fb; font:inherit; font-size:12px; }
        .hnc-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .hnc-btn { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:0 12px; border:1px solid rgba(148,163,184,.14); border-radius:12px; background:rgba(15,23,42,.62); color:#aebccc; font:inherit; font-size:11px; font-weight:800; cursor:pointer; }
        .hnc-btn.primary { border:0; background:linear-gradient(135deg,#10b981,#059669); color:white; }
        .hnc-btn:disabled { cursor:not-allowed; opacity:.45; }
        .hnc-loading, .hnc-empty { min-height:150px; display:grid; place-items:center; align-content:center; gap:10px; padding:20px; border:1px dashed rgba(148,163,184,.14); border-radius:16px; color:#8da0b5; text-align:center; }
        .hnc-list { display:grid; gap:12px; }
        .hnc-rule { display:grid; gap:13px; padding:15px; border:1px solid rgba(148,163,184,.11); border-radius:17px; background:rgba(15,23,42,.42); }
        .hnc-rule.on { border-color:rgba(52,211,153,.17); }
        .hnc-rule.off { opacity:.7; }
        .hnc-rule-top { display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .hnc-rule-id { min-width:0; display:flex; align-items:center; gap:10px; }
        .hnc-rule-icon { width:38px; height:38px; display:grid; place-items:center; flex:0 0 auto; border-radius:12px; background:rgba(16,185,129,.09); color:#6ee7b7; }
        .hnc-rule-id strong { display:block; color:#edf4fb; font-size:12px; }
        .hnc-rule-id small { display:block; margin-top:3px; color:#64758a; font-size:9px; word-break:break-word; }
        .hnc-rule-fields { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:10px; }
        .hnc-rule-fields label { display:grid; gap:6px; }
        .hnc-rule-fields label > span { color:#aebed0; font-size:10px; font-weight:700; }
        .hnc-rule-fields input { width:100%; min-height:41px; padding:0 11px; border:1px solid rgba(148,163,184,.14); outline:0; border-radius:12px; background:rgba(7,15,28,.72); color:#f0f5fa; font:inherit; font-size:12px; }
        .hnc-rule-fields input:focus { border-color:rgba(52,211,153,.42); box-shadow:0 0 0 3px rgba(16,185,129,.06); }
        .hnc-rule-bottom { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .hnc-chip { min-height:34px; display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:0 10px; border:1px solid rgba(148,163,184,.14); border-radius:999px; background:rgba(15,23,42,.7); color:#8193a8; font:inherit; font-size:10px; font-weight:800; cursor:pointer; }
        .hnc-chip.on { border-color:rgba(52,211,153,.24); background:rgba(16,185,129,.11); color:#9ef0cf; }
        .hnc-chip:disabled { opacity:.35; cursor:not-allowed; }
        .hnc-spacer { flex:1; }
        .hnc-note { display:flex; gap:10px; padding:12px 14px; border:1px solid rgba(59,130,246,.22); border-radius:14px; background:rgba(30,64,175,.12); color:#dbeafe; font-size:11px; line-height:1.55; }
        .hnc-note strong { display:block; color:#fff; }
        .hnc-note span { display:block; margin-top:2px; color:#b9cbea; }
        @media (max-width:980px) { .hnc-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .hnc-toolbar { align-items:stretch; flex-direction:column; } .hnc-rule-fields { grid-template-columns:1fr; } }
        @media (max-width:620px) { .hnc-stats { grid-template-columns:1fr; } .hnc-actions { display:grid; grid-template-columns:1fr; } .hnc-rule-bottom { align-items:stretch; } .hnc-chip, .hnc-rule-bottom .hnc-btn { flex:1; } }
      `}</style>

      <div className="hnc-heading">
        <div className="hnc-heading-icon"><Bell size={22} /></div>
        <div>
          <span>Centrum notifikací</span>
          <h2>Přehled a nastavení upozornění</h2>
          <p>
            Všechny přednastavené typy notifikací pro {houseName || "vybraný dům"}.
            Každou můžeš přejmenovat, popsat, vypnout nebo určit její kanály.
          </p>
        </div>
      </div>

      <div className="hnc-stats">
        <div className="hnc-stat"><span>Celkem typů</span><strong>{stats.total}</strong><small>Přednastavené systémové události</small></div>
        <div className="hnc-stat"><span>Aktivní</span><strong>{stats.active}</strong><small>Aktuálně povolené notifikace</small></div>
        <div className="hnc-stat"><span>Push</span><strong>{channelLabel(pushNotifications, stats.push)}</strong><small>Aktivní typy s push kanálem</small></div>
        <div className="hnc-stat"><span>E-mail</span><strong>{channelLabel(emailNotifications, stats.email)}</strong><small>Aktivní typy s e-mail kanálem</small></div>
      </div>

      <div className="hnc-master">
        <div className="hnc-master-head">
          <div>
            <strong>Výchozí kanály domu</strong>
            <span>Hlavní vypínače určují, které kanály smí tento dům používat.</span>
          </div>
          <Activity size={20} />
        </div>

        <HouseChannelSwitch field="push_notifications" checked={pushNotifications} title="Push notifikace" description="Upozornění přímo v prohlížeči nebo mobilním zařízení." />
        <HouseChannelSwitch field="email_notifications" checked={emailNotifications} title="E-mailové notifikace" description="Důležitá oznámení a připomínky e-mailem." />
        <HouseChannelSwitch field="sms_notifications" checked={smsNotifications} title="SMS notifikace" description="Urgentní události přes SMS po zapojení SMS služby." />
      </div>

      <div className="hnc-toolbar">
        <div className="hnc-search">
          <Bell size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hledat podle názvu, modulu nebo klíče…" />
        </div>
        <div className="hnc-actions">
          <button className="hnc-btn" type="button" onClick={loadRules} disabled={loading || savingId !== ""}><RefreshCw size={15} />Obnovit</button>
          <button className="hnc-btn" type="button" onClick={() => setAll(true)} disabled={!canEdit || loading || savingId !== "" || !rules.length}>Zapnout vše</button>
          <button className="hnc-btn" type="button" onClick={() => setAll(false)} disabled={!canEdit || loading || savingId !== "" || !rules.length}>Vypnout vše</button>
        </div>
      </div>

      {loading ? (
        <div className="hnc-loading">Načítám přehled notifikací…</div>
      ) : filteredRules.length === 0 ? (
        <div className="hnc-empty"><CircleAlert size={22} /><strong>Žádné notifikace k zobrazení</strong><span>Spusť přiložený SQL soubor nebo uprav hledání.</span></div>
      ) : (
        <div className="hnc-list">
          {filteredRules.map((rule) => {
            const savingThis = savingId === rule.id || savingId === "__all__";
            return (
              <article className={`hnc-rule ${rule.enabled ? "on" : "off"}`} key={rule.id}>
                <div className="hnc-rule-top">
                  <div className="hnc-rule-id">
                    <div className="hnc-rule-icon"><Bell size={18} /></div>
                    <div>
                      <strong>{rule.system_name}</strong>
                      <small>{rule.module_key || "systém"} · {rule.notification_key}</small>
                    </div>
                  </div>
                  <label className="hnc-switch">
                    <input type="checkbox" checked={Boolean(rule.enabled)} onChange={(event) => updateLocal(rule.id, "enabled", event.target.checked)} disabled={!canEdit || savingThis} />
                    <span />
                  </label>
                </div>

                <div className="hnc-rule-fields">
                  <label>
                    <span>Vlastní název notifikace</span>
                    <input value={rule.display_name || ""} onChange={(event) => updateLocal(rule.id, "display_name", event.target.value)} disabled={!canEdit || savingThis} />
                  </label>
                  <label>
                    <span>Popis / k čemu slouží</span>
                    <input value={rule.description || ""} onChange={(event) => updateLocal(rule.id, "description", event.target.value)} disabled={!canEdit || savingThis} />
                  </label>
                </div>

                <div className="hnc-rule-bottom">
                  <button type="button" className={`hnc-chip ${rule.push_enabled ? "on" : ""}`} onClick={() => updateLocal(rule.id, "push_enabled", !rule.push_enabled)} disabled={!canEdit || savingThis || !pushNotifications} title={!pushNotifications ? "Push je vypnutý pro celý dům." : "Push pro tento typ"}><Smartphone size={15} />Push</button>
                  <button type="button" className={`hnc-chip ${rule.email_enabled ? "on" : ""}`} onClick={() => updateLocal(rule.id, "email_enabled", !rule.email_enabled)} disabled={!canEdit || savingThis || !emailNotifications} title={!emailNotifications ? "E-mail je vypnutý pro celý dům." : "E-mail pro tento typ"}><Mail size={15} />E-mail</button>
                  <button type="button" className={`hnc-chip ${rule.sms_enabled ? "on" : ""}`} onClick={() => updateLocal(rule.id, "sms_enabled", !rule.sms_enabled)} disabled={!canEdit || savingThis || !smsNotifications} title={!smsNotifications ? "SMS je vypnutá pro celý dům." : "SMS pro tento typ"}>SMS</button>
                  <div className="hnc-spacer" />
                  <button type="button" className="hnc-btn primary" onClick={() => saveRule(rule)} disabled={!canEdit || savingThis}>{savingId === rule.id ? "Ukládám…" : <><Save size={15} />Uložit</>}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="hnc-note">
        <CircleAlert size={18} />
        <div>
          <strong>Propojení s přednastavenými notifikacemi</strong>
          <span>
            Každá notifikace má pevný technický klíč <b>notification_key</b>. Ten se nemění,
            takže můžeš libovolně měnit zobrazovaný název a popis bez rozbití napojení.
          </span>
        </div>
      </div>
    </div>
  );
}

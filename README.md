# Správa domů

Druhá programovaná verze aplikace pro modulární správu více nemovitostí.

## Ukázkové přihlášení

- E-mail: `demo@spravadomu.cz`
- Heslo: `demo1234`

## Funkce této verze

- přihlašovací obrazovka,
- výběr domu po přihlášení,
- jeden kompletní ukázkový dům „Rezidence U Parku“,
- průvodce přidáním dalšího domu,
- přepínání mezi domy,
- modulární navigace domu,
- responzivní dashboard,
- ukázková data jasně označená štítkem,
- mobilní menu a lokální uchování přihlášení.

## Spuštění

```bash
npm install
npm run dev
```

## Produkční sestavení

```bash
npm run build
```

Přihlášení a data jsou zatím demonstrační. Další etapa je napojení na Supabase Auth, Database, Storage a Row Level Security.
# sprava-domu

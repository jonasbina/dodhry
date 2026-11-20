# DOD hry

Portál pro den otevřených dveří: návštěvníci hrají hry studentů a sbírají body.
Přihlášení jen přezdívkou, data ve Firebase Firestore. Postavené v Astru, vzhled podle `DESIGN.md`.

| Adresa | K čemu |
|---|---|
| `/` | přihlášení a přehled (body, kruh k cíli, hry) |
| `/hra/<id>/` | hra v rámu, body se připisují samy |
| `/zebricek/` | žebříček |
| `/tv/` | žebříček na projektor (dvojklik = celá obrazovka) |
| `/admin/` | PIN (výchozí `2026`): cíl, úpravy bodů, mazání, projektor |

## Vývoj
```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
```

## Kde co je
- `src/lib/games.ts` – seznam her a pravidla bodování
- `src/lib/db.ts` – Firestore (config je tam taky)
- `public/games/` – hry studentů; každá má na konci `<script src="../../bridge.js">`
- `public/bridge.js` – hlídá konec hry a pošle výsledek portálu
- `firestore.rules` – pravidla databáze (záměrně otevřená)

## Cloudflare Pages
Výstupní složku bere z `wrangler.jsonc`. V nastavení projektu musí být
**Build command `npm run build`** (Framework preset: Astro nebo None). Node verzi určuje `.nvmrc`.

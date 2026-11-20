# DOD Hry – herní portál pro den otevřených dveří

Návštěvníci hrají hry studentů a sbírají body. Přihlášení jen přezdívkou (bez hesla),
body se ukládají do Firebase Firestore, takže se dá střídat počítače.

| Stránka | K čemu |
|---|---|
| `index.html` | portál pro hráče (přihlášení, hry, body, žebříček) |
| `tv.html` | žebříček na projektor (živě, dvojklik = celá obrazovka) |
| `admin.html` | admin: PIN (výchozí `2026`), cíl bodů, úpravy bodů, mazání, odkaz na projektor |

## Jak se získávají body
Pravidla jsou v `js/config.js` (`GAMES[].points`, `MINUTE_*`). Každá hra v `games/` má na konci
`<script src="../../bridge.js">`, který hlídá koncovou obrazovku hry a pošle výsledek portálu.
Hry samotné nejsou upravené (jen v Crimson Horde je vypnutý service worker).

## Spuštění
ES moduly nefungují z `file://`, je potřeba server:
```bash
python3 -m http.server 8000   # pak http://localhost:8000
```
Bez Firebase configu běží **demo režim** (data jen v localStorage jednoho prohlížeče).

## Firebase
1. https://console.firebase.google.com → nový projekt → **Firestore Database** → Create (production mode).
2. Project settings → *Your apps* → Web (`</>`) → zkopíruj `firebaseConfig` do `js/config.js`.
3. Pravidla + hosting:
```bash
npm i -g firebase-tools
firebase login
firebase use --add            # vyber projekt
firebase deploy --only firestore:rules,hosting
```

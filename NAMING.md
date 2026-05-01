# Projekt-Namenskonventionen

## Umbenennung

- **Alter Name (deprecated):** `campaign-frontend`
- **Neuer Name:** `campaign-web`

## Bedeutung von `campaign-web`

`campaign-web` bezeichnet die browserbasierte Web-Oberfläche:

- UI für Nutzer
- Web-Client für `campaign-core`
- kein Backend-Core
- keine zentrale Domain-Logik

## Abgrenzung zu anderen Repositories

- `campaign-core` ist das separate Core/API-Repository.
- `campaign-web` konsumiert dessen API als Client.
- `campaign-app` kann zukünftig als weiterer Client (z. B. mobile App) hinzukommen.

## Deprecated-Hinweis

Alte Bezeichner wie `campaign-frontend` gelten als deprecated und sollen nur dort bestehen bleiben,
wo sie technisch zwingend für Rückwärtskompatibilität benötigt werden.

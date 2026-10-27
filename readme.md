# Celestedle

A daily Wordle-inspired guessing game based on the video game **Celeste**.

Each day, a secret element or entity from Celeste is picked for all players. Your goal is to deduce what it is in as few attempts as possible. With each attempt, you receive clues based on its attributes (type, chapters, colour and shape) to guide you toward the correct answer.

## Features

- **Daily Challenges**: a new secret Celeste entity every day at midnight (Europe/Paris timezone).
- **Hard Mode**: its own daily word, 1 hint, 8 tries, 5 minutes, no suggestions, and every guess must fit the clues you already found.
- **Detailed Attributes**: compare your guesses on **Type**, **Chapter**, **Colour** and **Shape**.
- **Hints**: *Opposite*, *Secret Info* and *1 Truth & 2 Lies*.
- **Profiles**: name, avatar and colour, personal stats and streaks, and a recovery code to play on several devices.
- **Leaderboards**: daily, weekly and all-time, for both modes.
- **Custom Synonyms**: create your own shortcuts for element names.
- **Community Statistics**: compare your scores with the other players of the day.
- **Bug Reporting**: report a mistake from the game, or vote for an existing report; reports are mirrored on Discord.

## Development

Requires Node.js 22 or later.

```bash
npm install
npm start          # http://localhost:3000
npm test           # node:test suite
npm run lint
```

Useful environment variables (`.env`):

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 3000) |
| `DATA_DIR` | Folder for the SQLite database and v1 JSON files (default `data/`) |
| `RANDOM_SEED` | Seed of the daily word draw |
| `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` | Used once to make a player profile the site owner (in clear or as a bcrypt hash) |
| `DISCORD_BOT_TOKEN` | Enables the Discord bot for bug reports |
| `CORS_ORIGINS` | Extra allowed origins, comma separated |
| `SYNC_TOKEN` | Shared secret: on prod, lets the beta read `/api/sync/export`; on the beta, sent with that request |
| `SYNC_SOURCE_URL` | Beta only: prod URL to copy admin-edited elements and Connections tags from at startup |
| `PERMANENT_OWNER_TOKEN` | Beta only: recovery code of a profile recreated as owner at startup (16+ characters) |
| `PERMANENT_OWNER_NAME` | Name of that profile (default `Amélia`) |

Elements live in `db.json` (attributes), `public/assets/entities/mapping.json` (sprites) and `aliases.json` (official synonyms). They are copied into the database at startup, except elements edited from the admin page.

## Community & Support

Join our official Discord server to share your daily scores, report bugs, discuss strategies, and stay updated with the latest features:

👉 [Join the Celestedle Discord](https://discord.gg/3yqgMbuMbX)

## Contributing

Celestedle is an open project built by and for Celeste fans! If you encounter any bugs, have suggestions for new attributes, or want to contribute (especially for entity visuals and artwork), feel free to join our Discord server or open an issue.

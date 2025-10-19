CREATE TABLE IF NOT EXISTS mappings (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slack_channel TEXT NOT NULL UNIQUE,
    discord_channel TEXT NOT NULL UNIQUE,
    discord_webhook TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mappings_slack_channel ON mappings (slack_channel);
CREATE INDEX IF NOT EXISTS idx_mappings_discord_channel ON mappings (discord_channel);

CREATE TABLE IF NOT EXISTS users (
    slack_id TEXT NOT NULL PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users (discord_id);

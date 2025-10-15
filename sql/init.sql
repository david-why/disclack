CREATE TABLE IF NOT EXISTS mappings (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slack_channel TEXT NOT NULL,
    discord_channel TEXT NOT NULL,
    discord_webhook TEXT NOT NULL,
    UNIQUE (slack_channel, discord_channel)
)

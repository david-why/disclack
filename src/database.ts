import { sql } from 'bun'
import type { Snowflake } from 'discord.js'

export interface DBMapping {
  id: number
  slack_channel: string
  discord_channel: Snowflake
  discord_webhook: Snowflake
}

export async function ensureInit() {
  await sql.file('sql/init.sql')
}

export async function getMappingBySlack(channel: string) {
  const entries = await sql<
    DBMapping[]
  >`SELECT * FROM mappings WHERE slack_channel = ${channel}`
  return entries[0]
}

export async function getMappingByDiscord(channel: Snowflake) {
  const entries = await sql<
    DBMapping[]
  >`SELECT * FROM mappings WHERE discord_channel = ${channel}`
  return entries[0]
}

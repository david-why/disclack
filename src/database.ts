import { sql } from 'bun'
import type { Snowflake } from 'discord.js'

export interface DBDiscordServer {
  id: Snowflake
  role_id: Snowflake | null
}

export interface DBMapping {
  id: number
  slack_channel: string
  discord_channel: Snowflake
  discord_webhook: Snowflake
}

export interface DBUser {
  slack_id: string
  discord_id: Snowflake
}

export async function ensureInit() {
  await sql.file('sql/init.sql')
}

export async function getDiscordServer(id: Snowflake) {
  const entries = await sql<
    DBDiscordServer[]
  >`SELECT * FROM discord_servers WHERE id = ${id}`
  return entries[0]
}

export async function insertDiscordServer(server: DBDiscordServer) {
  await sql`INSERT INTO discord_servers ${sql(server)}`
  return server
}

export async function updateDiscordServer(server: DBDiscordServer) {
  const data = { ...server, id: undefined }
  delete data.id
  await sql`UPDATE discord_servers SET ${sql(data)} WHERE id = ${server.id}`
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

export async function insertMapping(mapping: Omit<DBMapping, 'id'>) {
  await sql`INSERT INTO mappings ${sql(mapping)}`
}

export async function deleteMappingByDiscord(channel: Snowflake) {
  await sql`DELETE FROM mappings WHERE discord_channel = ${channel}`
}

export async function getUserBySlack(user: string) {
  const entries = await sql<
    DBUser[]
  >`SELECT * FROM users WHERE slack_id = ${user}`
  return entries[0]
}

export async function getUserByDiscord(user: Snowflake) {
  const entries = await sql<
    DBUser[]
  >`SELECT * FROM users WHERE discord_id = ${user}`
  return entries[0]
}

export async function insertUser(user: DBUser) {
  await sql`INSERT INTO users ${sql(user)}`
}

export async function deleteUserByDiscord(user: Snowflake) {
  await sql`DELETE FROM users WHERE discord_id = ${user}`
}

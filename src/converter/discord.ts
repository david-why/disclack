// from discord to slack

import { GuildChannel } from 'discord.js'
import { discord } from '../..'
import { getMappingByDiscord, getUserByDiscord } from '../database'

export async function discordToSlack(markdown: string) {
  // this still returns markdown, NOT mrkdwn!
  const replacements: Record<string, string> = {}
  for (const match of markdown.matchAll(/<@([0-9]+)>/g)) {
    const [segment, userId] = match
    if (replacements[segment]) continue
    if (!userId) continue
    const user = await getUserByDiscord(userId)
    if (user) {
      replacements[segment] = `<@${user.slack_id}>`
    } else {
      const discordUser = await discord.users.fetch(userId)
      replacements[segment] = `@${discordUser.displayName}`
    }
  }
  for (const match of markdown.matchAll(/<#([0-9]+)>/g)) {
    const [segment, channelId] = match
    if (replacements[segment]) continue
    if (!channelId) continue
    const mapping = await getMappingByDiscord(channelId)
    if (mapping) {
      replacements[segment] = `<#${mapping.slack_channel}>`
    } else {
      const discordChannel = await discord.channels.fetch(channelId)
      if (discordChannel && discordChannel instanceof GuildChannel) {
        replacements[segment] = `#${discordChannel.name}`
      } else {
        replacements[segment] = `#(unknown)`
      }
    }
  }
  for (const [old, repl] of Object.entries(replacements)) {
    markdown = markdown.replaceAll(old, repl)
  }
  return markdown
}

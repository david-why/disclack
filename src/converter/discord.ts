// from discord to slack

import { discord } from '../..'
import { getUserByDiscord } from '../database'

export async function discordToSlack(markdown: string) {
  // this still returns markdown, NOT mrkdwn!
  const replacements: Record<string, string> = {}
  for (const match of markdown.matchAll(/<@([0-9]+)>/g)) {
    const [segment, userId] = match
    if (!userId) continue
    const user = await getUserByDiscord(userId)
    if (user) {
      replacements[segment] = `<@${user.slack_id}>`
    } else {
      const discordUser = await discord.users.fetch(userId)
      replacements[segment] = `@${discordUser.displayName}`
    }
  }
  return markdown
}

import { LogLevel, App as SlackClient } from '@slack/bolt'
import type { KnownBlock } from '@slack/types'
import { AttachmentBuilder } from 'discord.js'
import { Stream } from 'stream'
import { SlackCache } from '../caches'
import { blocksToDiscord, mrkdwnToDiscord } from '../converter/slack'
import { getMappingBySlack } from '../database'
import { getSlackUserDisplayFields } from '../utils'
import { discord } from './discord'

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_PORT } = process.env

if (!SLACK_APP_TOKEN || !SLACK_BOT_TOKEN) {
  throw new Error('.env not set up correctly...')
}

export const slack = new SlackClient({
  token: SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG,
})

const slackCache = new SlackCache(slack)

slack.message(async (event) => {
  const { message } = event
  if (!message.subtype || message.subtype === 'file_share') {
    const mapping = await getMappingBySlack(message.channel)
    if (!mapping) return
    const mrkdwn = message.text
    console.log('slack message   ', message.channel, mrkdwn)
    const [user, webhook] = await Promise.all([
      slackCache.getUser(message.user),
      discord.fetchWebhook(mapping.discord_webhook),
    ])
    const downloadedFiles = await Promise.all(
      (message.files || []).map(downloadFileFromSlack)
    )
    const files: AttachmentBuilder[] = downloadedFiles.map(
      (f) =>
        new AttachmentBuilder(Stream.Readable.from(f.content), {
          name: f.name || undefined,
        })
    )
    await webhook.send({
      content: message.blocks
        ? await blocksToDiscord(message.blocks as KnownBlock[])
        : mrkdwn && mrkdwnToDiscord(mrkdwn),
      files,
      ...getSlackUserDisplayFields(user.user),
    })
  }
})

async function downloadFileFromSlack(file: {
  url_private_download?: string
  name: string | null
}) {
  const content = await fetch(file.url_private_download!, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
  }).then((r) => r.body!)
  return { ...file, content }
}

// startup

export async function startSlack() {
  await slack.start(SLACK_PORT || 9000)
  console.log('Slack started!')
}

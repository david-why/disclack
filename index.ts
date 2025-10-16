import { LogLevel, App as SlackClient } from '@slack/bolt'
import type { KnownBlock } from '@slack/types'
import type { FileUploadComplete } from '@slack/web-api/dist/types/request/files'
import { AttachmentBuilder, Client as DiscordClient } from 'discord.js'
import { Stream } from 'stream'
import { SlackCache } from './src/caches'
import { getSlackUserDisplayFields } from './src/utils'
import {
  ensureInit,
  getMappingByDiscord,
  getMappingBySlack,
} from './src/database'
import { blocksToDiscord, mrkdwnToDiscord } from './src/converter'

const { DISCORD_TOKEN, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_PORT } =
  process.env

if (!DISCORD_TOKEN || !SLACK_APP_TOKEN || !SLACK_BOT_TOKEN) {
  throw new Error('.env not set up correctly...')
}

// discord

const discord = new DiscordClient({
  intents: [
    'Guilds',
    'MessageContent',
    'GuildMessages',
    'GuildMessageReactions',
  ],
})

discord.once('clientReady', (readyClient) => {
  console.log(`Discord ready! Logged in as ${readyClient.user.tag}`)
})

discord.on('error', (error) => {
  console.error(error)
})

discord.on('warn', (warning) => {
  console.warn(warning)
})

discord.on('debug', (message) => {
  console.debug(message)
})

discord.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.system) return
  const mapping = await getMappingByDiscord(message.channelId)
  if (!mapping) return
  const text = message.content
  console.log('discord message ', message.channelId, text)
  // here's the logic in case i forget:
  // - if there are files, upload the files and send blocks as part of files.uploadV2
  // - if there are no files, just send the blocks
  // NEVER MIND we're gonna send blocks in any case so that we can use username and icon_url
  const blocks: KnownBlock[] = [
    {
      type: 'markdown',
      text: text,
    },
  ]
  let previewText = text
  if (message.attachments.size) {
    const slackFiles = await Promise.all(
      message.attachments.values().map(downloadAttachmentFromDiscord)
    )
    const uploadedSpecs = await Promise.all(slackFiles.map(uploadFileToSlack))
    const uploadedFiles = await slack.client.files.completeUploadExternal({
      files: uploadedSpecs as [FileUploadComplete, ...FileUploadComplete[]],
    })
    const content = uploadedFiles
      .files!.map((f) => `<${f.permalink}| >`)
      .join(' ')
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: content,
      },
    })
    // for some reason this magically makes slack work
    previewText += '\n' + content
  }
  await slack.client.chat.postMessage({
    channel: mapping.slack_channel,
    text: previewText,
    blocks,
    icon_url: message.author.avatarURL() || message.author.defaultAvatarURL,
    username: message.author.displayName,
  })
})

async function downloadAttachmentFromDiscord({
  url,
  name,
  title,
  size,
}: {
  url: string
  name: string
  title: string | null
  size: number
}) {
  return {
    file: await fetch(url).then((r) => r.body!),
    filename: name,
    title: title || undefined,
    size,
  }
}

async function uploadFileToSlack({
  file,
  filename,
  title,
  size,
}: {
  file: ReadableStream
  filename: string
  title?: string
  size: number
}) {
  const { upload_url, file_id } = await slack.client.files.getUploadURLExternal(
    {
      length: size,
      filename,
    }
  )
  if (!upload_url) return null
  const res = await fetch(upload_url, {
    method: 'POST',
    body: file,
  })
  if (!res.ok) {
    throw new Error('Failed to upload actual file')
  }
  return { title: title || filename, id: file_id! }
}

// slack

const slack = new SlackClient({
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
        ? blocksToDiscord(message.blocks as KnownBlock[])
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

async function startDiscord() {
  await discord.login(DISCORD_TOKEN)
  console.log('Discord started!')
}

async function startSlack() {
  await slack.start(SLACK_PORT || 9000)
  console.log('Slack started!')
}

startDiscord()
startSlack()
ensureInit()

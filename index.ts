import { AttachmentBuilder, Client as DiscordClient } from 'discord.js'
import { LogLevel, App as SlackClient } from '@slack/bolt'
import { SlackCache } from './src/caches'
import { getSlackUserDisplayFields } from './src/utils'
import type { KnownBlock } from '@slack/types'
import type { FileUploadComplete } from '@slack/web-api/dist/types/request/files'

const {
  DISCORD_TOKEN,
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  SLACK_PORT,
  SLACK_CHANNEL,
  DISCORD_WEBHOOK,
} = process.env

if (!DISCORD_TOKEN) {
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
  const text = message.content
  console.log('discord message ', message.channelId, text)
  if (SLACK_CHANNEL) {
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
      console.log('got files from discord', slackFiles)
      const uploadedSpecs = await Promise.all(slackFiles.map(uploadFileToSlack))
      console.log('uploaded files to slack', uploadedSpecs)
      const uploadedFiles = await slack.client.files.completeUploadExternal({
        files: uploadedSpecs as [FileUploadComplete, ...FileUploadComplete[]],
      })
      console.log(uploadedFiles)
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
      channel: SLACK_CHANNEL,
      text: previewText,
      blocks,
      icon_url: message.author.avatarURL() || message.author.defaultAvatarURL,
      username: message.author.displayName,
    })
  }
})

async function downloadAttachmentFromDiscord({
  url,
  name,
  title,
}: {
  url: string
  name: string
  title: string | null
}) {
  return {
    file: await fetch(url)
      .then((r) => r.arrayBuffer())
      .then(Buffer.from),
    filename: name,
    title: title || undefined,
  }
}

async function uploadFileToSlack({
  file,
  filename,
  title,
}: {
  file: Buffer
  filename: string
  title?: string
}) {
  const { upload_url, file_id } = await slack.client.files.getUploadURLExternal(
    {
      length: file.byteLength,
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
  console.log('*****', await res.text())
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
    const text = message.text
    console.log('slack message   ', message.channel, text)
    if (DISCORD_WEBHOOK) {
      const [user, webhook] = await Promise.all([
        slackCache.getUser(message.user),
        discord.fetchWebhook(DISCORD_WEBHOOK),
      ])
      const files: AttachmentBuilder[] = []
      for (const file of message.files || []) {
        console.log(file)
        const content = await fetch(file.url_private_download!, {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          },
        }).then((r) => r.arrayBuffer())
        files.push(
          new AttachmentBuilder(Buffer.from(content)).setName(file.name || '')
        )
      }
      await webhook.send({
        content: text,
        files,
        ...getSlackUserDisplayFields(user.user),
      })
    }
  }
})

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

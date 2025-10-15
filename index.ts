import { AttachmentBuilder, Client as DiscordClient } from 'discord.js'
import { App as SlackClient } from '@slack/bolt'
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

discord.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.system) return
  const text = message.content
  console.log('discord message ', message.channelId, text)
  if (SLACK_CHANNEL) {
    // here's the logic in case i forget:
    // - if there are files, upload the files and send blocks as part of files.uploadV2
    // - if there are no files, just send the blocks
    const blocks: KnownBlock[] = [
      {
        type: 'markdown',
        text: text,
      },
    ]
    if (message.attachments.size) {
      // for (const [id, attachment] of message.attachments) {
      //   const arrayBuffer = await fetch(attachment.url).then((r) =>
      //     r.arrayBuffer()
      //   )
      //   const res1 = await slack.client.files.getUploadURLExternal({
      //     length: attachment.size,
      //     filename: attachment.name,
      //   })
      //   console.log(res1)
      //   const uploadUrl = res1.upload_url!
      //   const res2 = await fetch(uploadUrl, {
      //     method: 'POST',
      //     body: arrayBuffer,
      //   })
      //   if (!res2.ok) {
      //     throw new Error('Failed to upload actual file')
      //   }
      //   console.log(await res2.text())
      //   const res3 = await slack.client.files.completeUploadExternal({
      //     files: [{ id: res1.file_id!, title: attachment.title || undefined }],
      //   })
      //   console.log(res3)
      //   const permalink = res3.files?.[0]?.permalink
      // }
      const files = await Promise.all(
        message.attachments
          .values()
          .toArray()
          .map((a) =>
            (async () => ({
              file: await fetch(a.url)
                .then((r) => r.arrayBuffer())
                .then(Buffer.from),
              filename: a.name,
              title: a.title || undefined,
            }))()
          )
      )
      const filesWithId: FileUploadComplete[] = await Promise.all(
        files.map((f) =>
          (async () => ({ title: f.title, id: await uploadToSlackHelper(f) }))()
        )
      )
      console.log(files)
      await slack.client.files.completeUploadExternal({
        files: filesWithId as [FileUploadComplete, ...FileUploadComplete[]],
        initial_comment: text,
        channel_id: SLACK_CHANNEL,
      })
    } else {
      await slack.client.chat.postMessage({
        channel: SLACK_CHANNEL,
        text: text,
        blocks,
        icon_url: message.author.avatarURL() || message.author.defaultAvatarURL,
        username: message.author.displayName,
      })
    }
  }
})

async function uploadToSlackHelper({
  file,
  filename,
}: {
  file: Buffer
  filename: string
}) {
  const res1 = await slack.client.files.getUploadURLExternal({
    length: file.byteLength,
    filename,
  })
  console.log(res1)
  const uploadUrl = res1.upload_url!
  const res2 = await fetch(uploadUrl, {
    method: 'POST',
    body: file,
  })
  if (!res2.ok) {
    throw new Error('Failed to upload actual file')
  }
  return res1.file_id!
}

// slack

const slack = new SlackClient({
  token: SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
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

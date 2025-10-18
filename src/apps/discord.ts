import type { KnownBlock } from '@slack/types'
import type { FileUploadComplete } from '@slack/web-api/dist/types/request/files'
import {
  ChatInputCommandInteraction,
  Client as DiscordClient,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import { discordToSlack } from '../converter/discord'
import {
  getMappingByDiscord,
  getUserByDiscord,
  getUserBySlack,
} from '../database'
import { slack } from './slack'

const { DISCORD_TOKEN } = process.env

if (!DISCORD_TOKEN) {
  throw new Error('.env not set up correctly...')
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('auth')
      .setDescription('Link your Discord user with your Slack user')
      .addStringOption((b) =>
        b.setName('user').setDescription('Your Slack user ID').setRequired(true)
      ),
    execute: authCommand,
  },
]

export const discord = new DiscordClient({
  intents: [
    'Guilds',
    'MessageContent',
    'GuildMessages',
    'GuildMessageReactions',
  ],
})

discord.once('clientReady', async (client) => {
  console.log(`Discord ready! Logged in as ${client.user.tag}`)
  console.log(`Discord: Registering ${commands.length} slash commands`)
  await client.rest.put(Routes.applicationCommands(client.application.id), {
    body: commands.map((c) => c.data.toJSON()),
  })
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

// message event

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
      text: await discordToSlack(text),
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

// commands

discord.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = commands.find((c) => c.data.name === interaction.commandName)
    if (cmd) {
      await cmd.execute(interaction)
    }
  }
})

async function authCommand(interaction: ChatInputCommandInteraction) {
  const slackUserId = interaction.options.getString('user', true)
  if (!slackUserId.match(/^U[A-Z0-9]+$/)) {
    await interaction.reply({
      flags: 'Ephemeral',
      content: 'The Slack ID you typed was invalid.',
    })
  }
  await interaction.deferReply({ flags: 'Ephemeral' })
  const discordUserId = interaction.user.id
  const [discordUserInfo, slackUserInfo] = await Promise.all([
    getUserByDiscord(discordUserId),
    getUserBySlack(slackUserId),
  ])
  if (discordUserInfo) {
    await interaction.editReply(
      `:x: Your Discord is already linked to Slack user \`${discordUserInfo.slack_id}\`!`
    )
    return
  }
  if (slackUserInfo) {
    await interaction.editReply(
      `:x: This Slack user is already linked to <@${slackUserInfo.discord_id}>!`
    )
    return
  }
  try {
    const openChannelResponse = await slack.client.conversations.open({
      users: slackUserId,
    })
    if (!openChannelResponse.channel?.id) {
      throw new Error(
        `Failed to open an IM: ${JSON.stringify(openChannelResponse)}`
      )
    }
    await slack.client.chat.postMessage({
      channel: openChannelResponse.channel.id,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: `Someone requested to link your Slack account with this Discord account: @${interaction.user.displayName} (username: ${interaction.user.username}#${interaction.user.discriminator}).\n* If this was you, please click the button below to verify.\n* If this wasn't you, you can safely ignore this message.`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: `discord_approve_${discordUserId}`,
              text: { type: 'plain_text', text: '✅ Approve' },
              style: 'primary',
            },
          ],
        },
      ],
    })
  } catch (e) {
    console.error(`Error sending verification message to Slack: ${e}`)
    await interaction.editReply(
      ':x: Failed to send verification message to Slack. Please try again later.'
    )
    return
  }
  // try {
  //   await insertUser({
  //     slack_id: slackUserId,
  //     discord_id: discordUserId,
  //   })
  // } catch (e) {
  //   console.error('Error while inserting user from Discord', e)
  //   await interaction.editReply(
  //     `:x: An error occurred. Please try again later :(`
  //   )
  //   return
  // }
  await interaction.editReply(
    ':watch: Please check your Slack account for a DM from @disclack to verify.'
  )
}

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

export async function startDiscord() {
  await discord.login(DISCORD_TOKEN)
  console.log('Discord started!')
}

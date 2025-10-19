import type { KnownBlock } from '@slack/types'
import type { FileUploadComplete } from '@slack/web-api/dist/types/request/files'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client as DiscordClient,
  InteractionContextType,
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import { discordToSlack } from '../converter/discord'
import {
  deleteMappingByDiscord,
  deleteUserByDiscord,
  getMappingByDiscord,
  getMappingBySlack,
  getUserByDiscord,
  getUserBySlack,
  insertMapping,
} from '../database'
import { slack } from './slack'

const { DISCORD_TOKEN, DISCORD_ROLE } = process.env

if (!DISCORD_TOKEN) {
  throw new Error('.env not set up correctly...')
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your Discord user with your Slack user')
      .setContexts(InteractionContextType.Guild)
      .addStringOption((b) =>
        b.setName('user').setDescription('Your Slack user ID').setRequired(true)
      ),
    execute: linkCommand,
  },
  {
    data: new SlashCommandBuilder()
      .setName('connect')
      .setDescription('Connect a Discord channel with a Slack channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setContexts(InteractionContextType.Guild)
      .addChannelOption((b) =>
        b
          .setName('channel')
          .setDescription('Discord channel to connect')
          .setRequired(true)
      )
      .addStringOption((b) =>
        b
          .setName('slack-channel')
          .setDescription('ID of Slack channel to connect')
          .setRequired(true)
      ),
    execute: connectCommand,
  },
  {
    data: new SlashCommandBuilder()
      .setName('unlink')
      .setDescription('Unlink your Discord user with your Slack user')
      .setContexts(InteractionContextType.Guild),
    execute: unlinkCommand,
  },
  {
    data: new SlashCommandBuilder()
      .setName('disconnect')
      .setDescription('Disconnect a Discord channel with Slack')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setContexts(InteractionContextType.Guild)
      .addChannelOption((b) =>
        b
          .setName('channel')
          .setDescription('Discord channel to disconnect')
          .setRequired(true)
      ),
    execute: disconnectCommand,
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

async function linkCommand(interaction: ChatInputCommandInteraction) {
  const slackUserId = interaction.options.getString('user', true)
  if (!slackUserId.match(/^U[A-Z0-9]+$/)) {
    await interaction.reply({
      flags: 'Ephemeral',
      content: 'The Slack ID you typed was invalid.',
    })
    return
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
    if (!openChannelResponse.ok) {
      throw new Error(
        `Failed to open an IM: ${JSON.stringify(openChannelResponse)}`
      )
    }
    await slack.client.chat.postMessage({
      channel: openChannelResponse.channel!.id!,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: `Someone requested to link your Slack account with this Discord account: @${interaction.user.displayName} (username: ${interaction.user.tag}).\n* If this was you, please click the button below to verify.\n* If this wasn't you, you can safely ignore this message.`,
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
  await interaction.editReply(
    ':watch: Please check your Slack account for a DM from @disclack to verify.'
  )
}

async function connectCommand(interaction: ChatInputCommandInteraction) {
  const { id: discordChannelId, type: discordChannelType } =
    interaction.options.getChannel('channel', true)
  const slackChannelId = interaction.options.getString('slack-channel', true)
  if (!slackChannelId.match(/^C[0-9A-Z]+$/)) {
    await interaction.reply({
      flags: 'Ephemeral',
      content: 'The Slack channel ID you typed was invalid.',
    })
    return
  }
  if (discordChannelType !== ChannelType.GuildText) {
    await interaction.reply({
      flags: 'Ephemeral',
      content: 'You can only connect a Discord text channel.',
    })
    return
  }
  await interaction.deferReply({ flags: 'Ephemeral' })
  const [user, slackChannel, discordChannel, slackMapping, discordMapping] =
    await Promise.all([
      getUserByDiscord(interaction.user.id),
      (async () => {
        try {
          return await slack.client.conversations.info({
            channel: slackChannelId,
          })
        } catch {
          return { ok: false }
        }
      })(),
      discord.channels.fetch(discordChannelId),
      getMappingBySlack(slackChannelId),
      getMappingByDiscord(discordChannelId),
    ])
  if (discordChannel?.type !== ChannelType.GuildText) {
    throw new Error('channel type sanity check failed')
  }
  if (!user) {
    await interaction.editReply(
      'You must link yourself with the /link command before you can connect channels.'
    )
    return
  }
  if (!slackChannel?.ok) {
    await interaction.editReply(
      'The Slack channel you typed does not exist or is private and the bot is not invited.'
    )
    return
  }
  if (discordMapping) {
    await interaction.editReply(
      `The Discord channel is already linked to the Slack channel \`${discordMapping.slack_channel}\`.`
    )
    return
  }
  if (slackMapping) {
    await interaction.editReply(
      `The Slack channel is already linked to a Discord channel (<#${slackMapping.discord_channel}>).`
    )
    return
  }
  if (user.slack_id !== slackChannel.channel?.creator) {
    await interaction.editReply(
      'You have to be the channel creator to link a channel.'
    )
    return
  }
  if (!slackChannel.channel?.is_member) {
    try {
      await slack.client.conversations.join({ channel: slackChannelId })
    } catch (e) {
      console.error(`Failed to join channel: ${e}`)
      await interaction.editReply(
        'Failed to join the channel. Please invite the @disclack bot to the Slack channel, then try again.'
      )
      return
    }
  }
  const webhook = await discordChannel.createWebhook({
    name: `disclack connection to #${
      slackChannel.channel?.name || '(unknown)'
    }`,
  })
  try {
    await insertMapping({
      slack_channel: slackChannelId,
      discord_channel: discordChannelId,
      discord_webhook: webhook.id,
    })
  } catch (e) {
    console.error(`Failed to create channel mapping from Discord: ${e}`)
    await interaction.editReply(
      'Failed to create the channel mapping. Please try again later.'
    )
    return
  }
  await interaction.editReply(
    ':white_check_mark: Successfully created channel connection!'
  )
}

async function unlinkCommand(interaction: ChatInputCommandInteraction) {
  const response = await interaction.deferReply({
    flags: 'Ephemeral',
    withResponse: true,
  })
  const userInfo = await getUserByDiscord(interaction.user.id)
  if (!userInfo) {
    await interaction.editReply(
      'Your Slack account is not linked. Nothing to do.'
    )
    return
  }
  await interaction.editReply({
    content: `Are you sure you want to unlink your Slack account?${
      DISCORD_ROLE ? ` This will remove the <@&${DISCORD_ROLE}> role too.` : ''
    }`,
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('confirm')
            .setStyle(ButtonStyle.Danger)
            .setLabel('Yes, unlink')
        )
        .toJSON(),
    ],
  })
  try {
    await response.resource!.message!.awaitMessageComponent({ time: 300000 })
  } catch {
    await interaction.editReply({
      content: 'Confirmation timed out. Please try again.',
      components: [],
    })
    return
  }
  await deleteUserByDiscord(interaction.user.id)
  if (DISCORD_ROLE) {
    const member = await interaction.guild!.members.fetch(interaction.user.id)
    await member.roles.remove(DISCORD_ROLE)
  }
  await interaction.editReply({
    content: ':white_check_mark: Successfully unlinked your account.',
    components: [],
  })
}

async function disconnectCommand(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel('channel', true)
  await interaction.deferReply({ flags: 'Ephemeral' })
  const mapping = await getMappingByDiscord(channel.id)
  if (!mapping) {
    await interaction.editReply(
      ':x: The channel specified is not connected to Slack.'
    )
    return
  }
  // TODO: make a confirmation thingy like /unlink
  await deleteMappingByDiscord(channel.id)
  await interaction.editReply(
    `:white_check_mark: Succesfully disconnected <#${channel.id}> with Slack.`
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

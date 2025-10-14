import { Client as DiscordClient } from 'discord.js'
import { App as SlackClient } from '@slack/bolt'

const {
  DISCORD_TOKEN,
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  SLACK_PORT,
  SLACK_CHANNEL,
  DISCORD_GUILD,
  DISCORD_CHANNEL,
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

discord.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.system) return
  const text = message.content
  console.log('discord message ', message.channelId, text)
  if (SLACK_CHANNEL) {
    await slack.client.chat.postMessage({
      channel: SLACK_CHANNEL,
      markdown_text: text,
    })
  }
})

// slack

const slack = new SlackClient({
  token: SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
})

slack.message(async (event) => {
  const { message } = event
  if (!message.subtype || message.subtype === 'file_share') {
    const text = message.text
    console.log('slack message   ', message.channel, text)
    if (DISCORD_GUILD && DISCORD_CHANNEL) {
      const guild = await discord.guilds.fetch(DISCORD_GUILD)
      const channel = await guild.channels.fetch(DISCORD_CHANNEL)
      if (channel?.isSendable()) {
        await channel.send(text || '?')
      }
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

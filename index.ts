import { Client as DiscordClient } from 'discord.js'
import { App as SlackClient } from '@slack/bolt'

const { DISCORD_TOKEN, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_PORT } =
  process.env

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
  console.log('discord message ', message.channelId, message.content)
})

// slack

const slack = new SlackClient({
  token: SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
})

slack.message(async (event) => {
  const { message } = event
  if (!message.subtype || message.subtype === 'bot_message') {
    const text = message.text
    console.log('slack message   ', message.channel, text)
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

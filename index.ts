import { Client as DiscordClient } from 'discord.js'
import { App as SlackClient } from '@slack/bolt'
import { SlackCache } from './src/caches'
import { getSlackUserDisplayFields } from './src/utils'
import 'global-agent/bootstrap'

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
    await slack.client.chat.postMessage({
      channel: SLACK_CHANNEL,
      markdown_text: text,
      icon_url: message.author.avatarURL() || message.author.defaultAvatarURL,
      username: message.author.displayName,
    })
  }
})

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
      const user = await slackCache.getUser(message.user)
      const webhook = await discord.fetchWebhook(DISCORD_WEBHOOK)
      await webhook.send({
        content: text || '?',
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

import { startSlack, slack } from './src/apps/slack'
import { startDiscord, discord } from './src/apps/discord'
import { ensureInit } from './src/database'

ensureInit()
startDiscord()
startSlack()

export { slack, discord }

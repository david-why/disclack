# Disclack = Discord + Slack

A bridge that links Discord channels with Slack channels.

## Demo

You can watch the [demo video here](https://hc-cdn.hel1.your-objectstorage.com/s/v3/f268e572d78cdbc88d9f577eb0a331b513b31125_demo.mp4)!

## Features

- [x] Forward messages between Discord and Slack
- [x] Reupload files
- [x] Username and avatar matching
- [ ] Management commands
  - [x] Discord `/link`, `/unlink`, `/connect`, `/disconnect`
  - [ ] Slack `/link`, `/unlink`, `/connect`, `/disconnect`
- [ ] Formatting _(almost done, some minor bugs)_
- [ ] Create threads
- [ ] Forward reactions
- [ ] More features??

## Usage

1. You must be a Hack Clubber in the [Hack Club Slack](https://hackclub.com/slack).
2. Join my Discord server (the invite is in the [#disclack channel](https://hackclub.slack.com/archives/C09KW1QLF39) on Slack).
3. Head to the `#slack-verify` channel and use the `/link` command to link your Slack account.
4. Send messages in the `#disclack-connect` channel on Discord or Slack, and see them appear on the other platform!
5. Use the `/connect` and `/disconnect` commands to connect and disconnect channels. (Please don't mess up my server though...)

## Self-hosting instructions

You might not need to self-host - you can invite the bot to another server, and it will Just Work™️! But if you do want to self-host, here's how you can host your own copy of the bot:

### Discord app setup

1. Create an app on the [Discord Developer Portal](https://discord.com/developers/applications).
2. On the "Installation" tab, in the "Default Install Settings" section at the bottom, choose the `application.commands` and `bot` scopes, and the following permissions:
   1. `Add Reactions`: Used to forward reactions (not implemented yet).
   2. `Manage Roles`: Used to add a role when a user links their Slack account (optional).
   3. `Manage Webhooks`: Used to create a webhook, which can set a custom username and avatar (bots can't do that).
   4. `Attach Files`, `Read Message History`, `Send Messages`, `Create Public Threads`, `Send Messages in Threads`, `View Channels`: Should be self-explanatory.
3. Copy the Discord Provided Install Link and open it to install the bot on a server on which you have the Manage Server permission.
4. On the "Bot" tab, click "Reset Token" and save the bot token that appears.

### Slack app setup

1. Create an app on the [Slack API website](https://api.slack.com/apps).
2. On the "Socket Mode" tab, turn on "Enable Socket Mode" which will prompt you to generate an app-level token. Make sure you save this.
3. On the "Event Subscriptions" tab, turn on "Enable Events", and choose the following under "Subscribe to bot events":
   1. `message.channel`, `message.groups`: Listen to messages in public and private channels.
   2. `reaction_added`, `reaction_removed`: Listen to reaction events (not used yet).
4. On the "OAuth & Permissions" tab, under "Bot Token Scopes", add the following scopes (in addition to the ones already there):
   1. `channels:join`: Join public channels when connected.
   2. `channels:read`, `groups:read`, `users:read`, `users.profile:read`: Read info (mostly names) of public channels, private channels, and users.
   3. `chat:write`, `chat:write.customize`: Send messages and use custom avatars and usernames.
   4. `files:read`, `files:write`: Download and send files.
   5. `im:write`: DM users to verify their linking requests.
   6. `reactions:write`: Add reactions (not used yet).
5.  Refresh the page, and on the top of the screen, click the "Install to (Slack team name)" button. Save the "Bot User OAuth Token" after you complete the OAuth flow.

### Run the repo

1. Clone this repository and copy `.env.example` to `.env.local`. Change the values from the defaults. (See the example file for more details)
2. Run `bun i` and `bun index.ts` to start.

If all goes well, you should see "Slack started!" and "Discord started!" among other lines of output. Now you can use the commands to link your accounts, connect channels, and have fun :yay:

## Technical details

This project uses [Bun](https://bun.com), the best JS runtime, package manager, testing framework, and well, in general the best. It makes so many things so much easier.

[Discord.js](https://discord.js.org) was used to interface with Discord's API, and Slack's official [Bolt for Javascript](https://docs.slack.dev/tools/bolt-js/) was used to interact with Slack.

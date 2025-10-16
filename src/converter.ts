import { escapeHTML } from 'bun'
import { toHTML as discordToHTMLBase } from 'discord-markdown'
import { toHTML as mrkdwnToHTMLBase } from 'slack-markdown'

export function mrkdwnToHTML(mrkdwn: string) {
  return mrkdwnToHTMLBase(mrkdwn, {
    slackCallbacks: {
      user: ({ id, name }) => `<user id="${id}">${escapeHTML(name)}</user>`,
      channel: ({ id, name }) =>
        `<channel id="${id}">${escapeHTML(name)}</channel>`,
      usergroup: ({ id, name }) =>
        `<usergroup id="${id}">${escapeHTML(name)}</usergroup>`,
      atHere: ({ name }) => `<athere>${escapeHTML(name)}</athere>`,
      atChannel: ({ name }) => `<atchannel>${escapeHTML(name)}</atchannel>`,
      atEveryone: ({ name }) => `<ateveryone>${escapeHTML(name)}</ateveryone>`,
      date: ({ timestamp, format, link, fallback }) =>
        `<fmtdate ts="${escapeHTML(timestamp)}" format="${escapeHTML(format)}"${
          link ? ` href="${escapeHTML(link)}"` : ''
        }>${escapeHTML(fallback)}</fmtdate>`,
    },
  })
}

export function mrkdwnToDiscord(mrkdwn: string) {
  console.log(mrkdwnToHTML(mrkdwn))
  return mrkdwn
}

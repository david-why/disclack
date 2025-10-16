import type {
  KnownBlock,
  RichTextBlock,
  RichTextBlockElement,
  RichTextElement,
  RichTextStyleable,
} from '@slack/types'
import { slack } from '..'
import { getMappingBySlack, getUserBySlack } from './database'

export function mrkdwnToDiscord(mrkdwn: string) {
  // TODO: implement this
  return mrkdwn
}

export async function blocksToDiscord(blocks: KnownBlock[]) {
  return (await Promise.all(blocks.map(blockToDiscord))).join('\n')
}

async function blockToDiscord(block: KnownBlock) {
  switch (block.type) {
    case 'rich_text':
      return richTextBlockToDiscord(block)
    case 'markdown':
      return block.text // TODO: markdown to discord markdown but should be fine
    default:
      return '<?unsupported_block?>'
  }
}

async function richTextBlockToDiscord(block: RichTextBlock) {
  return (await Promise.all(block.elements.map(richTextBlockElementToDiscord)))
    .join('\n')
    .trim()
}

async function richTextBlockElementToDiscord(
  element: RichTextBlockElement
): Promise<string> {
  switch (element.type) {
    case 'rich_text_preformatted':
      return (
        '```\n' + (await richTextElementsToDiscord(element.elements)) + '\n```'
      )
    case 'rich_text_section':
      return await richTextElementsToDiscord(element.elements)
    case 'rich_text_quote':
      return prependEachLine(
        await richTextElementsToDiscord(element.elements),
        '> '
      )
    case 'rich_text_list':
      return (
        await Promise.all(element.elements.map(richTextBlockElementToDiscord))
      )
        .map((s, i) => {
          if (!s) return ''
          const [first, ...later] = s.split('\n')
          return (
            (element.style === 'ordered' ? `${i + 1}.` : '-') +
            ' ' +
            first +
            prependEachLine(later.join('\n'), '  ')
          )
        })
        .join('\n')
    default:
      return '<?unsupported_rich_block?>'
  }
}

async function richTextElementsToDiscord(elements: RichTextElement[]) {
  return (await Promise.all(elements.map(richTextElementToDiscord)))
    .join('')
    .trim()
}

async function richTextElementToDiscord(element: RichTextElement) {
  switch (element.type) {
    case 'text':
      return wrapStyled(element.text, element.style)
    case 'link':
      return wrapStyled(
        `[${element.text || element.url}](${element.url})`,
        element.style
      )
    case 'broadcast':
      const type = element.range === 'here' ? 'here' : 'everyone'
      return wrapStyled(`@${type}`, element.style)
    case 'emoji':
      return wrapStyled(element.unicode || `:${element.name}:`, element.style)
    case 'channel':
      return wrapStyled(
        await slackChannelToDiscord(element.channel_id),
        element.style
      )
    case 'user':
      return wrapStyled(
        await slackUserToDiscord(element.user_id),
        element.style
      )
    case 'usergroup':
      return wrapStyled(
        await slackUsergroupToDiscord(element.usergroup_id),
        element.style
      )
    default:
      return '<?unsupported_element?>'
  }
}

async function slackChannelToDiscord(channelId: string) {
  const mapping = await getMappingBySlack(channelId)
  if (mapping) {
    return `<#${mapping.discord_channel}>`
  }
  try {
    const channel = await slack.client.conversations.info({
      channel: channelId,
    })
    return `#${channel.channel?.name || channelId}`
  } catch (e) {
    if (e instanceof Error && e.message.includes('channel_not_found')) {
      return `#${channelId}`
    }
    throw e
  }
}

async function slackUserToDiscord(userId: string) {
  const user = await getUserBySlack(userId)
  if (user) {
    return `<@${user.discord_id}>`
  }
  try {
    const user = await slack.client.users.info({ user: userId })
    return `@${
      user.user?.profile?.display_name ||
      user.user?.profile?.real_name ||
      userId
    }`
  } catch (e) {
    if (e instanceof Error && e.message.includes('user_not_found')) {
      return `@${userId}`
    }
    throw e
  }
}

async function slackUsergroupToDiscord(usergroupId: string) {
  const usergroups = (await slack.client.usergroups.list()).usergroups || []
  const usergroup = usergroups.find((g) => g.id === usergroupId)
  if (usergroup) {
    return `@${usergroup.handle}`
  }
  return `@&${usergroupId}`
}

function wrapStyled(text: string, style: RichTextStyleable['style']) {
  const xfix =
    (style?.bold ? '**' : '') +
    (style?.italic ? '*' : '') +
    (style?.strike ? '~~' : '') +
    (style?.code ? '`' : '')
  return xfix + text + Array.from(xfix).reverse().join('')
}

function prependEachLine(text: string, prepend: string) {
  return text
    .split('\n')
    .map((s) => prepend + s)
    .join('\n')
}

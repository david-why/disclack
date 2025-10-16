import { escapeHTML } from 'bun'
import { toHTML as discordToHTMLBase } from 'discord-markdown'
import { toHTML as mrkdwnToHTMLBase } from 'slack-markdown'
import type {
  KnownBlock,
  RichTextBlock,
  RichTextElement,
  RichTextBlockElement,
  RichTextStyleable,
} from '@slack/types'

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

export function blocksToDiscord(blocks: KnownBlock[]) {
  return blocks.map(blockToDiscord).join('\n')
}

function blockToDiscord(block: KnownBlock) {
  switch (block.type) {
    case 'rich_text':
      return richTextBlockToDiscord(block)
    case 'markdown':
      return block.text // TODO: markdown to discord markdown but should be fine
    default:
      return '<?unsupported_block?>'
  }
}

function richTextBlockToDiscord(block: RichTextBlock) {
  return block.elements.map(richTextBlockElementToDiscord).join('\n').trim()
}

function richTextBlockElementToDiscord(element: RichTextBlockElement): string {
  switch (element.type) {
    case 'rich_text_preformatted':
      return '```\n' + richTextElementsToDiscord(element.elements) + '\n```'
    case 'rich_text_section':
      return richTextElementsToDiscord(element.elements)
    case 'rich_text_quote':
      return prependEachLine(richTextElementsToDiscord(element.elements), '> ')
    case 'rich_text_list':
      return element.elements
        .map(richTextBlockElementToDiscord)
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

function richTextElementsToDiscord(elements: RichTextElement[]) {
  return elements.map(richTextElementToDiscord).join('').trim()
}

function richTextElementToDiscord(element: RichTextElement) {
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
      // TODO: fetch channel, user, etc.
      return wrapStyled(`#${element.channel_id}`, element.style)
    case 'user':
      return wrapStyled(`@${element.user_id}`, element.style)
    case 'usergroup':
      return wrapStyled(`@&${element.usergroup_id}`, element.style)
    default:
      return '<?unsupported_element?>'
  }
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

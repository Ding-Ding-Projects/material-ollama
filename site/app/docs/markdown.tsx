// A small, dependency-free renderer for the plain-prose Markdown subset the uh-completeness
// articles actually use: paragraphs, bullet/numbered lists, inline `code`, **bold**, *italic*,
// and [text](url) links. It renders real React elements rather than injecting HTML, so there is
// no dangerouslySetInnerHTML anywhere in the docs browser and no markup escaping to get wrong.
import type { ReactNode } from 'react'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // One pass, longest-token-first: code spans, then links, then bold, then italic. Each match
  // consumes its span and the loop continues from the character after it.
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let index = 0
  // eslint-disable-next-line no-cond-assign
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      nodes.push(<code key={`${keyPrefix}-${index}`}>{match[1]}</code>)
    } else if (match[2] !== undefined) {
      const href = match[3]
      const external = /^https?:\/\//.test(href)
      nodes.push(
        <a
          key={`${keyPrefix}-${index}`}
          className="text-link"
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {match[2]}
        </a>
      )
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${index}`}>{match[4]}</strong>)
    } else if (match[5] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${index}`}>{match[5]}</em>)
    }
    lastIndex = match.index + match[0].length
    index += 1
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: string[] }

function toBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraphLines: string[] = []
  let bulletItems: string[] = []
  let numberedItems: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join(' ').trim() })
      paragraphLines = []
    }
  }
  const flushBullets = () => {
    if (bulletItems.length) {
      blocks.push({ type: 'bullet-list', items: bulletItems })
      bulletItems = []
    }
  }
  const flushNumbered = () => {
    if (numberedItems.length) {
      blocks.push({ type: 'numbered-list', items: numberedItems })
      numberedItems = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const bulletMatch = /^[-*]\s+(.*)$/.exec(line)
    const numberedMatch = /^\d+\.\s+(.*)$/.exec(line)
    if (bulletMatch) {
      flushParagraph()
      flushNumbered()
      bulletItems.push(bulletMatch[1])
    } else if (numberedMatch) {
      flushParagraph()
      flushBullets()
      numberedItems.push(numberedMatch[1])
    } else if (line === '') {
      flushParagraph()
      flushBullets()
      flushNumbered()
    } else {
      flushBullets()
      flushNumbered()
      paragraphLines.push(line)
    }
  }
  flushParagraph()
  flushBullets()
  flushNumbered()
  return blocks
}

export function ArticleMarkdown({ text }: { text: string }) {
  const blocks = toBlocks(text)
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`
        if (block.type === 'paragraph') return <p key={key}>{renderInline(block.text, key)}</p>
        if (block.type === 'bullet-list') {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          )
        }
        return (
          <ol key={key}>
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
            ))}
          </ol>
        )
      })}
    </>
  )
}

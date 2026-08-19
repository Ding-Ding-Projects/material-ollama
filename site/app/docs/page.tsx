import type { Metadata } from 'next'
import DocsClient from './DocsClient'
import docsData from '@/content/docs-articles.json'

export const dynamic = 'force-static'
export const metadata: Metadata = {
  title: 'Documentation',
  description: `All ${docsData.articleCount} bundled feature articles, searchable offline with plain text or a real regular expression.`,
}

export default function DocsPage() {
  return <DocsClient />
}

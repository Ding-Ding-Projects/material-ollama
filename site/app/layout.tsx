import type { Metadata, Viewport } from 'next'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ding-ding-projects.github.io/material-ollama/'
const socialImage = 'https://ding-ding-projects.github.io/material-ollama/social-preview.png'

export const dynamic = 'force-static'
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Material Ollama — local models, clearly explained', template: '%s · Material Ollama' },
  description: 'A local-first landing and documentation surface for Material Ollama.',
  applicationName: 'Material Ollama',
  openGraph: {
    type: 'website',
    url: siteUrl,
    title: 'Material Ollama — local models, clearly explained',
    description: 'Learn the desktop companion, its CLI and configuration coverage, and the evidence behind downloads.',
    images: [{ url: socialImage, width: 1280, height: 640, alt: 'Material Ollama landing page with model, configuration, and documentation cards' }],
  },
  twitter: { card: 'summary_large_image', title: 'Material Ollama', description: 'Local models, clearly explained.', images: [socialImage] },
  icons: { icon: '/mark.svg', shortcut: '/mark.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f7f7fb' }, { media: '(prefers-color-scheme: dark)', color: '#11131b' }],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}

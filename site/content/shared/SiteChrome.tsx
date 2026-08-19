'use client'

// A small shared shell for the standalone routes this lane owns (/docs, /status, /download).
// The landing page's own single-page app (site/app/page.tsx) is a sibling surface this lane does
// not edit; this wrapper reuses its visual language (the same tokens and classes from
// globals.css) so navigating between the SPA and these routes reads as one site, without
// touching any file the SPA owns.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useSharedTheme } from './useSharedTheme'

const ROUTES: Array<{ href: string; label: string; icon: string }> = [
  { href: '/', label: 'Overview', icon: '⌂' },
  { href: '/docs', label: 'Documentation', icon: '▤' },
  { href: '/status', label: 'Status', icon: '◌' },
  { href: '/download', label: 'Download', icon: '⭳' },
]

export function SiteChrome({ children, activeHref }: { children: ReactNode; activeHref: string }) {
  const [theme, setTheme] = useSharedTheme()
  const pathname = usePathname()
  const current = activeHref || pathname || '/'

  return (
    <div className="site-root" data-theme={theme}>
      <header className="topbar">
        <Link className="brand" href="/">
          <img src="/mark.svg" alt="" width={30} height={30} />
          Material Ollama
        </Link>
        <nav aria-label="Site sections" className="top-actions">
          {ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`button ${current === route.href ? 'button-primary' : 'button-quiet'}`}
              aria-current={current === route.href ? 'page' : undefined}
            >
              <span aria-hidden="true">{route.icon}</span>&nbsp;{route.label}
            </Link>
          ))}
          <button
            type="button"
            className="icon-button"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
        </nav>
      </header>
      <main className="content" id="content" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <span>Material Ollama documentation, status, and download surface · local state only</span>
        <Link className="text-link" href="/">Back to the landing page</Link>
      </footer>
    </div>
  )
}

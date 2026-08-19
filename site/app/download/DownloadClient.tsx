'use client'

import { useState } from 'react'
import { SiteChrome } from '@/content/shared/SiteChrome'
import releaseManifest from '@/content/release-manifest.json'

type VerifiedManifest = {
  schemaVersion: number
  status: 'verified'
  repo: string
  release: { tag: string; name: string; url: string; commit: string; publishedAt: string; isDraft: boolean; isPrerelease: boolean }
  workflow: { platform: string | null } | null
  installer: { name: string; url: string; sizeBytes: number; sha256: string | null; platform: string; signed: boolean; signatureNote: string }
  assetCount: number
  extraAssets: Array<{ name: string; url: string; sizeBytes: number; sha256: string | null }>
  codeName: { en: string; zhHant: string; combined: string; dishId: string; catalogReleaseUrl: string | null; imageUrl: string | null } | null
}
type UnavailableManifest = { schemaVersion: number; status: 'unavailable'; reason: string; repo?: string; releaseTag?: string; releaseUrl?: string }
type Manifest = VerifiedManifest | UnavailableManifest

const manifest = releaseManifest as Manifest

function formatBytes(bytes: number) {
  return `${bytes.toLocaleString('en-US')} bytes (${(bytes / (1024 * 1024)).toFixed(1)} MB)`
}

function CopyableHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
      <code style={{ wordBreak: 'break-all' }}>{value}</code>
      <button type="button" className="icon-button" aria-label="Copy SHA-256 hash" onClick={copy} style={{ minHeight: '28px', minWidth: '28px' }}>
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  )
}

export default function DownloadClient() {
  return (
    <SiteChrome activeHref="/download">
      <section className="page-panel">
        <div className="page-heading">
          <p className="eyebrow">Download</p>
          <h1>The Windows installer, with its evidence attached.</h1>
          <p>
            This link is built directly from a verified GitHub Release manifest resolved at build time -- never a
            guessed or candidate URL. If no release could be verified, this page says so instead of linking anywhere.
          </p>
        </div>

        {manifest.status === 'unavailable' ? (
          <div className="callout callout-warning">
            <strong>No verified download is available right now</strong>
            <p>
              {manifest.reason} Rather than link to a guessed asset URL, this page shows nothing until a release
              manifest can be verified. You can check{' '}
              <a className="text-link" href={`https://github.com/${manifest.repo ?? 'Ding-Ding-Projects/material-ollama'}/releases`} target="_blank" rel="noreferrer">
                the releases page on GitHub
              </a>{' '}
              directly for the current state.
            </p>
          </div>
        ) : (
          <>
            <div className="boundary">
              <strong>Unsigned installer</strong>
              <p>{manifest.installer.signatureNote}</p>
            </div>

            <div className="callout callout-info" style={{ marginTop: '1.2rem' }}>
              <strong>{manifest.release.tag} &middot; {manifest.installer.platform}</strong>
              <p style={{ margin: '.6rem 0 1rem' }}>
                <a className="button button-primary" href={manifest.installer.url} target="_blank" rel="noreferrer" download>
                  Download {manifest.installer.name}
                </a>
              </p>
              <dl style={{ display: 'grid', gap: '.55rem', margin: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                  <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Version</dt>
                  <dd style={{ margin: 0 }}>{manifest.release.tag} &middot; commit <code>{manifest.release.commit.slice(0, 12)}</code></dd>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                  <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Platform</dt>
                  <dd style={{ margin: 0 }}>{manifest.installer.platform}</dd>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                  <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Size</dt>
                  <dd style={{ margin: 0 }}>{formatBytes(manifest.installer.sizeBytes)}</dd>
                </div>
                {manifest.installer.sha256 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                    <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>SHA-256</dt>
                    <dd style={{ margin: 0 }}><CopyableHash value={manifest.installer.sha256} /></dd>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                  <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Signature</dt>
                  <dd style={{ margin: 0 }}>Unsigned by policy. Windows may show an unknown-publisher or SmartScreen warning; this does not mean the file was tampered with.</dd>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.55rem' }}>
                  <dt style={{ color: 'var(--subtle)', fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Release notes</dt>
                  <dd style={{ margin: 0 }}><a className="text-link" style={{ marginTop: 0 }} href={manifest.release.url} target="_blank" rel="noreferrer">{manifest.release.url}</a></dd>
                </div>
              </dl>
            </div>

            {manifest.codeName && (
              <p className="field-help" style={{ marginTop: '.9rem' }}>
                Dim sum release code name: {manifest.codeName.combined} ({manifest.codeName.dishId}).{' '}
                {manifest.codeName.imageUrl && (
                  <a className="text-link" style={{ marginTop: 0 }} href={manifest.codeName.imageUrl} target="_blank" rel="noreferrer">View the authoritative public dish photo</a>
                )}. No duplicate image is stored in this project.
              </p>
            )}

            <div className="section-heading" style={{ marginTop: '2rem' }}>
              <div>
                <p className="eyebrow">Other assets</p>
                <h2>Archives, ARM64, and checksums.</h2>
              </div>
              <p>{manifest.assetCount} assets are attached to this release in total; the ones most people need are listed here.</p>
            </div>
            <div className="card-grid two-up" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {manifest.extraAssets.map((asset) => (
                <div className="feature-card" key={asset.name} style={{ minHeight: 0 }}>
                  <div className="card-top"><span className="tag">Asset</span></div>
                  <h3 style={{ fontSize: '.95rem' }}>{asset.name}</h3>
                  <p>{formatBytes(asset.sizeBytes)}</p>
                  {asset.sha256 && <p style={{ fontSize: '.75rem' }}><code style={{ wordBreak: 'break-all' }}>{asset.sha256}</code></p>}
                  <a className="text-link feature-surface" href={asset.url} target="_blank" rel="noreferrer" download>Download</a>
                </div>
              ))}
            </div>
            <p className="field-help" style={{ marginTop: '1rem' }}>
              <a className="text-link" style={{ marginTop: 0 }} href={manifest.release.url} target="_blank" rel="noreferrer">
                View every attached asset, and the full release notes, on GitHub
              </a>.
            </p>
          </>
        )}
      </section>
    </SiteChrome>
  )
}

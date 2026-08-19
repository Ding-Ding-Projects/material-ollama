'use client'

import { useEffect, useState } from 'react'
import { SiteChrome } from '@/content/shared/SiteChrome'
import releaseManifest from '@/content/release-manifest.json'

type VerifiedManifest = {
  schemaVersion: number
  status: 'verified'
  repo: string
  release: { tag: string; name: string; url: string; commit: string; publishedAt: string; isDraft: boolean; isPrerelease: boolean }
  workflow: { startedAt: string; completedAt: string; duration: string | null; runUrl: string; platform: string | null; conclusion: string | null } | null
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

function useHeartbeat() {
  const [now, setNow] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export default function StatusClient() {
  const heartbeat = useHeartbeat()

  return (
    <SiteChrome activeHref="/status">
      <section className="page-panel">
        <div className="page-heading">
          <p className="eyebrow">Status and evidence</p>
          <h1>What is verified, what remains pending.</h1>
          <p>
            This page reports an independently verified GitHub Release for the Windows desktop application. It does
            not connect to a local Ollama service, and it never guesses at a version, an asset count, or a workflow
            result -- every figure below either came from the release manifest resolved at build time, or this page
            says plainly that it is not available.
          </p>
        </div>

        {manifest.status === 'unavailable' ? (
          <div className="callout callout-warning">
            <strong>Release status: not available</strong>
            <p>
              {manifest.reason} No installer link or version is shown here, because none has been verified. Check
              back after the next successful release workflow, or visit the{' '}
              <a className="text-link" href={`https://github.com/${manifest.repo ?? 'Ding-Ding-Projects/material-ollama'}/releases`} target="_blank" rel="noreferrer">
                releases page on GitHub
              </a>{' '}
              directly.
            </p>
          </div>
        ) : (
          <>
            <div className="status-grid">
              <div className="status-card">
                <span className="status-label">Release</span>
                <strong className="status-value good">✅ {manifest.release.tag}</strong>
                <p>
                  Published {new Date(manifest.release.publishedAt).toLocaleString()}. Verified against commit{' '}
                  <code>{manifest.release.commit.slice(0, 12)}</code>.{' '}
                  <a className="text-link" href={manifest.release.url} target="_blank" rel="noreferrer">View release notes</a>.
                </p>
              </div>
              <div className="status-card">
                <span className="status-label">Build workflow</span>
                {manifest.workflow ? (
                  <>
                    <strong className={`status-value ${manifest.workflow.conclusion === 'success' ? 'good' : ''}`}>
                      {manifest.workflow.conclusion === 'success' ? '✅ Success' : manifest.workflow.conclusion || 'Unknown'}
                    </strong>
                    <p>
                      Ran {manifest.workflow.duration ? `for ${manifest.workflow.duration}` : ''}.{' '}
                      <a className="text-link" href={manifest.workflow.runUrl} target="_blank" rel="noreferrer">View the workflow run</a>.
                    </p>
                  </>
                ) : (
                  <>
                    <strong className="status-value pending">Not reported</strong>
                    <p>The release notes for this version did not include machine-readable workflow evidence.</p>
                  </>
                )}
              </div>
              <div className="status-card">
                <span className="status-label">Installer</span>
                <strong className="status-value good">● Download verified</strong>
                <p>{formatBytes(manifest.installer.sizeBytes)}{manifest.installer.sha256 && <> · SHA-256 <code style={{ wordBreak: 'break-all' }}>{manifest.installer.sha256}</code></>}</p>
              </div>
              <div className="status-card">
                <span className="status-label">Signing</span>
                <strong className="status-value pending">⚠ Unsigned</strong>
                <p>{manifest.installer.signatureNote}</p>
              </div>
              <div className="status-card">
                <span className="status-label">Ollama service</span>
                <strong className="status-value">● Not connected</strong>
                <p>This site never pretends to inspect a machine-local Ollama service. It only reports release evidence.</p>
              </div>
              <div className="status-card">
                <span className="status-label">Heartbeat</span>
                <strong className="status-value">{heartbeat ?? '…'}</strong>
                <p>Rendered locally, in your browser, while this page is open. No request is made to produce it.</p>
              </div>
            </div>

            {manifest.codeName && (
              <div className="callout callout-info">
                <strong>{manifest.codeName.combined} · {manifest.codeName.dishId}</strong>
                <p>
                  <a className="button button-primary" href={manifest.installer.url} target="_blank" rel="noreferrer">Download Windows installer</a>
                </p>
                <p>
                  The installer is unsigned and may trigger an unknown-publisher or SmartScreen warning.{' '}
                  {manifest.codeName.imageUrl && (
                    <a className="text-link" href={manifest.codeName.imageUrl} target="_blank" rel="noreferrer">View the authoritative public dish photo</a>
                  )}; no duplicate image is copied into this project.
                </p>
              </div>
            )}

            <div className="evidence-table">
              <div className="evidence-head"><span>Evidence item</span><span>State</span><span>Meaning</span></div>
              {[
                ['Release manifest', 'Verified', `${manifest.release.tag} is a published, non-draft, non-prerelease GitHub Release.`],
                ['Installer asset', 'Verified', `${manifest.installer.name} exists at the linked URL with a size and SHA-256 read from the GitHub Releases API.`],
                ['Workflow conclusion', manifest.workflow?.conclusion === 'success' ? 'Verified' : 'Unknown', manifest.workflow ? 'Read independently from the GitHub Actions run, not assumed from the release existing.' : 'No workflow run was linked in the release notes.'],
                ['Total release assets', 'Verified', `${manifest.assetCount} assets are attached to this release; the ${manifest.extraAssets.length} named below are a subset.`],
                ['Ollama service', 'Not connected', 'The site never pretends to inspect a machine-local service.'],
                ['Capture matrix', 'Pending', 'Real built-artifact captures are a separate delivery responsibility from this page.'],
              ].map(([name, stateValue, meaning]) => (
                <div className="evidence-row" key={name}>
                  <span data-label="Evidence item">{name}</span>
                  <span data-label="State" className={stateValue === 'Verified' ? 'good' : stateValue === 'Unknown' ? 'pending' : ''}>{stateValue}</span>
                  <span data-label="Meaning">{meaning}</span>
                </div>
              ))}
            </div>

            {manifest.extraAssets.length > 0 && (
              <details className="regex-builder" style={{ marginTop: '1.2rem' }}>
                <summary>Additional release assets ({manifest.extraAssets.length} of {manifest.assetCount} total)</summary>
                <div className="regex-body">
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.4rem' }}>
                    {manifest.extraAssets.map((asset) => (
                      <li key={asset.name} style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                        <a className="text-link" style={{ marginTop: 0 }} href={asset.url} target="_blank" rel="noreferrer">{asset.name}</a>
                        {' '}&mdash; {formatBytes(asset.sizeBytes)}
                        {asset.sha256 && <> · SHA-256 <code style={{ wordBreak: 'break-all' }}>{asset.sha256}</code></>}
                      </li>
                    ))}
                  </ul>
                  <p className="field-help">
                    <a className="text-link" href={manifest.release.url} target="_blank" rel="noreferrer">View every attached asset on the release page</a>.
                  </p>
                </div>
              </details>
            )}
          </>
        )}
      </section>
    </SiteChrome>
  )
}

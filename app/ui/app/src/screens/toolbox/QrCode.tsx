import { useMemo } from "react"
import { encodeQr } from "./qrEncoder"

export interface QrCodeProps {
  /** The exact payload to encode -- for pairing, the server's returned
   * `otpauth://` URI. Rendered entirely in-process via `encodeQr`; this
   * component never makes a network request. */
  value: string
  /** Pixel size of the rendered square (module size scales to fit). */
  size?: number
  className?: string
  /** Accessible label -- required, since the code itself has no text a
   * screen reader could read. Never describe the secret's value here. */
  label: string
}

/**
 * Renders a `QrMatrix` (see `qrcode.ts`) as an inline SVG -- no `<img>`,
 * no canvas round-trip through a data URI, no remote QR image service.
 * A 4-module quiet zone is added on every side, matching the ISO/IEC
 * 18004 minimum a real scanner expects; omitting it is a common reason a
 * technically-correct QR code still fails to scan.
 */
export function QrCode({ value, size = 200, className, label }: QrCodeProps) {
  const matrix = useMemo(() => encodeQr(value), [value])
  const quietZone = 4
  const dimension = matrix.size + quietZone * 2

  const rects: string[] = []
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        rects.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`)
      }
    }
  }
  const path = rects.join("")

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={0} y={0} width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

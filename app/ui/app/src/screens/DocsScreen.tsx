import { DocsBrowser } from "./docs/DocsBrowser"

export default function DocsScreen() {
  return (
    <div className="h-full" data-capture-id="docs" data-capture-ready="true">
      <DocsBrowser />
    </div>
  )
}

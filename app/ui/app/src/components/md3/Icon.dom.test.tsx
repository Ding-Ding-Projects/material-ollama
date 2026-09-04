import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Icon } from "./Icon"
import { iconSpriteIsPresent } from "./iconSprite"

/**
 * Every icon in the product rendered as an empty box, silently, for as long as
 * Icon referenced the sprite by its built asset URL:
 *
 *   <use href="/assets/icons-<hash>.svg#ms-arrow_range" />
 *
 * Measured in the real built application over its own devtools endpoint, the
 * sprite fetched with HTTP 200 and 39,415 bytes, 36 <use> elements existed,
 * their hrefs and the sprite's symbol ids matched exactly -- and every one
 * reported getBBox() 0x0 with no instanceRoot. The cross-document reference
 * never resolved. Nothing threw and nothing logged.
 *
 * What these assert is the shape that broke: the sprite is in the document,
 * and the reference is a bare same-document fragment. Be clear about the
 * limit -- jsdom does not resolve <use> in either direction, so no unit test
 * can prove an icon is VISIBLE. That proof only comes from a capture of the
 * built artifact, which is why the design-parity lane exists. These catch the
 * regression back to the URL form, which is the thing that actually happened.
 */
describe("icon sprite wiring", () => {
  it("inlines the sprite into the document", () => {
    render(<Icon name="check" />)
    expect(iconSpriteIsPresent()).toBe(true)
    expect(document.querySelector("#md3-icon-sprite symbol#ms-check")).not.toBeNull()
  })

  it("references the symbol with a bare same-document fragment", () => {
    const { container } = render(<Icon name="arrow_range" />)
    const use = container.querySelector("use")
    expect(use).not.toBeNull()
    expect(use?.getAttribute("href")).toBe("#ms-arrow_range")
  })

  it("never references the sprite by file URL, which does not resolve in the webview", () => {
    const { container } = render(<Icon name="close" />)
    const href = container.querySelector("use")?.getAttribute("href") ?? ""
    expect(href.startsWith("#")).toBe(true)
    expect(href).not.toContain(".svg")
    expect(href).not.toContain("/assets/")
  })

  it("injects the sprite exactly once however many icons render", () => {
    render(
      <>
        <Icon name="check" />
        <Icon name="close" />
        <Icon name="bolt" />
      </>,
    )
    expect(document.querySelectorAll("#md3-icon-sprite").length).toBe(1)
  })
})

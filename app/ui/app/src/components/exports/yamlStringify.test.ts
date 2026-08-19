import { describe, expect, it } from "vitest"
import { yamlStringify } from "./yamlStringify"

describe("yamlStringify", () => {
  it("emits plain scalars unquoted", () => {
    expect(yamlStringify("hello")).toBe("hello")
    expect(yamlStringify(42)).toBe("42")
    expect(yamlStringify(true)).toBe("true")
    expect(yamlStringify(false)).toBe("false")
    expect(yamlStringify(null)).toBe("null")
  })

  it("quotes strings that would otherwise be ambiguous", () => {
    expect(yamlStringify("")).toBe('""')
    expect(yamlStringify("null")).toBe('"null"')
    expect(yamlStringify("true")).toBe('"true"')
    expect(yamlStringify("42")).toBe('"42"')
    expect(yamlStringify("-5")).toBe('"-5"')
    expect(yamlStringify("- leading dash")).toBe('"- leading dash"')
    expect(yamlStringify("key: value")).toBe('"key: value"')
    expect(yamlStringify(" leading space")).toBe('" leading space"')
  })

  it("escapes embedded quotes and newlines the same way JSON does", () => {
    const value = 'has "quotes" and\nnewline'
    const out = yamlStringify(value)
    expect(out).toBe(JSON.stringify(value))
    // And it must round-trip back through JSON.parse, since a YAML
    // double-quoted scalar shares JSON's escaping rules.
    expect(JSON.parse(out)).toBe(value)
  })

  it("emits a flat object as a block mapping", () => {
    const out = yamlStringify({ id: "m1", size: 7, active: true, notes: null })
    expect(out).toBe(["id: m1", "size: 7", "active: true", "notes: null"].join("\n"))
  })

  it("emits an array of scalars as a block sequence", () => {
    const out = yamlStringify(["a", "b", 3])
    expect(out).toBe(["- a", "- b", "- 3"].join("\n"))
  })

  it("nests objects under a mapping key with 2-space indent", () => {
    const out = yamlStringify({ model: { name: "llama", tag: "8b" } })
    expect(out).toBe(["model:", "  name: llama", "  tag: 8b"].join("\n"))
  })

  it("nests an array of objects as a sequence of mappings", () => {
    const out = yamlStringify({
      rows: [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
      ],
    })
    expect(out).toBe(
      ["rows:", "  - id: a", "    n: 1", "  - id: b", "    n: 2"].join("\n"),
    )
  })

  it("quotes an object key that isn't a bare identifier", () => {
    const out = yamlStringify({ "weird key!": 1 })
    expect(out).toBe('"weird key!": 1')
  })

  it("emits empty arrays and objects as flow collections", () => {
    expect(yamlStringify([])).toBe("[]")
    expect(yamlStringify({})).toBe("{}")
    expect(yamlStringify({ tags: [] })).toBe("tags: []")
  })

  it("falls back to a plain-string form for non-finite numbers instead of emitting bare `NaN`/`Infinity` (not valid YAML 1.1/1.2 numbers, which require a leading dot: `.nan`/`.inf`)", () => {
    // "NaN"/"Infinity" don't match any of the quoting triggers (not a
    // reserved word, no leading indicator, no colon-space, no whitespace),
    // so they round-trip as ordinary unquoted string scalars — never as
    // the special float values, which YAML spells `.nan`/`.inf`.
    expect(yamlStringify(Number.NaN)).toBe("NaN")
    expect(yamlStringify(Number.POSITIVE_INFINITY)).toBe("Infinity")
    // A leading "-" is a YAML indicator character (block-sequence marker),
    // so this one -- unlike the two above -- does need quoting.
    expect(yamlStringify(Number.NEGATIVE_INFINITY)).toBe('"-Infinity"')
  })
})

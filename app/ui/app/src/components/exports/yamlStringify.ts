// A minimal, dependency-free YAML block-style emitter. There is no `yaml`
// (or `js-yaml`) package in this project's dependency tree, and pulling one
// in is out of this lane's scope (package.json isn't an allowed path) —
// this covers exactly the value shapes `ExportValue` allows (see
// exportFormats.ts): strings, finite numbers, booleans, null, arrays, and
// plain objects. It is not a general YAML 1.1/1.2 implementation.
//
// Output is always valid YAML for those inputs: scalars are quoted
// whenever an unquoted form would be ambiguous (looks like a number/bool/
// null keyword, starts with a YAML indicator character, contains ": " or
// " #", has leading/trailing whitespace, or spans multiple lines), using
// JSON's double-quote escaping — which YAML's double-quoted flow scalar
// syntax is a superset of, so `JSON.stringify(str)` is always a valid
// quoted YAML scalar.

const YAML_RESERVED_WORDS = new Set([
  "null",
  "Null",
  "NULL",
  "~",
  "true",
  "True",
  "TRUE",
  "false",
  "False",
  "FALSE",
  "",
])

// Leading characters that are YAML indicators — a plain scalar starting
// with one of these would be parsed as structure, not text.
const LEADING_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/
const LOOKS_LIKE_NUMBER = /^[+-]?(\.\d+|\d+(\.\d+)?)([eE][+-]?\d+)?$/

function needsQuoting(value: string): boolean {
  if (value === "") return true
  if (YAML_RESERVED_WORDS.has(value)) return true
  if (LOOKS_LIKE_NUMBER.test(value)) return true
  if (LEADING_INDICATOR.test(value)) return true
  if (/\s$/.test(value) || /^\s/.test(value)) return true
  if (value.includes(": ") || value.endsWith(":")) return true
  if (value.includes(" #")) return true
  if (/[\n\r\t]/.test(value)) return true
  return false
}

function scalarToYaml(value: string): string {
  return needsQuoting(value) ? JSON.stringify(value) : value
}

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | readonly YamlValue[]
  | { readonly [key: string]: YamlValue }

function indentLines(text: string, spaces: number): string {
  const pad = " ".repeat(spaces)
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n")
}

function primitiveToYaml(value: string | number | boolean | null): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return scalarToYaml(String(value))
    return String(value)
  }
  return scalarToYaml(value)
}

function isPlainObject(value: unknown): value is Record<string, YamlValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Serializes one value as a standalone YAML document body (block style, 2-space indent). */
export function yamlStringify(value: YamlValue): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return value.map((item) => yamlBlockSequenceItem(item)).join("\n")
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) return "{}"
    return keys.map((key) => yamlMappingEntry(key, value[key])).join("\n")
  }
  return primitiveToYaml(value as string | number | boolean | null)
}

function yamlBlockSequenceItem(value: YamlValue): string {
  if (Array.isArray(value) && value.length > 0) {
    const nested = value.map((item) => yamlBlockSequenceItem(item)).join("\n")
    return "- " + indentLines(nested, 2).trimStart()
  }
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    const keys = Object.keys(value)
    const nested = keys.map((key) => yamlMappingEntry(key, value[key])).join("\n")
    return "- " + indentLines(nested, 2).trimStart()
  }
  return "- " + yamlStringify(value)
}

function yamlMappingEntry(key: string, value: YamlValue): string {
  const yamlKey = /^[A-Za-z0-9_.-]+$/.test(key) ? key : JSON.stringify(key)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${yamlKey}: []`
    return `${yamlKey}:\n${indentLines(yamlStringify(value), 2)}`
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return `${yamlKey}: {}`
    return `${yamlKey}:\n${indentLines(yamlStringify(value), 2)}`
  }
  return `${yamlKey}: ${primitiveToYaml(value as string | number | boolean | null)}`
}

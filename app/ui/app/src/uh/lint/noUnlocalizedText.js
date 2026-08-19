// A local ESLint rule (not an npm package) that types alone cannot express:
// `<div>Hello</div>` is a perfectly valid, perfectly type-checked React
// element. TypeScript has no way to say "no literal strings here" for JSX
// children or plain attribute values, so this rule exists to say it
// instead. It reports raw user-facing text everywhere the `uh` layer's
// `Localized` type cannot reach: JSX text, JSX expression containers
// holding a static string/template literal, a fixed set of
// localization-sensitive JSX attributes, and the first argument to a fixed
// set of user-facing text sinks.
//
// Registered in ../../eslint.config.js as `uh/no-unlocalized-text`, exempt
// for `src/uh/dict/**`, `**/*.dict.ts`, `**/*.test.tsx`, and
// `**/*.stories.tsx` (where "raw strings" are either the dictionaries
// themselves or non-shipping code).

const ATTRIBUTE_NAMES = new Set([
  "title",
  "aria-label",
  "aria-description",
  "placeholder",
  "alt",
  "label",
])

const SINK_CALLEE_NAMES = new Set(["notify", "askConfirm", "record", "toast"])

// Meaningful = contains at least one letter or digit. Pure whitespace and
// pure punctuation (a bare "·", "-", ":" used as a JSX-formatting literal)
// are not "text" for this rule's purposes.
const MEANINGFUL_TEXT = /[\p{L}\p{N}]/u

function isMeaningfulText(raw) {
  return typeof raw === "string" && MEANINGFUL_TEXT.test(raw)
}

function staticTemplateText(node) {
  // Only a template literal with zero interpolations is "static text" for
  // this rule — `` `${t("key")}` `` is fine, `` `Hello ${name}` `` is a raw
  // string with an interpolation stapled on and still needs to be reported.
  if (node.expressions.length > 0) return null
  return node.quasis.map((quasi) => quasi.value.raw).join("")
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw user-facing text; route it through the uh layer's t()/fact()/Txt instead.",
    },
    schema: [],
    messages: {
      jsxText:
        "Raw text in JSX must go through the uh layer (<Txt/> or t()), not a literal string.",
      jsxExpressionText:
        "This string/template literal renders raw text; use t()/fact() via the uh layer instead.",
      attributeText:
        'The "{{name}}" attribute must not be a raw string literal; source it from t()/fact().',
      sinkArgumentText:
        "{{name}}() must not be called with a raw string literal; pass localized text produced by t()/fact().",
    },
  },
  create(context) {
    function reportStaticLiteral(node, messageId, data) {
      if (node.type === "Literal" && typeof node.value === "string") {
        if (isMeaningfulText(node.value)) context.report({ node, messageId, data })
        return
      }
      if (node.type === "TemplateLiteral") {
        const raw = staticTemplateText(node)
        if (raw !== null && isMeaningfulText(raw)) context.report({ node, messageId, data })
      }
    }

    function isStringLiteralLike(node) {
      return (
        (node.type === "Literal" && typeof node.value === "string") ||
        node.type === "TemplateLiteral"
      )
    }

    return {
      JSXText(node) {
        if (isMeaningfulText(node.value)) {
          context.report({ node, messageId: "jsxText" })
        }
      },

      JSXExpressionContainer(node) {
        const expr = node.expression
        if (!expr || expr.type === "JSXEmptyExpression") return
        if (isStringLiteralLike(expr)) {
          reportStaticLiteral(expr, "jsxExpressionText")
        }
      },

      JSXAttribute(node) {
        const name = node.name && node.name.name
        if (typeof name !== "string" || !ATTRIBUTE_NAMES.has(name)) return
        const value = node.value
        if (!value) return
        if (value.type === "Literal" && typeof value.value === "string") {
          reportStaticLiteral(value, "attributeText", { name })
        } else if (
          value.type === "JSXExpressionContainer" &&
          value.expression &&
          isStringLiteralLike(value.expression)
        ) {
          reportStaticLiteral(value.expression, "attributeText", { name })
        }
      },

      CallExpression(node) {
        const callee = node.callee
        let name = null
        if (callee.type === "Identifier") {
          name = callee.name
        } else if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
          name = callee.property.name
        }
        if (!name || !SINK_CALLEE_NAMES.has(name)) return
        const firstArg = node.arguments[0]
        if (!firstArg || !isStringLiteralLike(firstArg)) return
        reportStaticLiteral(firstArg, "sinkArgumentText", { name })
      },
    }
  },
}

export default rule

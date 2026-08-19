import type { ElementType, ReactNode } from "react"
import { useT } from "./t"
import { useUh } from "./provider"
import { funny, type FunnyLang } from "./funny"
import { applyVocab } from "./vocab"
import { fact, type FactKind, type Localized } from "./localized"
import type { DictRegistry } from "./dict"

type DictKey<Ns extends keyof DictRegistry> = Extract<keyof DictRegistry[Ns], string>

interface CommonProps {
  /** Element (or component) to render as. Defaults to `span`. */
  readonly as?: ElementType
  readonly className?: string
}

export interface LabelProps<Ns extends keyof DictRegistry & string> extends CommonProps {
  readonly channel?: "label"
  readonly ns: Ns
  readonly k: DictKey<Ns>
}

export interface CopyProps<Ns extends keyof DictRegistry & string> extends CommonProps {
  readonly channel: "copy"
  readonly ns: Ns
  readonly k: DictKey<Ns>
}

export interface ContentProps extends CommonProps {
  readonly channel: "content"
  /** User-authored text (e.g. a typed chat message). Never dictionary text. */
  readonly children: string
}

export interface FactProps extends CommonProps {
  readonly channel: "fact"
  readonly value: string | number
  readonly kind: FactKind
}

/**
 * `Txt` is the ONE place raw text is allowed to become renderable in this
 * app. It has four channels, each with a fixed pipeline — the whole point
 * is that a caller cannot mix them up:
 *
 * | channel   | t() | funny() | vocab() |
 * |-----------|-----|---------|---------|
 * | `label`   | yes | no      | no      |
 * | `copy`    | yes | yes     | yes     |
 * | `content` | n/a | no      | yes     |
 * | `fact`    | n/a | no      | no      |
 *
 * `funny()` only ever runs on the `copy` channel's own dictionary string.
 * It is structurally impossible to hand it a fact: facts render as their
 * own `<Txt channel="fact">` sibling, never as an interpolation inside a
 * `copy` string, so "voice, never facts" is a property of the API shape,
 * not a rule someone has to remember to follow.
 */
export type TxtProps<Ns extends keyof DictRegistry & string = keyof DictRegistry & string> =
  | LabelProps<Ns>
  | CopyProps<Ns>
  | ContentProps
  | FactProps

function TxtLabel<Ns extends keyof DictRegistry & string>(
  props: Omit<LabelProps<Ns>, "channel">,
): ReactNode {
  const { ns, k, as: As = "span", className } = props
  const t = useT(ns)
  return <As className={className}>{t(k)}</As>
}

function TxtCopy<Ns extends keyof DictRegistry & string>(
  props: Omit<CopyProps<Ns>, "channel">,
): ReactNode {
  const { ns, k, as: As = "span", className } = props
  const t = useT(ns)
  const voice = useUh()
  const lang: FunnyLang = voice.langMode === "yue" ? "yue" : "en"
  const level = lang === "yue" ? voice.funnyYue : voice.funnyEn
  const localized = t(k)
  const styled = funny(localized, { lang, level, emoji: voice.emoji })
  const withVocab = applyVocab(styled, voice.vocab)
  return <As className={className}>{withVocab}</As>
}

function TxtContent(props: Omit<ContentProps, "channel">): ReactNode {
  const { children, as: As = "span", className } = props
  const voice = useUh()
  const withVocab = applyVocab(children as Localized, voice.vocab)
  return <As className={className}>{withVocab}</As>
}

function TxtFact(props: Omit<FactProps, "channel">): ReactNode {
  const { value, kind, as: As = "span", className } = props
  return <As className={className}>{fact(value, kind)}</As>
}

export function Txt<Ns extends keyof DictRegistry & string>(props: TxtProps<Ns>): ReactNode {
  const channel = props.channel ?? "label"
  switch (channel) {
    case "label": {
      const { ns, k, as, className } = props as LabelProps<Ns>
      return <TxtLabel ns={ns} k={k} as={as} className={className} />
    }
    case "copy": {
      const { ns, k, as, className } = props as CopyProps<Ns>
      return <TxtCopy ns={ns} k={k} as={as} className={className} />
    }
    case "content": {
      const { children, as, className } = props as ContentProps
      return (
        <TxtContent as={as} className={className}>
          {children}
        </TxtContent>
      )
    }
    case "fact": {
      const { value, kind, as, className } = props as FactProps
      return <TxtFact value={value} kind={kind} as={as} className={className} />
    }
  }
}

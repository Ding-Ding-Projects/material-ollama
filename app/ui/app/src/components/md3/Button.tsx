import clsx from "clsx"
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"
import { Icon } from "./Icon"
import {
  BUTTON_SHAPE_CLASSES,
  BUTTON_SIZE_CLASSES,
  BUTTON_VARIANT_CLASSES,
  FOCUS_RING,
  type ButtonShape,
  type ButtonSize,
  type ButtonVariant,
} from "./tokens"

type CommonProps = {
  variant: ButtonVariant
  size?: ButtonSize
  /** `token` follows the user's customizable corner radius (--r); `pill` is
   * fully rounded. Matches the design's tonal/token "New chat" affordance. */
  shape?: ButtonShape
  icon?: string
  trailingIcon?: string
  loading?: boolean
  className?: string
  children: ReactNode
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined
  }

type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string
  }

export type ButtonProps = ButtonAsButton | ButtonAsAnchor

function ButtonContent({
  loading,
  icon,
  trailingIcon,
  iconSize,
  children,
}: {
  loading: boolean
  icon?: string
  trailingIcon?: string
  iconSize: number
  children: ReactNode
}) {
  return (
    <>
      {loading ? (
        <span
          aria-hidden="true"
          className="h-[1em] w-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : icon ? (
        <Icon name={icon} size={iconSize} className="shrink-0" />
      ) : null}
      <span className="truncate">{children}</span>
      {!loading && trailingIcon ? (
        <Icon name={trailingIcon} size={iconSize} className="shrink-0" />
      ) : null}
    </>
  )
}

export function Button(props: ButtonProps) {
  const size = props.size ?? "md"
  const shape = props.shape ?? "pill"
  const loading = props.loading ?? false
  const iconSize = size === "sm" ? 16 : 18
  const sizing = BUTTON_SIZE_CLASSES[size]

  const sharedClassName = clsx(
    "relative inline-flex select-none items-center justify-center font-medium whitespace-nowrap",
    "disabled:opacity-38 disabled:pointer-events-none aria-disabled:opacity-38 aria-disabled:pointer-events-none",
    "transition-colors duration-150",
    sizing.base,
    sizing.touchBefore,
    BUTTON_SHAPE_CLASSES[shape],
    BUTTON_VARIANT_CLASSES[props.variant],
    FOCUS_RING,
    props.className,
  )

  if (props.href !== undefined) {
    const {
      variant,
      size: _size,
      shape: _shape,
      icon,
      trailingIcon,
      loading: _loading,
      className,
      children,
      href,
      onClick,
      "aria-disabled": ariaDisabled,
      ...anchorRest
    } = props as ButtonAsAnchor
    const isDisabled = loading || ariaDisabled === true
    return (
      <a
        href={href}
        className={sharedClassName}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        tabIndex={isDisabled ? -1 : undefined}
        onClick={isDisabled ? (event) => event.preventDefault() : onClick}
        {...anchorRest}
      >
        <ButtonContent
          loading={loading}
          icon={icon}
          trailingIcon={trailingIcon}
          iconSize={iconSize}
        >
          {children}
        </ButtonContent>
      </a>
    )
  }

  const {
    variant,
    size: _size,
    shape: _shape,
    icon,
    trailingIcon,
    loading: _loading,
    className,
    children,
    href: _href,
    disabled,
    ...buttonRest
  } = props as ButtonAsButton
  const isDisabled = loading || disabled === true

  return (
    <button
      type="button"
      className={sharedClassName}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      <ButtonContent
        loading={loading}
        icon={icon}
        trailingIcon={trailingIcon}
        iconSize={iconSize}
      >
        {children}
      </ButtonContent>
    </button>
  )
}

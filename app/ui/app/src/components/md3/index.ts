// MD3 primitive component barrel. Zero call sites reference this yet —
// this lane ships the primitives only; wiring them into real screens is a
// later, separate change.

export * from "./tokens"

export { Button, type ButtonProps } from "./Button"
export { IconButton, type IconButtonProps } from "./IconButton"
export { Surface, type SurfaceProps } from "./Surface"
export { Chip, type ChipProps } from "./Chip"
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from "./SegmentedControl"
export { Switch, type SwitchProps } from "./Switch"
export { Slider, type SliderProps } from "./Slider"
export { TextField, type TextFieldProps } from "./TextField"
export { SearchField, type SearchFieldProps } from "./SearchField"
export { Select, type SelectOption, type SelectProps } from "./Select"
export { ListItem, type ListItemProps } from "./ListItem"
export { Dialog, type DialogProps } from "./Dialog"
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog"
export { Menu, type MenuItemDef, type MenuProps } from "./Menu"
export { ContextMenu, type ContextMenuProps } from "./ContextMenu"
export { Popover, type PopoverProps } from "./Popover"
export { SnackbarProvider, useSnackbar } from "./Snackbar"
export { ProgressBar, type ProgressBarProps } from "./ProgressBar"
export { TabStrip, type TabStripProps, type TabStripTab } from "./TabStrip"
export {
  NavigationRail,
  type NavigationRailItem,
  type NavigationRailProps,
} from "./NavigationRail"
export { Badge, type BadgeProps } from "./Badge"
export { AppMark } from "./AppMark"

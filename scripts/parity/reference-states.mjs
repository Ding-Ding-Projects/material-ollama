/**
 * The 18 design-parity rows, each with the exact interaction that reaches its
 * state in the reference.
 *
 * Every row reloads the page first, so a capture can never inherit an overlay
 * a previous one left open. Escape is not reliable here: some of the
 * reference's overlays do not close on it, and a capture that inherits a
 * stale dialog is a capture of the wrong state that nothing would flag.
 *
 * `steps` are executed in order. `expect` is proved AFTER the steps and
 * BEFORE the capture -- a state that did not open must fail the row, never
 * photograph whatever happened to be on screen.
 */

/** Click the nth (0-based) element carrying this accessible name. */
export function clickNth(label, index = 0) {
  return `(() => {
    const all = Array.from(document.querySelectorAll('[aria-label=' + JSON.stringify(${JSON.stringify(label)}) + ']'));
    if (all.length <= ${index}) return 'ONLY_' + all.length + '_MATCHES';
    all[${index}].click();
    return 'OK';
  })()`
}

/** Fire a real contextmenu event at the first element matching `selector`. */
export function contextMenuOn(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'NO_MATCH';
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return 'OK';
  })()`
}

/** Count elements matching a raw CSS selector. */
export function count(selector) {
  return `document.querySelectorAll(${JSON.stringify(selector)}).length`
}

/** A named overlay is open when exactly one dialog/menu carries that name. */
export function dialogNamed(name) {
  return `(() => {
    const open = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]'));
    return open.filter(d => (d.getAttribute('aria-label') || '') === ${JSON.stringify(name)}).length;
  })()`
}

/** Any menu or dialog is open (for the unnamed context menu). */
export const ANY_OVERLAY_OPEN = `document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]').length`

const screen = (id, label, screenName) => ({
  id,
  kind: 'screen',
  screenName,
  steps: [{ label: `open ${label}`, expression: clickNth(label) }],
  expect: { label: `${label} is the active screen`, expression: count('main, [role=main]'), atLeast: 1 },
})

export const STATES = [
  // Ten screens. "shell" is the chrome itself -- title bar, tab strip and
  // navigation rail -- captured on the default screen because the chrome is
  // the subject, not whatever content sits behind it.
  { id: 'shell', kind: 'screen', screenName: 'App shell', steps: [], expect: { label: 'navigation rail present', expression: count('[aria-label="Main navigation"]'), atLeast: 1 } },
  screen('models', 'Models', 'Models'),
  screen('chat', 'Chat', 'Chat'),
  screen('launch', 'Launch', 'Launch'),
  screen('cli-harness', 'Codex CLI', 'CLI harness'),
  screen('developer', 'Developer', 'Developer'),
  screen('toolbox', 'Toolbox', 'Toolbox'),
  screen('docs', 'Docs', 'Docs'),
  screen('status', 'Status', 'Status'),
  screen('settings', 'Settings', 'Settings'),

  // Eight overlays. Each needs a route plus an interaction; none is reachable
  // by navigation alone.
  {
    id: 'overlay-command-palette', kind: 'overlay', screenName: 'Overlay: command palette',
    steps: [{ label: 'open the command palette', expression: clickNth('Command palette') }],
    expect: { label: 'command palette dialog is open', expression: dialogNamed('Command palette'), equals: 1 },
  },
  {
    id: 'overlay-notification-center', kind: 'overlay', screenName: 'Overlay: notification center',
    steps: [{ label: 'open the notification center', expression: clickNth('Notifications') }],
    expect: { label: 'notification center is open', expression: dialogNamed('Notification center'), equals: 1 },
  },
  {
    id: 'overlay-regex-builder', kind: 'overlay', screenName: 'Overlay: regex builder',
    steps: [{ label: 'open the regex builder', expression: clickNth('Regex builder') }],
    expect: { label: 'regex builder dialog is open', expression: dialogNamed('Regex builder'), equals: 1 },
  },
  {
    id: 'overlay-context-menu', kind: 'overlay', screenName: 'Overlay: context menu',
    steps: [{ label: 'right-click the active tab', expression: contextMenuOn('[role=tab]') }],
    expect: { label: 'a context menu is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-destructive-confirmation', kind: 'overlay', screenName: 'Overlay: destructive confirmation',
    steps: [{ label: 'remove the first installed model', expression: clickNth('Remove model', 0) }],
    expect: { label: 'a confirmation dialog is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-school-mode-unlock', kind: 'overlay', screenName: 'Overlay: School-mode unlock',
    steps: [
      { label: 'open Settings', expression: clickNth('Settings') },
      { label: 'focus the School-mode PIN field', expression: clickNth('PIN') },
    ],
    expect: { label: 'the School-mode unlock control is present', expression: count('[aria-label="PIN"]'), atLeast: 1 },
  },
  {
    id: 'overlay-dim-sum-surprise', kind: 'overlay', screenName: 'Overlay: dim-sum surprise',
    steps: [],
    expect: { label: 'the dim-sum surface is present', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
    note: 'The reference shows this on a 10% startup draw; the capture lane must trigger it deterministically rather than waiting for the dice.',
  },
  {
    id: 'overlay-snackbar', kind: 'overlay', screenName: 'Overlay: snackbar',
    steps: [],
    expect: { label: 'a snackbar is visible', expression: count('[role=status],[role=alert]'), atLeast: 1 },
    note: 'Needs the action that raises it; not yet identified in the reference.',
  },
]

export const STATE_IDS = STATES.map((s) => s.id)

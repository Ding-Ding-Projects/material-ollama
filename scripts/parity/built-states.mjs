/**
 * The built-app side of the 18 design-parity rows.
 *
 * Each row names the real route the app is launched at and, for an overlay,
 * the interaction that opens it. The inventory's
 * "app://material-ollama/capture/<id>" strings are row identifiers, not a
 * scheme the app implements -- the real mechanism is the product's own
 * documented `-route` flag, which is what the capture harness has always used.
 * `resolvedRoute` here is the mapping between the two, and it is what the
 * inventory's resolvedBuiltRoute field records.
 *
 * Selection is by the data-capture-id markers the screens carry, or by
 * accessible name. Never by visible text: the icon font is a ligature set, so
 * an element's textContent carries the glyph's name glued to its label.
 */

/** Click the one element carrying this exact accessible name. */
export function clickByLabel(label) {
  return `(() => {
    const all = Array.from(document.querySelectorAll('[aria-label=' + JSON.stringify(${JSON.stringify(label)}) + ']'));
    if (all.length === 0) return 'NO_MATCH';
    all[0].click();
    return 'OK';
  })()`
}

/** Press a key on the document, the way the shell's own listeners receive it. */
export function pressKey({ key, ctrlKey = false, shiftKey = false, altKey = false }) {
  return `(() => {
    const init = { key: ${JSON.stringify(key)}, ctrlKey: ${ctrlKey}, shiftKey: ${shiftKey}, altKey: ${altKey}, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', init));
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

export function count(selector) {
  return `document.querySelectorAll(${JSON.stringify(selector)}).length`
}

/** A screen is ready when its own capture marker says so. */
export function markerReady(id) {
  return `document.querySelectorAll('[data-capture-id=' + JSON.stringify(${JSON.stringify(id)}) + '][data-capture-ready="true"]').length`
}

export const ANY_OVERLAY_OPEN = `document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]').length`

const screen = (id, resolvedRoute, screenName, marker = id) => ({
  id,
  kind: 'screen',
  screenName,
  resolvedRoute,
  builtInteraction: 'none -- the route alone reaches this state',
  steps: [],
  expect: { label: `${id} capture marker is ready`, expression: markerReady(marker), atLeast: 1 },
})

export const BUILT_STATES = [
  {
    id: 'shell',
    kind: 'screen',
    screenName: 'App shell',
    resolvedRoute: '/',
    builtInteraction: 'none -- the chrome is the subject',
    steps: [],
    expect: { label: 'the navigation rail is present', expression: count('[aria-label="Main navigation"]'), atLeast: 1 },
  },
  screen('models', '/models', 'Models'),
  screen('chat', '/c/new', 'Chat', 'c-new'),
  screen('launch', '/launch', 'Launch'),
  screen('cli-harness', '/codex', 'CLI harness'),
  screen('developer', '/devtools', 'Developer', 'devtools'),
  screen('toolbox', '/toolbox', 'Toolbox'),
  screen('docs', '/docs', 'Docs'),
  screen('status', '/status', 'Status'),
  screen('settings', '/settings', 'Settings'),

  {
    id: 'overlay-command-palette',
    kind: 'overlay',
    screenName: 'Overlay: command palette',
    resolvedRoute: '/models',
    builtInteraction: 'Ctrl+Shift+F on the document, the shell\'s own palette shortcut',
    steps: [{ label: 'open the command palette', expression: pressKey({ key: 'F', ctrlKey: true, shiftKey: true }) }],
    expect: { label: 'the command palette is open', expression: markerReady('command-palette'), atLeast: 1 },
  },
  {
    id: 'overlay-notification-center',
    kind: 'overlay',
    screenName: 'Overlay: notification center',
    resolvedRoute: '/models',
    builtInteraction: 'click the notifications control in the title bar',
    steps: [{ label: 'open the notification center', expression: clickByLabel('Notifications') }],
    expect: { label: 'the notification center is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-regex-builder',
    kind: 'overlay',
    screenName: 'Overlay: regex builder',
    resolvedRoute: '/toolbox',
    builtInteraction: 'open the regex builder from the toolbox lab',
    steps: [{ label: 'open the regex builder', expression: clickByLabel('Regex builder') }],
    expect: { label: 'the regex builder is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-context-menu',
    kind: 'overlay',
    screenName: 'Overlay: context menu',
    resolvedRoute: '/models',
    builtInteraction: 'right-click the active tab in the tab strip',
    steps: [{ label: 'right-click the active tab', expression: contextMenuOn('[role=tab]') }],
    expect: { label: 'a context menu is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-destructive-confirmation',
    kind: 'overlay',
    screenName: 'Overlay: destructive confirmation',
    resolvedRoute: '/settings',
    builtInteraction: 'trigger a destructive action that raises the confirmation gate',
    steps: [{ label: 'open the destructive confirmation', expression: clickByLabel('Reset all settings') }],
    expect: { label: 'the confirmation gate is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-school-mode-unlock',
    kind: 'overlay',
    screenName: 'Overlay: School-mode unlock',
    resolvedRoute: '/settings',
    builtInteraction: 'attempt to leave School mode, which demands the credential',
    steps: [{ label: 'open the unlock prompt', expression: clickByLabel('Turn off School mode') }],
    expect: { label: 'the unlock prompt is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-dim-sum-surprise',
    kind: 'overlay',
    screenName: 'Overlay: dim-sum surprise',
    resolvedRoute: '/status',
    builtInteraction: 'the surprise renders inline on Status rather than as an overlay',
    steps: [],
    expect: { label: 'the dim-sum surface is present', expression: count('[data-capture-id="dim-sum-surprise"]'), atLeast: 1 },
    note:
      'Structural divergence from the reference, which shows this as an overlay. The built app renders DimSumSurpriseCard inline on Status. Recorded so the audit reads it as a real difference to resolve, not as a capture that missed.',
  },
  {
    id: 'overlay-snackbar',
    kind: 'overlay',
    screenName: 'Overlay: snackbar',
    resolvedRoute: '/models',
    builtInteraction: 'perform an action that raises a snackbar',
    steps: [],
    expect: { label: 'a snackbar is visible', expression: count('[role=status],[role=alert]'), atLeast: 1 },
    note: 'Trigger not yet identified on either side; the reference row is a gap for the same reason.',
  },
]

export const BUILT_STATE_IDS = BUILT_STATES.map((s) => s.id)

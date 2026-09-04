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

/** Click the first element whose accessible name STARTS WITH this text.
 *
 * Not an exact match: the built app names controls per item, so the remove
 * action on a model card reads "Remove model - qwen3.8:27b", not "Remove
 * model". An exact match finds nothing and reports a missing control rather
 * than a selector that was too strict. */
export function clickByLabelPrefix(prefix) {
  return `(() => {
    const hit = Array.from(document.querySelectorAll('[aria-label]'))
      .find(e => (e.getAttribute('aria-label') || '').startsWith(${JSON.stringify(prefix)}));
    if (!hit) return 'NO_MATCH';
    hit.click();
    return 'OK';
  })()`
}

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
  {
    ...screen('chat', '/c/new', 'Chat', 'c-new'),
    // The built app opens on chat, so the shell row and this row are the
    // same pixels -- declared rather than silently tolerated. Note this is
    // itself a divergence: the reference's default screen is Models, and
    // its shell row shares with models instead.
    sharesFrameWith: 'shell',
  },
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
    steps: [{ label: 'open the regex builder', expression: clickByLabelPrefix('Regex builder') }],
    // The built regex builder is an inline panel on the lab, not a dialog, so
    // asserting on a dialog role would fail on a surface that is open and
    // correct. Assert on the builder's own flag controls instead.
    expect: { label: 'the regex builder is showing its flags', expression: count('[aria-label="Flags"]'), atLeast: 1 },
  },
  {
    id: 'overlay-context-menu',
    kind: 'overlay',
    screenName: 'Overlay: context menu',
    resolvedRoute: '/models',
    builtInteraction: 'right-click the active tab in the tab strip',
    steps: [
      { label: 'wait for the tab strip to mount', expression: `document.querySelectorAll('[role=tab]').length > 0 ? 'OK' : 'NO_TAB_YET'` },
      { label: 'right-click the active tab', expression: contextMenuOn('[role=tab]') },
    ],
    expect: { label: 'a context menu is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-destructive-confirmation',
    kind: 'overlay',
    screenName: 'Overlay: destructive confirmation',
    resolvedRoute: '/models',
    builtInteraction: 'remove an installed model, which raises the confirmation gate',
    steps: [{ label: 'open the destructive confirmation', expression: clickByLabelPrefix('Remove model') }],
    expect: { label: 'the confirmation gate is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-school-mode-unlock',
    kind: 'overlay',
    screenName: 'Overlay: School-mode unlock',
    resolvedRoute: '/settings',
    builtInteraction: 'attempt to leave School mode, which demands the credential',
    steps: [],
    expect: { label: 'the School-mode unlock control is on screen', expression: count('[aria-label^="What does this do? — Unlock PIN"]'), atLeast: 1 },
    // GAP: this captures the School-mode section at rest, not the unlock
    // prompt. Turning the mode on and off again inside a capture would write
    // a credential into the isolated profile and leave the app in a locked
    // state if the run died between the two steps. The interaction that opens
    // the prompt without that risk is not yet worked out, and capturing the
    // section instead would be photographing the screen behind the overlay --
    // which is the thing the uniqueness guard exists to catch.
  },
  {
    id: 'overlay-dim-sum-surprise',
    kind: 'overlay',
    screenName: 'Overlay: dim-sum surprise',
    resolvedRoute: '/status',
    builtInteraction: 'the surprise renders inline on Status rather than as an overlay',
    steps: [],
    // Assert on the surface's own text, the way the reference row does. There
    // is no dedicated capture marker on this card; asserting on one that does
    // not exist failed a row whose content was on screen the whole time.
    expect: { label: 'the dim-sum surface is on screen', expression: `/dim sum/i.test(document.body.innerText) ? 1 : 0`, atLeast: 1 },
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

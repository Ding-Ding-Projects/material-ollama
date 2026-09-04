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

/** Type a value into the input carrying this accessible name, firing React's
 * onChange via the native value setter (assigning .value alone does not). */
export function typeInto(label, value) {
  return `(() => {
    const el = document.querySelector('[aria-label=' + JSON.stringify(${JSON.stringify(label)}) + ']');
    if (!el) return 'NO_MATCH';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'OK';
  })()`
}

/**
 * Click the first button whose visible text ENDS WITH `text`.
 *
 * Not an equality check, deliberately. The reference draws its icons with a
 * Material Symbols ligature font, which puts the glyph's NAME into the
 * element's textContent: the "New chat" button reads "edit_squareNew chat".
 * An equality match finds nothing and reports NO_BUTTON, which looks exactly
 * like a missing control rather than a mis-written selector.
 */
export function clickButtonText(text) {
  return `(() => {
    const want = ${JSON.stringify(text)};
    const hit = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.replace(/\s+/g, ' ').trim().endsWith(want));
    if (!hit) return 'NO_BUTTON';
    hit.click();
    return 'OK';
  })()`
}

export const STATES = [
  // Ten screens. "shell" is the chrome itself -- title bar, tab strip and
  // navigation rail -- captured on the default screen because the chrome is
  // the subject, not whatever content sits behind it.
  {
    id: 'shell', kind: 'screen', screenName: 'App shell', steps: [],
    expect: { label: 'navigation rail present', expression: count('[aria-label="Main navigation"]'), atLeast: 1 },
    // Models is the reference's default screen, so the shell row and the models
    // row are genuinely the same pixels. That is a fact about the design, not a
    // capture that failed, so it is declared rather than silently tolerated --
    // an undeclared duplicate still fails the run.
    sharesFrameWith: 'models',
    note: 'The subject here is the chrome -- title bar, tab strip, navigation rail -- not the content behind it. The Material Design 3 audit for this row covers the chrome; the models row covers the catalog.',
  },
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
    steps: [
      { label: 'open Models', expression: clickNth('Models') },
      { label: 'remove the first installed model', expression: clickNth('Remove model', 0) },
    ],
    expect: { label: 'the destructive confirmation dialog is open', expression: dialogNamed('Confirm destructive action'), equals: 1 },
  },
  {
    id: 'overlay-school-mode-unlock', kind: 'overlay', screenName: 'Overlay: School-mode unlock',
    steps: [
      { label: 'open Settings', expression: clickNth('Settings') },
      { label: 'set a School-mode PIN', expression: typeInto('PIN', '1234') },
      { label: 'turn School mode on', expression: clickButtonText('Turn on') },
      { label: 'attempt to turn School mode off, which demands the PIN', expression: clickButtonText('Turn off') },
    ],
    expect: { label: 'the School-mode unlock prompt is open', expression: ANY_OVERLAY_OPEN, atLeast: 1 },
  },
  {
    id: 'overlay-dim-sum-surprise', kind: 'overlay', screenName: 'Overlay: dim-sum surprise',
    steps: [
      { label: 'open Chat', expression: clickNth('Chat') },
      { label: 'start a new chat, which draws for the surprise', expression: clickButtonText('New chat') },
    ],
    // Assert on the surface's own heading, not on a dish name. The first
    // attempt listed romanised names ("Har gow", "Siu mai") while the
    // reference renders the English one ("Shrimp dumpling"), so the row
    // failed while the surprise was on screen the whole time.
    expect: { label: 'the dim-sum surprise is on screen', expression: `/DIM SUM SURPRISE/i.test(document.body.innerText) ? 1 : 0`, atLeast: 1 },
    note: 'The reference draws this on a startup probability check. reference-lib pins Math.random to 0 so the draw always succeeds and always picks the first dish, which makes the row capturable and every other row deterministic too.',
  },
  {
    id: 'overlay-snackbar', kind: 'overlay', screenName: 'Overlay: snackbar',
    steps: [
      { label: 'open Models', expression: clickNth('Models') },
      { label: 'pull a model, which notifies', expression: clickButtonText('Pull') },
    ],
    expect: { label: 'a snackbar is visible', expression: `(() => { const t = document.body.innerText; return /Pulling|Queued|Started|Removed|Saved/i.test(t) ? 1 : 0 })()`, atLeast: 1 },
    // GAP, recorded rather than faked. The reference raises its snackbar from
    // notify(), which sets `toast` and then clears it on a timer. Clicking
    // Pull fires without error but no toast text was observed in the document
    // afterwards, so the trigger that reliably raises one is not yet
    // identified. This row must stay a gap until it is: capturing the screen
    // behind an absent snackbar and calling it parity is exactly the failure
    // the cross-row uniqueness guard exists to catch.
    note: 'Unresolved: notify() sets a self-clearing toast, and clicking Pull did not leave one in the document. Needs the specific action that raises a durable snackbar in the reference.',
  },
]

export const STATE_IDS = STATES.map((s) => s.id)

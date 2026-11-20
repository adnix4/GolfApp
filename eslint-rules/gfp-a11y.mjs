// Local accessibility rules for the React Native apps (mobile, admin, packages/ui).
//
// Written in-repo rather than pulling in eslint-plugin-react-native-a11y, which
// is unmaintained and does not support ESLint 10. Both rules ask for a decision
// at each site, not a particular answer: name the thing, or say it is hidden.
// See problemList.txt AX2.

const PRESSABLES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
]);

const IMAGES = new Set(['Image', 'ExpoImage']);

/** `Pressable`, `Animated.Pressable` -> 'Pressable'. */
function elementName(node) {
  const n = node.name;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return n.property.name;
  return null;
}

function attr(node, name) {
  return node.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === name);
}

const hasSpread = node => node.attributes.some(a => a.type === 'JSXSpreadAttribute');

/** `accessible={false}` written as a literal. */
function isExplicitlyFalse(a) {
  return !!a && a.value?.type === 'JSXExpressionContainer'
    && a.value.expression.type === 'Literal' && a.value.expression.value === false;
}

const pressableHasRole = {
  meta: {
    type: 'problem',
    docs: { description: 'Pressable/Touchable* must declare an accessibilityRole (or role)' },
    schema: [],
    messages: {
      missing:
        '{{name}} has no accessibilityRole. Screen readers will not say what it is, and on web it renders as a plain div. '
        + "Add accessibilityRole (\"button\", \"link\", \"tab\", \"checkbox\", ...), or accessible={false} if it is only a backdrop.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!PRESSABLES.has(name)) return;
        if (attr(node, 'accessibilityRole') || attr(node, 'role')) return;
        if (isExplicitlyFalse(attr(node, 'accessible'))) return;
        if (hasSpread(node)) return; // a wrapper forwarding its props carries the role
        context.report({ node, messageId: 'missing', data: { name } });
      },
    };
  },
};

const NAME_ATTRS = ['accessibilityLabel', 'aria-label', 'alt'];
const HIDDEN_ATTRS = ['aria-hidden', 'accessibilityElementsHidden', 'importantForAccessibility'];

const imageHasAlt = {
  meta: {
    type: 'problem',
    docs: { description: 'Image must have a text alternative or be marked decorative' },
    schema: [],
    messages: {
      missing:
        '{{name}} has no text alternative. Add accessibilityLabel describing it, '
        + 'or accessible={false} / aria-hidden if it is decorative.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!IMAGES.has(name)) return;
        if ([...NAME_ATTRS, ...HIDDEN_ATTRS].some(n => attr(node, n))) return;
        if (isExplicitlyFalse(attr(node, 'accessible'))) return;
        if (hasSpread(node)) return;
        context.report({ node, messageId: 'missing', data: { name } });
      },
    };
  },
};

// A Switch has no visible text of its own; the label beside it is a separate
// Text, so a screen reader reaches an anonymous "switch, off".
const switchHasLabel = {
  meta: {
    type: 'problem',
    docs: { description: 'Switch must have an accessibilityLabel' },
    schema: [],
    messages: {
      missing: 'Switch has no name. Add accessibilityLabel matching the visible title next to it.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (elementName(node) !== 'Switch') return;
        if (attr(node, 'accessibilityLabel') || attr(node, 'aria-label') || attr(node, 'aria-labelledby') || hasSpread(node)) return;
        context.report({ node, messageId: 'missing' });
      },
    };
  },
};

// react-native-web drops accessibilityState entirely: a tab marked
// accessibilityState={{ selected: true }} reaches the DOM with no aria-selected.
// The aria-* props work on all three platforms (RN >= 0.71 maps them to the
// native accessibility state, and react-native-web writes them to the DOM).
const STATE_KEYS = ['selected', 'checked', 'expanded', 'busy', 'disabled'];

const noAccessibilityState = {
  meta: {
    type: 'problem',
    docs: { description: 'Use aria-* props instead of accessibilityState (ignored on web)' },
    schema: [],
    messages: {
      banned:
        'accessibilityState is ignored by react-native-web, so the state never reaches the browser. '
        + 'Use the aria-* props instead ({{keys}}); they work on iOS, Android and web.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'accessibilityState') return;
        context.report({ node, messageId: 'banned', data: { keys: STATE_KEYS.map(k => `aria-${k}`).join(', ') } });
      },
    };
  },
};

/** The static value of accessibilityRole / role, or null when it is computed. */
function staticRole(node) {
  const a = attr(node, 'accessibilityRole') ?? attr(node, 'role');
  if (!a?.value) return null;
  if (a.value.type === 'Literal') return a.value.value;
  if (a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'Literal') return a.value.expression.value;
  return null;
}

const NEEDS = { radio: 'aria-checked', checkbox: 'aria-checked', switch: 'aria-checked', tab: 'aria-selected' };

const stateMatchesRole = {
  meta: {
    type: 'problem',
    docs: { description: 'Selectable roles must expose their state (radio/checkbox/switch -> aria-checked, tab -> aria-selected)' },
    schema: [],
    messages: {
      missing:
        'A {{role}} must say whether it is on: add {{prop}}. Without it a screen reader cannot tell which one is chosen.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const role = staticRole(node);
        const prop = NEEDS[role];
        if (!prop || attr(node, prop) || hasSpread(node)) return;
        context.report({ node, messageId: 'missing', data: { role, prop } });
      },
    };
  },
};

// A Text styled as a title (styles.title, c.modalTitle, styles.sectionTitle,
// styles.heading ...) looks like a heading but is announced as plain text, so
// the heading rotor skips it. Use <Heading> from @gfp/ui, which carries the
// role and a level. A title-styled Text that genuinely isn't a heading (a logo
// wordmark, a line item, the label inside a radio card) says so with an
// explicit accessibilityRole="text".
const TITLE_STYLE = /(title|heading)$/i;
const NOT_TITLE_STYLE = /sub(title|heading)$/i;
const TEXTS = new Set(['Text']);

/** Every style name a `style={...}` expression references: styles.title -> 'title'. */
function styleNames(expr, out = []) {
  if (!expr) return out;
  switch (expr.type) {
    case 'MemberExpression':
      if (!expr.computed && expr.property.type === 'Identifier') out.push(expr.property.name);
      break;
    case 'Identifier':
      out.push(expr.name);
      break;
    case 'ArrayExpression':
      expr.elements.forEach(e => styleNames(e, out));
      break;
    case 'LogicalExpression':
      styleNames(expr.right, out);
      break;
    case 'ConditionalExpression':
      styleNames(expr.consequent, out);
      styleNames(expr.alternate, out);
      break;
    default:
      break; // object literals are local tweaks (colour, margin), not a title class
  }
  return out;
}

const titleIsHeading = {
  meta: {
    type: 'problem',
    docs: { description: 'Text styled as a title must be a <Heading> (or say accessibilityRole="text")' },
    schema: [],
    messages: {
      missing:
        'This Text is styled as a title ({{style}}) but screen readers will not find it as a heading. '
        + 'Use <Heading level={1|2|3}> from @gfp/ui, or add accessibilityRole="text" if it is not a heading.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!TEXTS.has(elementName(node))) return;
        if (attr(node, 'accessibilityRole') || attr(node, 'role') || hasSpread(node)) return;
        const style = attr(node, 'style');
        if (style?.value?.type !== 'JSXExpressionContainer') return;
        const hit = styleNames(style.value.expression).find(n => TITLE_STYLE.test(n) && !NOT_TITLE_STYLE.test(n));
        if (hit) context.report({ node, messageId: 'missing', data: { style: hit } });
      },
    };
  },
};

// ── Text contrast (AX4) ──────────────────────────────────────────────────────
// A literal text colour has to be readable somewhere. White text belongs on a
// dark fill and dark text on the page, but a mid-tone (#888, #aaa, the status
// oranges and greens) fails 4.5:1 on white AND on the default dark brand fill,
// so it is unreadable wherever it is used. Use theme.mutedText for greys, the
// status.*Text colours for messages, and theme.actionText for brand links.
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function luminance(hex) {
  const h = hex.slice(1);
  const f = h.length === 3 ? [...h].map(x => x + x).join('') : h;
  return 0.2126 * lin(parseInt(f.slice(0, 2), 16)) + 0.7152 * lin(parseInt(f.slice(2, 4), 16)) + 0.0722 * lin(parseInt(f.slice(4, 6), 16));
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** ECO_GREEN_DEFAULT.primary: the dark fill light text sits on. */
const DARK_FILL = '#31572c';
/** Status FILL colours; each has a *Text twin that reads on white. */
const STATUS_FILLS = { danger: 'dangerText', success: 'successText', warning: 'warningText' };
const TEXT_COLOR_KEYS = new Set(['color', 'placeholderTextColor']);

const CSS_KEY = /^(font|text|line|letter|margin|padding|background|border|flex|display|opacity|width|height|min|max|cursor|position|top|left|right|bottom|align|justify|gap|overflow|transform|whiteSpace)/;

/**
 * A `color:` that styles text: inside a style prop, inside StyleSheet.create,
 * or beside other CSS keys (web style objects). A lookup table such as
 * `{ status: 'Active', color: '#2ecc71' }` is data, and how it is drawn is
 * decided where it is used.
 */
function isStyleProperty(context, node) {
  for (const a of context.sourceCode.getAncestors(node)) {
    if (a.type === 'JSXAttribute' && /style$/i.test(a.name.name)) return true;
    if (a.type === 'CallExpression' && a.callee.type === 'MemberExpression'
      && a.callee.object.name === 'StyleSheet' && a.callee.property.name === 'create') return true;
  }
  return node.parent.type === 'ObjectExpression' && node.parent.properties.some(p =>
    p !== node && p.type === 'Property' && p.key.type === 'Identifier' && CSS_KEY.test(p.key.name));
}

function lowContrastHex(value) {
  return HEX.test(value) && contrast(value, '#ffffff') < 4.5 && contrast(value, DARK_FILL) < 4.5;
}

const noLowContrastText = {
  meta: {
    type: 'problem',
    docs: { description: 'Text colours must reach 4.5:1 on white or on a dark fill' },
    schema: [],
    messages: {
      literal:
        'Text colour {{value}} is {{ratio}}:1 on white and too light for a dark fill, so it is hard to read anywhere. '
        + 'Use theme.mutedText for secondary text, status.dangerText / successText / warningText for messages, '
        + 'or theme.actionText for links.',
      status:
        'status.{{name}} is a fill colour ({{ratio}}:1 on white). For text use status.{{twin}}.',
      pair:
        'Text {{fg}} on {{bg}} is {{ratio}}:1 (needs 4.5:1). Use readableTextOn({{bgName}}) for the label, '
        + 'or a darker fill.',
    },
  },
  create(context) {
    const STATUS_HEX = {
      danger: '#e74c3c', dangerText: '#c0392b', dangerBg: '#fdf2f2', success: '#27ae60', successText: '#1a7f43',
      warning: '#f39c12', warningText: '#8a5a00', infoText: '#1f6fb2',
    };
    /** A colour known at lint time: a hex literal or a status.* token. */
    function staticHex(n) {
      if (!n) return null;
      if (n.type === 'Literal' && typeof n.value === 'string' && HEX.test(n.value)) return n.value;
      if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier'
        && n.object.name === 'status' && STATUS_HEX[n.property.name]) return STATUS_HEX[n.property.name];
      return null;
    }
    const prop = (obj, name) => obj.properties.find(p => p.type === 'Property' && !p.computed
      && (p.key.type === 'Identifier' ? p.key.name : p.key.value) === name);
    function check(keyName, valueNode) {
      if (!TEXT_COLOR_KEYS.has(keyName) || !valueNode) return;
      // `active ? '#fff' : '#888'`, `muted && '#999'`: check each colour it can be.
      if (valueNode.type === 'ConditionalExpression') {
        check(keyName, valueNode.consequent);
        check(keyName, valueNode.alternate);
        return;
      }
      if (valueNode.type === 'LogicalExpression') {
        check(keyName, valueNode.right);
        return;
      }
      if (valueNode.type === 'Literal' && typeof valueNode.value === 'string' && lowContrastHex(valueNode.value)) {
        context.report({ node: valueNode, messageId: 'literal', data: { value: valueNode.value, ratio: contrast(valueNode.value, '#ffffff').toFixed(2) } });
      }
      if (valueNode.type === 'MemberExpression' && !valueNode.computed
        && valueNode.object.type === 'Identifier' && valueNode.object.name === 'status'
        && STATUS_FILLS[valueNode.property.name]) {
        const name = valueNode.property.name;
        const hex = { danger: '#e74c3c', success: '#27ae60', warning: '#f39c12' }[name];
        context.report({ node: valueNode, messageId: 'status', data: { name, twin: STATUS_FILLS[name], ratio: contrast(hex, '#ffffff').toFixed(2) } });
      }
    }
    return {
      Property(node) {
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.value;
        if (key !== 'color' || !isStyleProperty(context, node)) return;
        check(key, node.value);
      },
      // Text and fill set in the same style object: check them against each other.
      ObjectExpression(node) {
        const fg = prop(node, 'color');
        const bg = prop(node, 'backgroundColor') ?? prop(node, 'background');
        const fgHex = staticHex(fg?.value);
        const bgHex = staticHex(bg?.value);
        if (!fgHex || !bgHex) return;
        const ratio = contrast(fgHex, bgHex);
        if (ratio >= 4.5) return;
        context.report({ node: fg.value, messageId: 'pair', data: {
          fg: fgHex, bg: bgHex, ratio: ratio.toFixed(2), bgName: context.sourceCode.getText(bg.value),
        } });
      },
      // Only the placeholder: a `color` PROP sets an icon or spinner, which is
      // a graphic (3:1), not text.
      JSXAttribute(node) {
        if (node.name.name !== 'placeholderTextColor') return;
        if (node.value?.type === 'Literal') check(node.name.name, node.value);
        else if (node.value?.type === 'JSXExpressionContainer') check(node.name.name, node.value.expression);
      },
    };
  },
};

// ── no-short-message-timer (AX5) ─────────────────────────────────────────────
// `setTimeout(() => setSaved(false), 3000)` takes a message down before people
// can read it. MCAG 1.3.2: a short message stays at least 6 s and is announced.
// Flags a timer of 1–6 s whose callback only clears a piece of state
// (set*(false | null | '' | undefined)). Under 1 s is animation cleanup, not
// a message, so it is left alone.

const CLEARED = new Set([false, null, '']);

function clearsState(fn) {
  if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return null;
  let body = fn.body;
  if (body.type === 'BlockStatement') {
    if (body.body.length !== 1 || body.body[0].type !== 'ExpressionStatement') return null;
    body = body.body[0].expression;
  }
  if (body.type !== 'CallExpression' || body.callee.type !== 'Identifier') return null;
  if (!/^set[A-Z]/.test(body.callee.name) || body.arguments.length !== 1) return null;
  const arg = body.arguments[0];
  const cleared = (arg.type === 'Literal' && CLEARED.has(arg.value))
    || (arg.type === 'Identifier' && arg.name === 'undefined');
  return cleared ? body.callee.name : null;
}

const noShortMessageTimer = {
  meta: {
    type: 'problem',
    docs: { description: 'Self-clearing messages stay at least 6 s (MCAG 1.3.2)' },
    schema: [],
    messages: {
      short:
        '{{setter}} clears this message after {{ms}} ms — too soon to read. Short messages stay at least 6 s '
        + 'and are announced: use useTimedMessage (@gfp/shared-types) with a LiveRegion (@gfp/ui) or aria-live.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const isTimer = (callee.type === 'Identifier' && callee.name === 'setTimeout')
          || (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'setTimeout');
        if (!isTimer || node.arguments.length < 2) return;
        const delay = node.arguments[1];
        if (delay.type !== 'Literal' || typeof delay.value !== 'number') return;
        if (delay.value < 1000 || delay.value >= 6000) return;
        const setter = clearsState(node.arguments[0]);
        if (setter) context.report({ node, messageId: 'short', data: { setter, ms: String(delay.value) } });
      },
    };
  },
};

// ── input-has-label (AX6 prep) ───────────────────────────────────────────────
// A <TextInput> whose label is a separate <Text> above it is announced by its
// placeholder ("you@example.com, text field") or by nothing at all. Give the
// field its own name: accessibilityLabel (or aria-label / aria-labelledby).
const INPUTS = new Set(['TextInput', 'MoneyInput']);
const LABEL_ATTRS = ['accessibilityLabel', 'aria-label', 'aria-labelledby', 'accessibilityLabelledBy'];

const inputHasLabel = {
  meta: {
    type: 'problem',
    docs: { description: 'Text fields need their own accessible name' },
    schema: [],
    messages: {
      missing:
        '{{name}} has no accessibilityLabel. Screen readers read its placeholder (or nothing), not the label text above it. '
        + 'Add accessibilityLabel matching the visible label.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!INPUTS.has(name)) return;
        if (LABEL_ATTRS.some(a => attr(node, a))) return;
        if (hasSpread(node)) return; // a wrapper forwarding its props carries the label
        context.report({ node, messageId: 'missing', data: { name } });
      },
    };
  },
};

export default {
  meta: { name: 'gfp-a11y' },
  rules: {
    'no-low-contrast-text': noLowContrastText,
    'no-short-message-timer': noShortMessageTimer,
    'title-is-heading': titleIsHeading,
    'pressable-has-role': pressableHasRole,
    'input-has-label': inputHasLabel,
    'image-has-alt': imageHasAlt,
    'switch-has-label': switchHasLabel,
    'no-accessibility-state': noAccessibilityState,
    'state-matches-role': stateMatchesRole,
  },
};

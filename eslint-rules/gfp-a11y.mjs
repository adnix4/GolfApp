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

export default {
  meta: { name: 'gfp-a11y' },
  rules: {
    'pressable-has-role': pressableHasRole,
    'image-has-alt': imageHasAlt,
    'switch-has-label': switchHasLabel,
    'no-accessibility-state': noAccessibilityState,
    'state-matches-role': stateMatchesRole,
  },
};

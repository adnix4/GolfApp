// Minimal React Native stub for test environments (no native runtime).
export const Platform = { OS: 'ios', select: (spec) => spec.ios ?? spec.default };
export const AppRegistry = {
  registerHeadlessTask: () => {},
  registerComponent:    () => {},
};
export const NativeModules = {};
export const NativeEventEmitter = class {
  addListener()    { return { remove() {} }; }
  removeListener() {}
};
// AppState with a test hook: __setState(next) updates currentState and fires
// every 'change' listener, as the real module does on foreground/background.
const appStateListeners = new Set();
export const AppState = {
  currentState: 'active',
  addEventListener(type, fn) {
    if (type !== 'change') return { remove() {} };
    appStateListeners.add(fn);
    return { remove() { appStateListeners.delete(fn); } };
  },
  __setState(next) {
    AppState.currentState = next;
    for (const fn of [...appStateListeners]) fn(next);
  },
  __listenerCount() { return appStateListeners.size; },
};
// AccessibilityInfo with test hooks: __set(setting, on) changes what the next
// read returns, __emit(event, on) fires that event's listeners.
const a11yState = { reduceMotion: false, screenReader: false };
const a11yListeners = new Map();
export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(a11yState.reduceMotion),
  isScreenReaderEnabled: () => Promise.resolve(a11yState.screenReader),
  announceForAccessibility: () => {},
  addEventListener(event, fn) {
    if (!a11yListeners.has(event)) a11yListeners.set(event, new Set());
    a11yListeners.get(event).add(fn);
    return { remove() { a11yListeners.get(event)?.delete(fn); } };
  },
  __set(setting, on) { a11yState[setting] = on; },
  __emit(event, on) { for (const fn of [...(a11yListeners.get(event) ?? [])]) fn(on); },
  __listenerCount(event) { return a11yListeners.get(event)?.size ?? 0; },
  __reset() {
    a11yState.reduceMotion = false;
    a11yState.screenReader = false;
    a11yListeners.clear();
  },
};
export default {};

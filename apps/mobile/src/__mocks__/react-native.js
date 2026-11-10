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
export default {};

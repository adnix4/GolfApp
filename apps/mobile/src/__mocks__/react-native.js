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
export default {};

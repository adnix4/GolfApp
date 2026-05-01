// Minimal stub for expo-modules-core used by expo-task-manager and expo-background-fetch.
// Only exports consumed by the GFP codebase are stubbed.
export const LegacyEventEmitter = class {
  addListener() { return { remove() {} }; }
  removeListener() {}
  emit() {}
};
export const Platform = {
  OS: 'ios',
  select: (spec) => spec.ios ?? spec.default ?? spec.web,
};
export const UnavailabilityError = class extends Error {
  constructor(moduleName, funcName) {
    super(`${moduleName}.${funcName} is unavailable in tests`);
  }
};
export const requireNativeModule = () => new Proxy({}, {
  get: () => () => {},
});
export const NativeModulesProxy = {};
export const EventEmitter = LegacyEventEmitter;
export default {};

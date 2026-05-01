// Minimal expo package stub for test environments.
export const isRunningInExpoGo = () => false;
export const registerRootComponent = () => {};
export const requireNativeModule = () => new Proxy({}, { get: () => () => {} });
export default {};

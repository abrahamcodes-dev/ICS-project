import 'firebase/auth';

// Firebase 12.19 exports this from its React Native runtime, but the package's
// first `types` condition selects auth-public.d.ts, which omits this function.
// Signature matches @firebase/auth/dist/rn/src/platform_react_native/persistence/react_native.d.ts.
declare module 'firebase/auth' {
  export function getReactNativePersistence(
    storage: import('firebase/auth').ReactNativeAsyncStorage,
  ): import('firebase/auth').Persistence;
}

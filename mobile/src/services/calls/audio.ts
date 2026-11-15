import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import type { CallMode } from '@shared/types/consultationCallContracts';

let active: (() => void) | undefined;
/** Own the native communication session, independently of SDP and video rendering. */
export function startCallAudio(mode: CallMode, interrupted: () => void) {
  const manager = (require('react-native-incall-manager') as typeof import('react-native-incall-manager')).default;
  // Do not steal routing from another mounted call while its microphone lives.
  if (active) throw new Error('Call audio is already in use.');
  let stopped = false;
  let focus: ReturnType<typeof DeviceEventEmitter.addListener> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    focus?.remove();
    if (active === stop) active = undefined;
    manager.stop();
  };
  active = stop;
  try {
    // Native automatic routing prefers connected headsets; video otherwise uses
    // speaker, audio uses earpiece. Do not change the user's system volume.
    manager.start({media: mode, auto: true});
    if (Platform.OS === 'android') {
      focus = DeviceEventEmitter.addListener('onAudioFocusChange', ({eventCode}: {eventCode?: number}) => {
        // Never silently resume capture after another call/app interrupts it.
        // CAN_DUCK (-3) permits continued playback (e.g. a notification).
        if (!stopped && (eventCode === -1 || eventCode === -2)) interrupted();
      });
    }
  } catch (error) { stop(); throw error; }
  return {
    stop,
    speaker(enabled: boolean | null) {
      if (!stopped) {
        if (enabled !== null) manager.setForceSpeakerphoneOn(enabled);
        // The documented JS null maps to native 0 (automatic). The package's
        // declaration incorrectly accepts only boolean; use its native contract.
        else NativeModules.InCallManager.setForceSpeakerphoneOn(0);
      }
    },
  };
}

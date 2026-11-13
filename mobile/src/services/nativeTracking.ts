import { requireOptionalNativeModule } from 'expo-modules-core';
import type { TrackingPreferences } from './api';

export interface NativeTrackingStatus {
  state: 'monitoring_enabled' | 'walking_detected' | 'gps_tracking_active' | 'stationary' | 'permission_required' | 'tracking_paused' | 'disabled' | 'sync_error';
  message?: string;
  syncError?: string;
  activityType?: 'walking' | 'running' | 'on_bicycle' | 'in_vehicle' | 'still';
}

interface FitSenseTrackingModule {
  configure(
    preferences: TrackingPreferences,
    apiBaseUrl: string,
    token: string,
    accountId: string,
    weightKg: number,
    healthConnectAvailable: boolean,
    healthConnectBackgroundRead: boolean,
  ): Promise<NativeTrackingStatus>;
  getStatus(): Promise<NativeTrackingStatus>;
  getPendingSessions(): Promise<Record<string, unknown>[]>;
  acknowledgeSession(clientSessionId: string): Promise<void>;
  getFallbackSteps(dayKey: string): Promise<number>;
}

const nativeModule = requireOptionalNativeModule<FitSenseTrackingModule>('FitSenseTracking');

export function isNativeTrackingAvailable() {
  return nativeModule !== null;
}

function getModule() {
  if (!nativeModule) {
    throw new Error('FitSense background tracking requires a custom Android build; Expo Go is not supported.');
  }
  return nativeModule;
}

export const configureNativeTracking = (...args: Parameters<FitSenseTrackingModule['configure']>) =>
  getModule().configure(...args);
export const getNativeTrackingStatus = () => getModule().getStatus();
export const getPendingNativeSessions = () => getModule().getPendingSessions();
export const acknowledgeNativeSession = (id: string) => getModule().acknowledgeSession(id);
export const getFallbackSteps = (dayKey: string) => getModule().getFallbackSteps(dayKey);

import { Platform } from 'react-native';
import {
  aggregateRecord,
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  SdkAvailabilityStatus,
  type BackgroundAccessPermission,
  type Permission,
  type ReadHealthDataHistoryPermission,
} from 'react-native-health-connect';
import * as SecureStore from 'expo-secure-store';
import { syncDailySteps } from './api';

const STEPS_PERMISSION: Permission = { accessType: 'read', recordType: 'Steps' };
const BACKGROUND_PERMISSION: BackgroundAccessPermission = {
  accessType: 'read',
  recordType: 'BackgroundAccessPermission',
};
const HISTORY_PERMISSION: ReadHealthDataHistoryPermission = {
  accessType: 'read',
  recordType: 'ReadHealthDataHistory',
};

function localDayKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localMidnight(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDay(dayKey: string, amount: number) {
  const date = localMidnight(dayKey);
  date.setDate(date.getDate() + amount);
  return localDayKey(date);
}

export function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export async function healthConnectStatus() {
  if (Platform.OS !== 'android') return { available: false, granted: false, backgroundRead: false };
  const status = await getSdkStatus();
  const available = status === SdkAvailabilityStatus.SDK_AVAILABLE;
  if (!available) return { available: false, granted: false, backgroundRead: false };

  await initialize();
  const permissions = await getGrantedPermissions();
  const granted = permissions.some((permission) => (
    permission.accessType === 'read' && permission.recordType === 'Steps'
  ));
  const backgroundRead = permissions.some((permission) => (
    permission.recordType === 'BackgroundAccessPermission'
  ));
  return { available, granted, backgroundRead };
}

export async function requestStepPermissions(includeHistory = false) {
  const { available } = await healthConnectStatus();
  if (!available) return { available: false, granted: false, backgroundRead: false };

  const requested: (Permission | BackgroundAccessPermission | ReadHealthDataHistoryPermission)[] = [
    STEPS_PERMISSION,
  ];
  if (Number(Platform.Version) >= 34) requested.push(BACKGROUND_PERMISSION);
  if (includeHistory) requested.push(HISTORY_PERMISSION);
  await requestPermission(requested);
  return healthConnectStatus();
}

export async function syncHealthConnectHistory(userId: string, days = 30, forceHistory = false) {
  const status = await healthConnectStatus();
  if (!status.granted) return { available: status.available, syncedDays: 0 };

  const timeZone = currentTimeZone();
  const todayKey = localDayKey(new Date());
  const syncKey = `fitsense.health-connect.last-sync.${userId}`;
  const lastSyncedDay = await SecureStore.getItemAsync(syncKey);
  const syncFullRange = forceHistory || lastSyncedDay !== todayKey;
  const rangeLength = syncFullRange ? days : 1;
  const firstDayKey = shiftDay(todayKey, -(rangeLength - 1));
  const start = localMidnight(firstDayKey);
  const end = localMidnight(shiftDay(todayKey, 1));
  const buckets = await aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: {
      operator: 'between',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const stepsByDay = new Map(
    buckets.map((bucket) => [
      localDayKey(new Date(bucket.startTime)),
      Math.max(0, Math.floor(bucket.result.COUNT_TOTAL || 0)),
    ]),
  );

  for (let offset = 0; offset < rangeLength; offset += 1) {
    const dayKey = shiftDay(firstDayKey, offset);
    await syncDailySteps({
      dayKey,
      steps: stepsByDay.get(dayKey) || 0,
      source: 'health_connect',
      timeZone,
    });
  }
  await SecureStore.setItemAsync(syncKey, todayKey);
  return { available: true, syncedDays: rangeLength };
}

export async function getSessionStepCount(startTime: string, endTime: string) {
  const status = await healthConnectStatus();
  if (!status.granted) return undefined;
  const result = await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime, endTime },
  });
  return Math.max(0, Math.min(200_000, Math.floor(result.COUNT_TOTAL || 0)));
}

export { openHealthConnectSettings, localDayKey, shiftDay };

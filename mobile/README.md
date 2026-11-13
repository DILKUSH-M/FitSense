# FitSense Android app

The mobile app is an Expo/React Native client for the existing FitSense backend.
Its local Kotlin module provides the Android hardware step-counter fallback.
Automatic activity recognition and GPS tracking are disabled in the mobile app.
The website and MongoDB backend remain the shared account and data source.

## Configure and run

1. Install the root/backend/frontend dependencies as described in the root
   README, then install the mobile dependencies with `npm install` from this
   directory.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend
   API root, including `/api`. The default `http://10.0.2.2:5000/api` works
   with the Android emulator. A physical phone needs a reachable HTTPS URL or
   your development machine's LAN address and a backend configured to accept
   that connection.
3. Use a Java 17 toolchain and Android SDK 36. Build/install a native Android
   development build with `npm run android`; `npm start` alone and Expo Go do
   not include the Kotlin module. Use a physical Android device for background
   behavior checks.

## Tracking and privacy behavior

- Steps are the only automatically tracked metric. GPS is not used to count
  steps. Android Health Connect is preferred because it can combine step
  sources; when unavailable, a custom Android build can use the phone's
  hardware step counter. The sensor fallback starts after opt-in and cannot
  backfill earlier steps.
- Automatic activity detection, GPS distance, route collection, and activity
  calorie estimates are disabled in the mobile app. Existing historical records
  are not deleted.
- Workout time is recorded only when the user starts and stops the timer.
  Water is adjusted manually in 250 ml increments, and meal calories are
  entered by the user and summed for today. Timer records are rounded to whole
  minutes.
- Health Connect background/history reads require the matching permissions.
  Step summaries are account-scoped and retried when connectivity returns.
  Account export and deletion include the tracking records.

## Device verification checklist

The native project must be compiled and tested on a physical Android device
before release. Verify at least:

1. Enable/disable steps and grant/revoke Health Connect permissions.
2. Health Connect totals with overlapping sources, history sync, and the
   hardware step-counter fallback on a device without Health Connect.
3. Confirm the app does not request location or activity-recognition
   permissions, start GPS tracking, or create automatic activity records.
4. Verify manual workout timer, water, and meal logging.
5. Test offline step synchronization, retry after reconnect, and account
   switching.

Physical-device execution is not represented by the TypeScript checks or Expo
prebuild. Record OS version, device model, permission state, and observed
results for each release test.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DashboardData,
  FitSenseApiError,
  NutritionEntry,
  TrackingPreferences,
  User,
  apiBaseUrl,
  clearAuthToken,
  createActivity,
  createNutritionEntry,
  createWorkout,
  getAuthTokenForNative,
  getCurrentUser,
  getDashboard,
  getTrackingPreferences,
  login,
  logout,
  register,
  syncActivitySession,
  syncDailySteps,
  updateActivityWater,
  updateTrackingPreferences,
} from './src/services/api';
import {
  acknowledgeNativeSession,
  configureNativeTracking,
  getFallbackSteps,
  getPendingNativeSessions,
  isNativeTrackingAvailable,
} from './src/services/nativeTracking';
import {
  currentTimeZone,
  getSessionStepCount,
  healthConnectStatus,
  localDayKey,
  openHealthConnectSettings,
  requestStepPermissions,
  shiftDay,
  syncHealthConnectHistory,
} from './src/services/healthConnect';

const initialPreferences: TrackingPreferences = {
  enabled: false,
  paused: false,
  dailyStepsEnabled: false,
  storeRoute: false,
  stationaryEndMinutes: 5,
  timeZone: currentTimeZone(),
};

const initialDashboard: DashboardData = {
  summary: {
    todaySteps: 0,
    todayCalories: 0,
    todayCaloriesConsumed: 0,
    todayActiveMinutes: 0,
    todayWalkingDistanceKm: 0,
    todaySessionActiveMinutes: 0,
    todaySessionCalories: 0,
    totalDuration: 0,
    waterIntakeMl: 0,
  },
  recentActivities: [],
  recentSessions: [],
  weeklyProgress: { dailySteps: [], walkingDistanceKm: 0, activeMinutes: 0, sessions: 0 },
};

function confirmConsent(title: string, message: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${remainingSeconds}`;
}

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.caption}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#334155', true: '#84cc16' }}
        thumbColor={value ? '#f8fafc' : '#cbd5e1'}
      />
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [screen, setScreen] = useState<'dashboard' | 'settings'>('dashboard');
  const [preferences, setPreferences] = useState(initialPreferences);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [healthStatus, setHealthStatus] = useState({ available: false, granted: false, backgroundRead: false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stepsOptIn, setStepsOptIn] = useState(false);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [workoutElapsedSeconds, setWorkoutElapsedSeconds] = useState(0);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [savingWater, setSavingWater] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [foodCalories, setFoodCalories] = useState('');
  const [mealType, setMealType] = useState<NutritionEntry['mealType']>('Breakfast');
  const [savingMeal, setSavingMeal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (workoutStartedAt === null) return undefined;
    const timer = setInterval(() => {
      setWorkoutElapsedSeconds(Math.floor((Date.now() - workoutStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [workoutStartedAt]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const token = await getAuthTokenForNative();
        if (!token) return;
        const response = await getCurrentUser();
        if (active) setUser(response.user);
      } catch (restoreError) {
        if (restoreError instanceof FitSenseApiError && restoreError.status === 401) {
          await clearAuthToken();
        } else if (active) {
          setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore the saved session.');
        }
      } finally {
        if (active) setAuthReady(true);
      }
    }
    restore();
    return () => { active = false; };
  }, []);

  const syncPendingSessions = useCallback(async () => {
    if (!user || !isNativeTrackingAvailable()) return;
    const pending = await getPendingNativeSessions();
    for (const session of pending) {
      const sessionId = String(session.clientSessionId || '');
      if (!sessionId) continue;
      if (session.ownerUserId !== user._id) continue;
      try {
        const sessionWithSteps = { ...session };
        if (
          Platform.OS === 'android'
          && preferences.dailyStepsEnabled
          && session.status === 'completed'
          && session.steps === undefined
          && typeof session.startedAt === 'string'
          && typeof session.endedAt === 'string'
        ) {
          const steps = await getSessionStepCount(session.startedAt, session.endedAt);
          if (steps !== undefined) sessionWithSteps.steps = steps;
        }
        await syncActivitySession(sessionWithSteps);
        await acknowledgeNativeSession(sessionId);
      } catch (syncError) {
        setNotice(syncError instanceof Error ? `Session sync will retry: ${syncError.message}` : 'Session sync will retry when online.');
        break;
      }
    }
  }, [preferences.dailyStepsEnabled, user]);

  const configureNative = useCallback(async (nextPreferences: TrackingPreferences) => {
    if (!user || Platform.OS !== 'android') return;
    if (!isNativeTrackingAvailable()) return;

    try {
      const health = await healthConnectStatus();
      setHealthStatus(health);
      const token = await getAuthTokenForNative();
      const status = await configureNativeTracking(
        nextPreferences,
        apiBaseUrl,
        token,
        user._id,
        Number(user.weight) || 68,
        health.available,
        health.backgroundRead,
      );
    } catch (nativeError) {
      setError(nativeError instanceof Error ? nativeError.message : 'Android step tracking could not be configured.');
    }
  }, [user]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    setLoadingDashboard(true);
    setError('');
    try {
      const loadedPreferences = { ...initialPreferences, ...await getTrackingPreferences() };
      let nextPreferences = loadedPreferences;
      if (loadedPreferences.enabled || loadedPreferences.paused || loadedPreferences.storeRoute) {
        const disabledPreferences = await updateTrackingPreferences({
          enabled: false,
          paused: false,
          storeRoute: false,
        });
        nextPreferences = { ...loadedPreferences, ...disabledPreferences };
      }
      setPreferences(nextPreferences);
      await configureNative(nextPreferences);

      if (nextPreferences.dailyStepsEnabled && Platform.OS === 'android') {
        try {
          const health = await healthConnectStatus();
          setHealthStatus(health);
          if (health.granted) {
            await syncHealthConnectHistory(user._id);
          } else if (!health.available && isNativeTrackingAvailable()) {
            const dayKey = localDayKey(new Date());
            const steps = await getFallbackSteps(dayKey);
            if (steps > 0) {
              await syncDailySteps({
                dayKey,
                steps,
                source: 'android_sensor',
                timeZone: currentTimeZone(),
              });
            }
          }
        } catch (healthError) {
          setNotice(healthError instanceof Error ? healthError.message : 'Step data could not be synchronized.');
        }
      }

      await syncPendingSessions();
      const dashboardResponse = await getDashboard();
      setDashboard(dashboardResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load FitSense activity data.');
    } finally {
      setLoadingDashboard(false);
    }
  }, [configureNative, syncPendingSessions, user]);

  const startWorkoutTimer = () => {
    setWorkoutStartedAt(Date.now());
    setWorkoutElapsedSeconds(0);
    setError('');
    setNotice('Workout timer started.');
  };

  const stopWorkoutTimer = async () => {
    if (workoutStartedAt === null || savingWorkout) return;
    const endedAt = Date.now();
    const durationSeconds = Math.max(0, Math.floor((endedAt - workoutStartedAt) / 1000));
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    setSavingWorkout(true);
    setError('');
    setNotice('');
    try {
      await createWorkout({
        exerciseName: 'Timed workout',
        category: 'Full body',
        targetMuscleGroup: 'General',
        sets: 1,
        reps: 1,
        weight: 0,
        durationMinutes,
        workoutDate: new Date(workoutStartedAt).toISOString(),
        notes: `Mobile timer session · ${durationSeconds} seconds`,
      });
      setWorkoutStartedAt(null);
      setWorkoutElapsedSeconds(0);
      await refreshData();
      setNotice(`Workout saved (${durationMinutes} min, rounded to the nearest minute).`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this workout.');
    } finally {
      setSavingWorkout(false);
    }
  };

  const changeWaterIntake = async (deltaMl: number) => {
    if (savingWater) return;
    const currentMl = dashboard.summary.waterIntakeMl || 0;
    const nextMl = Math.max(0, Math.min(20000, currentMl + deltaMl));
    if (nextMl === currentMl) return;

    setSavingWater(true);
    setError('');
    setNotice('');
    try {
      const todayKey = localDayKey(new Date());
      const todayActivities = dashboard.recentActivities
        .filter((activity) => (
          !activity.historicalBaseline
          && (activity.dayKey || localDayKey(new Date(activity.date))) === todayKey
        ));
      const waterActivities = todayActivities.filter((activity) => activity.waterIntakeMl > 0);
      const primaryRecord = waterActivities[0];

      if (primaryRecord) {
        await updateActivityWater(primaryRecord._id, nextMl);
        for (const activity of waterActivities) {
          if (activity._id !== primaryRecord._id) await updateActivityWater(activity._id, 0);
        }
      } else {
        await createActivity({
          date: new Date().toISOString(),
          dayKey: todayKey,
          waterIntakeMl: nextMl,
          source: 'manual',
        });
      }

      await refreshData();
      setNotice(`Water intake updated to ${nextMl.toLocaleString()} ml today.`);
    } catch (waterError) {
      setError(waterError instanceof Error ? waterError.message : 'Unable to update water intake.');
    } finally {
      setSavingWater(false);
    }
  };

  const logMeal = async () => {
    const calories = Number(foodCalories);
    if (!foodName.trim() || !Number.isFinite(calories) || calories <= 0 || calories > 20000) {
      setError('Enter a food name and a calorie amount between 1 and 20000.');
      return;
    }

    setSavingMeal(true);
    setError('');
    setNotice('');
    try {
      await createNutritionEntry({
        mealType,
        foodName: foodName.trim(),
        quantity: '1 serving',
        calories,
        protein: 0,
        carbs: 0,
        fat: 0,
        intakeDate: new Date().toISOString(),
      });
      setFoodName('');
      setFoodCalories('');
      await refreshData();
      setNotice('Meal logged. Today’s calorie intake has been updated.');
    } catch (mealError) {
      setError(mealError instanceof Error ? mealError.message : 'Unable to log this meal.');
    } finally {
      setSavingMeal(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [refreshData, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) refreshData();
    });
    return () => subscription.remove();
  }, [refreshData, user]);

  const savePreferences = useCallback(async (updates: Partial<TrackingPreferences>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const nextPreferences = await updateTrackingPreferences({
        ...updates,
        timeZone: currentTimeZone(),
      });
      setPreferences(nextPreferences);
      await configureNative(nextPreferences);
      setNotice('Tracking preferences saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save tracking preferences.');
    } finally {
      setBusy(false);
    }
  }, [configureNative]);

  const enableDailySteps = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setNotice('All-day Health Connect step tracking is available on Android.');
      return;
    }
    const confirmed = await confirmConsent(
      'Enable daily step tracking',
      'FitSense will read daily and recent step totals from Health Connect and synchronize those summaries to your account. Health Connect combines overlapping step sources. If it is unavailable, FitSense can use the device step sensor from the time you enable it; it cannot recover earlier steps from that fallback.',
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const health = await requestStepPermissions();
      setHealthStatus(health);
      if (!health.available) {
        if (!isNativeTrackingAvailable()) {
          setNotice('Health Connect is unavailable and the phone-sensor fallback requires a custom Android build.');
          return;
        }
        const motionPermission = Number(Platform.Version) < 29
          || await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION)
          === PermissionsAndroid.RESULTS.GRANTED;
        if (!motionPermission) {
          setNotice('Health Connect is unavailable and Android motion permission is needed for the device step-counter fallback.');
        }
      }
      const next = await updateTrackingPreferences({ dailyStepsEnabled: true, timeZone: currentTimeZone() });
      setPreferences(next);
      await configureNative(next);
      await refreshData();
      if (health.available && !health.granted) {
        setNotice('Health Connect is available, but step access was not granted. You can review it in Settings.');
      } else if (!health.available) {
        setNotice('Daily steps will use the device sensor from now on; earlier days are not available through this fallback.');
      } else {
        setNotice('Daily step tracking is enabled.');
      }
    } catch (stepsError) {
      setError(stepsError instanceof Error ? stepsError.message : 'Unable to enable daily steps.');
    } finally {
      setBusy(false);
    }
  }, [configureNative, refreshData]);

  const handleAuthentication = async () => {
    setBusy(true);
    setError('');
    try {
      const signedInUser = registerMode
        ? await register(name.trim(), email.trim(), password)
        : await login(email.trim(), password);
      setUser(signedInUser);
      if (registerMode) {
        const next = await updateTrackingPreferences({
          enabled: false,
          paused: false,
          dailyStepsEnabled: false,
          storeRoute: false,
          stationaryEndMinutes: 5,
          timeZone: currentTimeZone(),
        });
        setPreferences(next);
        if (stepsOptIn) await enableDailySteps();
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to authenticate with FitSense.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    let disabledPreferences: TrackingPreferences;
    try {
      disabledPreferences = await updateTrackingPreferences({
        enabled: false,
        paused: false,
        dailyStepsEnabled: false,
        storeRoute: false,
        timeZone: currentTimeZone(),
      });
      setPreferences(disabledPreferences);
      await configureNative(disabledPreferences);
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Unable to disable tracking before sign out.');
      return;
    }
    let logoutMessage = '';
    try {
      await logout();
    } catch {
      logoutMessage = 'The server did not confirm sign out; the saved token was removed from this device.';
    } finally {
      await configureNative(disabledPreferences);
    }
    setUser(null);
    setDashboard(initialDashboard);
    setScreen('dashboard');
    if (logoutMessage) setError(logoutMessage);
  };

  const syncHistoricalSteps = async () => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const permissionStatus = await requestStepPermissions(true);
      setHealthStatus(permissionStatus);
      if (!permissionStatus.granted) {
        setNotice('Historical Health Connect permission is required to read older step records.');
        return;
      }
      const result = await syncHealthConnectHistory(user?._id || '', 90, true);
      await refreshData();
      setNotice(`Synchronized ${result.syncedDays} days of step history.`);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Historical steps could not be synchronized.');
    } finally {
      setBusy(false);
    }
  };

  const todaysSteps = dashboard.summary.todaySteps || 0;
  const todayCaloriesConsumed = dashboard.summary.todayCaloriesConsumed || 0;

  if (!authReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#a3e635" />
        <Text style={styles.caption}>Loading FitSense…</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>FITNESS, WITHOUT THE GUESSWORK</Text>
          <Text style={styles.title}>FitSense</Text>
          <Text style={styles.caption}>Sign in to sync your activity with your FitSense account.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          {registerMode && Platform.OS === 'android' ? (
            <TextInput
              accessibilityLabel="Full name"
              placeholder="Full name"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Password"
            placeholder="Password (at least 8 characters)"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          {registerMode ? (
            <Card title="Initial setup">
              <ToggleRow
                title="Enable daily step tracking"
                description="Optional and independent of GPS. Reads steps from Health Connect or a device sensor fallback."
                value={stepsOptIn}
                onValueChange={setStepsOptIn}
              />
            </Card>
          ) : null}
          <ActionButton
            label={busy ? 'Please wait…' : registerMode ? 'Create account' : 'Sign in'}
            onPress={handleAuthentication}
            disabled={busy || !email || !password || (registerMode && !name)}
          />
          <Pressable onPress={() => { setRegisterMode(!registerMode); setError(''); }}>
            <Text style={styles.linkText}>
              {registerMode ? 'Already have an account? Sign in' : 'New to FitSense? Create an account'}
            </Text>
          </Pressable>
        </ScrollView>
        <StatusBar barStyle="light-content" />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FITSENSE · MOVEMENT</Text>
          <Text style={styles.title}>{screen === 'dashboard' ? 'Your activity' : 'Settings'}</Text>
        </View>
        <Pressable onPress={signOut} accessibilityRole="button">
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.nav}>
        <Pressable onPress={() => setScreen('dashboard')} style={[styles.navItem, screen === 'dashboard' && styles.navItemActive]}>
          <Text style={[styles.navText, screen === 'dashboard' && styles.navTextActive]}>Dashboard</Text>
        </Pressable>
        <Pressable onPress={() => setScreen('settings')} style={[styles.navItem, screen === 'settings' && styles.navItemActive]}>
          <Text style={[styles.navText, screen === 'settings' && styles.navTextActive]}>Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}
        {screen === 'dashboard' ? (
          <>
            {dashboard.historicalData?.hasHistoricalSampleData ? (
              <Text style={styles.sampleNotice}>Historical sample data is included; generated values are illustrative, not measured activity.</Text>
            ) : null}
            <Card title="Phone step tracking">
              <Text style={styles.caption}>
                Steps are the only automatically tracked metric. FitSense uses Health Connect or the Android step sensor; GPS is not used to count steps.
              </Text>
              {Platform.OS === 'android' ? (
                preferences.dailyStepsEnabled ? (
                  <Text style={styles.rowTitle}>Daily step tracking is on · {todaysSteps.toLocaleString()} steps today</Text>
                ) : (
                  <ActionButton
                    label="Enable daily steps"
                    onPress={() => void enableDailySteps()}
                    disabled={busy}
                  />
                )
              ) : (
                <Text style={styles.caption}>Daily step sensor integration is currently available in the Android app.</Text>
              )}
            </Card>

            <View style={styles.metrics}>
              <Metric label="Today's steps" value={todaysSteps.toLocaleString()} />
              <Metric label="Calories eaten today" value={`${Math.round(todayCaloriesConsumed)} kcal`} />
            </View>

            <Card title="Workout timer">
              <Text style={styles.timerValue}>{formatTimer(workoutElapsedSeconds)}</Text>
              <Text style={styles.caption}>
                {dashboard.summary.totalDuration || 0} min of logged workouts this week. Timer sessions are rounded to the nearest minute.
              </Text>
              <ActionButton
                label={savingWorkout ? 'Saving workout…' : workoutStartedAt === null ? 'Start workout' : 'Stop and save workout'}
                onPress={() => {
                  if (workoutStartedAt === null) startWorkoutTimer();
                  else void stopWorkoutTimer();
                }}
                disabled={savingWorkout}
              />
            </Card>

            <Card title="Water today">
              <Text style={styles.value}>{((dashboard.summary.waterIntakeMl || 0) / 1000).toFixed(2)} L</Text>
              <Text style={styles.caption}>Quick log in 250 ml steps</Text>
              <View style={styles.waterControls}>
                <ActionButton
                  label="− 250 ml"
                  onPress={() => void changeWaterIntake(-250)}
                  secondary
                  disabled={savingWater || !dashboard.summary.waterIntakeMl}
                />
                <ActionButton
                  label={savingWater ? 'Saving…' : '+ 250 ml'}
                  onPress={() => void changeWaterIntake(250)}
                  disabled={savingWater || (dashboard.summary.waterIntakeMl || 0) >= 20000}
                />
              </View>
            </Card>

            <Card title="Log meal calories">
              <TextInput
                accessibilityLabel="Food or meal name"
                placeholder="Food or meal"
                placeholderTextColor="#64748b"
                value={foodName}
                onChangeText={setFoodName}
                maxLength={100}
                style={styles.input}
              />
              <View style={styles.mealTypeRow}>
                {(['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setMealType(type)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mealType === type }}
                    style={[styles.mealTypeButton, mealType === type && styles.mealTypeButtonActive]}
                  >
                    <Text style={[styles.mealTypeText, mealType === type && styles.mealTypeTextActive]}>{type}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Meal calories"
                placeholder="Calories (kcal)"
                placeholderTextColor="#64748b"
                keyboardType="decimal-pad"
                value={foodCalories}
                onChangeText={setFoodCalories}
                maxLength={5}
                style={styles.input}
              />
              <Text style={styles.caption}>Enter calories from the food label or your own estimate; FitSense will total the values you log.</Text>
              <ActionButton
                label={savingMeal ? 'Saving meal…' : 'Log meal'}
                onPress={() => void logMeal()}
                disabled={savingMeal}
              />
            </Card>

            <Card title="Weekly steps">
              <Text style={styles.caption}>Step totals are synced from your Android phone.</Text>
              <View style={styles.week}>
                {dashboard.weeklyProgress.dailySteps.map((day) => {
                  const height = Math.max(5, Math.min(100, (day.steps / 8000) * 100));
                  return (
                    <View key={day.dayKey} style={styles.dayBar}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${height}%` }]} />
                      </View>
                      <Text style={styles.dayLabel}>{day.dayKey.slice(5)}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>

            <ActionButton label={loadingDashboard ? 'Refreshing…' : 'Refresh dashboard'} onPress={refreshData} secondary={false} disabled={loadingDashboard} />
          </>
        ) : (
          <>
            <Card title="Manual tracking">
              <Text style={styles.caption}>
                Workout time, water, and meal calories are entered by you. Automatic movement detection, GPS distance, and activity calorie estimates are off.
              </Text>
            </Card>

            <Card title="Automatic step tracking">
              <ToggleRow
                title="Enable daily step tracking"
                description="Health Connect avoids overlapping source totals when available. Otherwise, a supported Android build can count steps with the phone sensor."
                value={preferences.dailyStepsEnabled}
                onValueChange={(enabled) => {
                  if (enabled) void enableDailySteps();
                  else void savePreferences({ dailyStepsEnabled: false });
                }}
              />
              <Text style={styles.caption}>
                {healthStatus.available
                  ? healthStatus.granted
                    ? `Health Connect connected${healthStatus.backgroundRead ? ' · background read allowed' : ' · reads sync when FitSense is open'}`
                    : 'Health Connect is installed; step permission is required.'
                  : 'Health Connect is unavailable. The fallback uses the device hardware step counter.'}
              </Text>
              {!isNativeTrackingAvailable() && !healthStatus.available ? (
                <Text style={styles.warning}>The phone-sensor fallback requires a custom Android build; Expo Go cannot run it.</Text>
              ) : null}
              {healthStatus.available ? (
                <ActionButton label="Open Health Connect settings" onPress={openHealthConnectSettings} secondary />
              ) : null}
              <ActionButton label="Sync 90-day history" onPress={syncHistoricalSteps} secondary disabled={busy || !healthStatus.available} />
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617', gap: 12 },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  nav: { flexDirection: 'row', borderBottomColor: '#1e293b', borderBottomWidth: 1, paddingHorizontal: 16 },
  navItem: { paddingVertical: 12, paddingHorizontal: 14, marginRight: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  navItemActive: { borderBottomColor: '#a3e635' },
  navText: { color: '#94a3b8', fontWeight: '600' },
  navTextActive: { color: '#d9f99d' },
  eyebrow: { color: '#a3e635', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 4 },
  caption: { color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 4 },
  card: { backgroundColor: '#0f172a', borderRadius: 18, borderColor: '#1e293b', borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', minHeight: 94, backgroundColor: '#0f172a', borderRadius: 16, borderColor: '#1e293b', borderWidth: 1, padding: 14, justifyContent: 'center' },
  metricValue: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  value: { color: '#f8fafc', fontSize: 26, fontWeight: '800' },
  timerValue: { color: '#f8fafc', fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  waterControls: { flexDirection: 'row', gap: 10 },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealTypeButton: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  mealTypeButtonActive: { backgroundColor: '#365314', borderColor: '#84cc16' },
  mealTypeText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  mealTypeTextActive: { color: '#ecfccb' },
  week: { flexDirection: 'row', justifyContent: 'space-between', height: 112, gap: 7, marginTop: 12 },
  dayBar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '100%', backgroundColor: '#1e293b', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { backgroundColor: '#84cc16', width: '100%', borderRadius: 6 },
  dayLabel: { color: '#64748b', fontSize: 9, marginTop: 5 },
  rowTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  button: { backgroundColor: '#a3e635', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  secondaryButton: { backgroundColor: '#172554', borderWidth: 1, borderColor: '#334155' },
  buttonText: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  secondaryButtonText: { color: '#dbeafe' },
  disabledButton: { opacity: 0.55 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12 },
  linkText: { color: '#bef264', fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
  error: { color: '#fecaca', backgroundColor: '#7f1d1d', borderRadius: 12, padding: 12, overflow: 'hidden' },
  notice: { color: '#d9f99d', backgroundColor: '#1a2e05', borderRadius: 12, padding: 12, overflow: 'hidden' },
  sampleNotice: { color: '#fde68a', fontSize: 12, lineHeight: 18, backgroundColor: '#451a03', borderRadius: 12, padding: 12, overflow: 'hidden' },
  warning: { color: '#fde68a', fontSize: 13, lineHeight: 19 },
});

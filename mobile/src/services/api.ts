import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000/api'
).replace(/\/+$/, '');
const TOKEN_KEY = 'fitsense.mobile.auth-token';

let authToken: string | null = null;

export interface User {
  _id: string;
  name: string;
  email: string;
  weight?: number;
}

export interface TrackingPreferences {
  enabled: boolean;
  paused: boolean;
  dailyStepsEnabled: boolean;
  storeRoute: boolean;
  stationaryEndMinutes: number;
  timeZone: string;
}

export interface ActivitySession {
  _id: string;
  clientSessionId: string;
  activityType: 'walking' | 'running';
  status: 'active' | 'completed';
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  steps?: number;
  distanceMeters: number;
  averagePaceSecondsPerKm: number;
  caloriesBurned: number;
}

export interface ActivityEntry {
  _id: string;
  date: string;
  waterIntakeMl: number;
}

export interface NutritionEntry {
  _id: string;
  mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
  foodName: string;
  calories: number;
  intakeDate: string;
}

export interface WorkoutInput {
  exerciseName: string;
  category: 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Full body' | 'Cardio' | 'Flexibility';
  targetMuscleGroup: string;
  sets: number;
  reps: number;
  weight: number;
  durationMinutes: number;
  workoutDate: string;
  notes: string;
}

export interface DashboardData {
  summary: {
    todaySteps: number;
    todayCalories: number;
    todayCaloriesConsumed: number;
    todayActiveMinutes: number;
    todayWalkingDistanceKm: number;
    todaySessionActiveMinutes: number;
    todaySessionCalories: number;
    totalDuration: number;
    waterIntakeMl: number;
    goal?: string;
  };
  recentActivities: ActivityEntry[];
  recentSessions: ActivitySession[];
  weeklyProgress: {
    dailySteps: { dayKey: string; steps: number }[];
    walkingDistanceKm: number;
    activeMinutes: number;
    sessions: number;
  };
}

interface ApiErrorBody {
  message?: string;
}

export class FitSenseApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'FitSenseApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body) headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (error) {
    throw new FitSenseApiError(
      error instanceof Error ? error.message : 'Unable to reach the FitSense API.',
      0,
    );
  }

  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) {
    throw new FitSenseApiError(body.message || 'The FitSense API request failed.', response.status);
  }
  return body;
}

export async function restoreAuthToken() {
  authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return authToken;
}

export async function clearAuthToken() {
  authToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getAuthTokenForNative() {
  if (!authToken) authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return authToken || '';
}

async function saveAuthResponse(response: { token: string; user: User }) {
  authToken = response.token;
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  return response.user;
}

export async function login(email: string, password: string) {
  const response = await request<{ token: string; user: User }>('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return saveAuthResponse(response);
}

export async function register(name: string, email: string, password: string) {
  const response = await request<{ token: string; user: User }>('/auth/mobile/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  return saveAuthResponse(response);
}

export const getCurrentUser = () => request<{ user: User }>('/auth/me');
export const getDashboard = () => request<DashboardData>('/dashboard/summary');

export async function createWorkout(payload: WorkoutInput) {
  return request('/workouts', { method: 'POST', body: JSON.stringify(payload) });
}

export async function createActivity(payload: {
  date: string;
  steps: number;
  distanceKm: number;
  caloriesBurned: number;
  activeMinutes: number;
  waterIntakeMl: number;
  goal: number;
  source: 'manual';
}) {
  return request('/activities', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateActivityWater(id: string, waterIntakeMl: number) {
  return request(`/activities/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ waterIntakeMl }),
  });
}

export async function createNutritionEntry(payload: {
  mealType: NutritionEntry['mealType'];
  foodName: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  intakeDate: string;
}) {
  return request('/nutrition', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getTrackingPreferences() {
  const response = await request<{ preferences: TrackingPreferences }>('/tracking/preferences');
  return response.preferences;
}

export async function updateTrackingPreferences(updates: Partial<TrackingPreferences>) {
  const response = await request<{ preferences: TrackingPreferences }>('/tracking/preferences', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return response.preferences;
}

export async function getActivitySessions() {
  const response = await request<{ sessions: ActivitySession[] }>('/tracking/sessions');
  return response.sessions;
}

export async function syncActivitySession(session: Record<string, unknown>) {
  const clientSessionId = String(session.clientSessionId || '');
  if (!clientSessionId) throw new Error('A client session ID is required for synchronization.');
  const { ownerUserId: _ownerUserId, ...payload } = session;
  return request(`/tracking/sessions/${encodeURIComponent(clientSessionId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function syncDailySteps(summary: {
  dayKey: string;
  steps: number;
  source: 'health_connect' | 'android_sensor';
  timeZone: string;
}) {
  const { dayKey, ...body } = summary;
  return request(`/tracking/daily-steps/${encodeURIComponent(dayKey)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    await clearAuthToken();
  }
}

export const apiBaseUrl = API_BASE_URL;

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

export const loginUser = (payload) => api.post('/auth/login', payload);
export const registerUser = (payload) => api.post('/auth/register', payload);
export const getCurrentUser = () => api.get('/auth/me');
export const logoutUser = () => api.post('/auth/logout');
export const updateProfile = (payload) => api.put('/auth/profile', payload);

export const getDashboardSummary = () => api.get('/dashboard/summary');
export const getAnalytics = () => api.get('/dashboard/analytics');
export const getWorkouts = (params) => api.get('/workouts', { params });
export const createWorkout = (payload) => api.post('/workouts', payload);
export const updateWorkout = (id, payload) => api.put(`/workouts/${id}`, payload);
export const deleteWorkout = (id) => api.delete(`/workouts/${id}`);
export const getActivities = () => api.get('/activities');
export const createActivity = (payload) => api.post('/activities', payload);
export const updateActivity = (id, payload) => api.put(`/activities/${id}`, payload);
export const deleteActivity = (id) => api.delete(`/activities/${id}`);
export const getNutrition = () => api.get('/nutrition');
export const createNutrition = (payload) => api.post('/nutrition', payload);
export const updateNutrition = (id, payload) => api.put(`/nutrition/${id}`, payload);
export const deleteNutrition = (id) => api.delete(`/nutrition/${id}`);
export const getRecommendations = () => api.get('/recommendations');
export const getRecommendationPreview = () => api.get('/recommendations/preview');
export const submitRecommendationFeedback = (id, payload) => api.patch(`/recommendations/${id}/feedback`, payload);
export const sendAssistantMessage = (message) => api.post('/assistant/message', { message });
export const getPrivacy = () => api.get('/privacy');
export const updatePrivacy = (payload) => api.put('/privacy', payload);
export const exportUserData = () => api.get('/privacy/export');
export const deleteAccount = () => api.delete('/privacy/account');

export default api;

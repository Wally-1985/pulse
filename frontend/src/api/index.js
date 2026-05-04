import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pulse_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pulse_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (id) => api.delete(`/auth/sessions/${id}`),
  setupMfa: () => api.post('/auth/mfa/setup'),
  verifyMfa: (code) => api.post('/auth/mfa/verify', { code }),
  disableMfa: (code) => api.post('/auth/mfa/disable', { code }),
};

// Entries
export const entriesApi = {
  getEntry: (date, userId) => api.get(`/entries/${date}`, { params: userId ? { userId } : {} }),
  upsertEntry: (data) => api.post('/entries', data),
  submitEntry: (id) => api.post(`/entries/${id}/submit`),
  deleteEntry: (id) => api.delete(`/entries/${id}`),
  getDraft: (date) => api.get('/entries/draft?date=' + date),
  saveDraft: (data) => api.put('/entries/draft', data),
  deleteDraft: (date) => api.delete('/entries/draft?date=' + date),
  getWeekEntries: (weekStart, userId) => api.get('/entries/week', { params: { weekStart, userId } }),
};

// Manager
export const managerApi = {
  getDayStatus: (date) => api.get('/manager/day-status', { params: { date } }),
  getWeeklySummary: (weekStart) => api.get('/manager/weekly-summary', { params: { weekStart } }),
  getChartData: (from, to) => api.get('/manager/charts', { params: { from, to } }),
  getMyTeams: () => api.get('/manager/teams'),
  getUserSettings: (userId) => api.get(`/manager/settings/${userId}`),
  updateUserSettings: (userId, data) => api.put(`/manager/settings/${userId}`, data),
};

// Users & Teams
export const usersApi = {
  getUsers: () => api.get('/users'),
  getUser: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  unlockUser: (id) => api.post('/users/' + id + '/unlock'),
  getArchivedUsers: () => api.get('/users/archived'),
  restoreUser: (id) => api.post('/users/' + id + '/restore'),
  getTeamMembers: () => api.get('/users/team'),
  getRoster: (userId) => api.get('/roster/' + userId),
  updateRoster: (userId, data) => api.put('/roster/' + userId, data),
  getProfile: () => api.get('/profile'),
  updateProfile: (data) => api.put('/profile', data),
};

export const teamsApi = {
  getTeams: () => api.get('/teams'),
  createTeam: (data) => api.post('/teams', data),
  updateTeam: (id, data) => api.put(`/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/teams/${id}`),
  assignManager: (teamId, data) => api.post(`/teams/${teamId}/managers`, data),
};

// Notifications
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
};

// Ongoing Tasks
export const tasksApi = {
  getOngoing: (date) => api.get('/tasks/ongoing' + (date ? '?date=' + date : '')),
  create: (data) => api.post('/tasks/ongoing', data),
  sync: (data) => api.post('/tasks/ongoing/sync', data),
  complete: (id) => api.put('/tasks/ongoing/' + id + '/complete'),
  dismiss: (id) => api.put('/tasks/ongoing/' + id + '/dismiss'),
};

// Zendesk
export const zendeskApi = {
  getSettings: () => api.get('/zendesk/settings'),
  saveSettings: (data) => api.put('/zendesk/settings', data),
  testConnection: () => api.get('/zendesk/test'),
  getTodayActivity: (date) => api.get('/zendesk/today' + (date ? '?date=' + date : '')),
  getTeamTodayActivity: () => api.get('/manager/zendesk/today'),
};

// Admin
export const adminApi = {
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data) => api.put('/admin/settings', data),
  getHolidays: () => api.get('/admin/holidays'),
  createHoliday: (data) => api.post('/admin/holidays', data),
  deleteHoliday: (id) => api.delete(`/admin/holidays/${id}`),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  exportAuditLogs: (params) => api.get('/admin/audit-logs/export', { params, responseType: 'blob' }),
  runBackup: () => api.post('/admin/backup', {}, { timeout: 120000 }),
  listBackups: () => api.get('/admin/backups'),
  deleteBackup: (filename) => api.delete('/admin/backups/' + filename),
  downloadBackup: (filename) => api.get(`/admin/backups/${filename}/download`, { responseType: 'blob' }),
  getSystemHealth: () => api.get('/admin/system-health'),
  getApiKeys: () => api.get('/admin/api-keys'),
  createApiKey: (data) => api.post('/admin/api-keys', data),
  revokeApiKey: (id) => api.delete(`/admin/api-keys/${id}`),
};

export const aiApi = {
  getSettings: () => api.get('/ai/settings'),
  saveSettings: (data) => api.put('/ai/settings', data),
  testConnection: () => api.post('/ai/settings/test'),
  getPromptTemplates: () => api.get('/ai/prompt-templates'),
  createPromptTemplate: (data) => api.post('/ai/prompt-templates', data),
  updatePromptTemplate: (id, data) => api.put('/ai/prompt-templates/' + id, data),
  getJobs: () => api.get('/ai/jobs'),
};

export const yeastarApi = {
  getSettings: () => api.get('/yeastar/settings'),
  saveSettings: (data) => api.put('/yeastar/settings', data),
  testConnection: () => api.post('/yeastar/settings/test'),
  getTodayActivity: (date) => api.get('/yeastar/today' + (date ? '?date=' + date : '')),
};

export const projectsApi = {
  getProjects: () => api.get('/projects'),
  getActiveProjects: (date) => api.get('/projects/active' + (date ? '?date=' + date : '')),
  getProject: (id) => api.get('/projects/' + id),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put('/projects/' + id, data),
  deleteProject: (id) => api.delete('/projects/' + id),
  createTask: (projectId, data) => api.post('/projects/' + projectId + '/tasks', data),
  updateTask: (projectId, taskId, data) => api.put('/projects/' + projectId + '/tasks/' + taskId, data),
  deleteTask: (projectId, taskId) => api.delete('/projects/' + projectId + '/tasks/' + taskId),
  completeTaskFromEntry: (projectId, taskId, data) => api.put('/projects/' + projectId + '/tasks/' + taskId + '/complete-from-entry', data),
  startProjectFromEntry: (projectId, data) => api.put('/projects/' + projectId + '/start-from-entry', data),
  createNote: (projectId, data) => api.post('/projects/' + projectId + '/notes', data),
  deleteNote: (projectId, noteId) => api.delete('/projects/' + projectId + '/notes/' + noteId),
  createSubtask: (projectId, taskId, data) => api.post('/projects/' + projectId + '/tasks/' + taskId + '/subtasks', data),
  updateSubtask: (projectId, taskId, subtaskId, data) => api.put('/projects/' + projectId + '/tasks/' + taskId + '/subtasks/' + subtaskId, data),
  deleteSubtask: (projectId, taskId, subtaskId) => api.delete('/projects/' + projectId + '/tasks/' + taskId + '/subtasks/' + subtaskId),
};

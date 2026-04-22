const express = require('express');
const router = express.Router();
const { authenticate, isAdmin, isManager } = require('../middleware/auth');

const authCtrl = require('../controllers/auth.controller');
const entriesCtrl = require('../controllers/entries.controller');
const managerCtrl = require('../controllers/manager.controller');
const usersCtrl = require('../controllers/users.controller');
const teamsCtrl = require('../controllers/teams.controller');
const notificationsCtrl = require('../controllers/notifications.controller');
const adminCtrl = require('../controllers/admin.controller');
const zendeskCtrl = require('../controllers/zendesk.controller');
const aiCtrl = require('../controllers/ai.controller');
const projectsCtrl = require('../controllers/projects.controller');
const yeastarCtrl = require('../controllers/yeastar.controller');
const tasksCtrl = require('../controllers/tasks.controller');

// ─── AUTH ──────────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);
router.post('/auth/logout', authenticate, authCtrl.logout);
router.get('/auth/me', authenticate, authCtrl.me);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.post('/auth/change-password', authenticate, authCtrl.changePassword);
router.get('/auth/sessions', authenticate, authCtrl.getSessions);
router.delete('/auth/sessions/:sessionId', authenticate, authCtrl.revokeSession);
router.post('/auth/mfa/setup', authenticate, authCtrl.setupMfa);
router.post('/auth/mfa/verify', authenticate, authCtrl.verifyMfa);
router.post('/auth/mfa/disable', authenticate, authCtrl.disableMfa);

// ─── PROFILE ───────────────────────────────────────────────────────────────
router.get('/profile', authenticate, usersCtrl.getProfile);
router.put('/profile', authenticate, usersCtrl.updateProfile);

// ─── DAILY ENTRIES ─────────────────────────────────────────────────────────
router.get('/entries/draft', authenticate, entriesCtrl.getDraft);
router.put('/entries/draft', authenticate, entriesCtrl.saveDraft);
router.delete('/entries/draft', authenticate, entriesCtrl.deleteDraft);
router.get('/entries/week', authenticate, entriesCtrl.getWeekEntries);
router.get('/entries/:date', authenticate, entriesCtrl.getEntry);
router.post('/entries', authenticate, entriesCtrl.upsertEntry);
router.post('/entries/:id/submit', authenticate, entriesCtrl.submitEntry);
router.delete('/entries/:id', authenticate, entriesCtrl.deleteEntry);

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────
router.get('/notifications', authenticate, notificationsCtrl.getNotifications);
router.put('/notifications/:id/read', authenticate, notificationsCtrl.markRead);
router.put('/notifications/read-all', authenticate, notificationsCtrl.markAllRead);
router.delete('/notifications/:id', authenticate, notificationsCtrl.deleteNotification);

// ─── MANAGER ───────────────────────────────────────────────────────────────
router.get('/manager/teams', authenticate, isManager, managerCtrl.getMyTeams);
router.get('/manager/day-status', authenticate, isManager, managerCtrl.getDayStatus);
router.get('/manager/weekly-summary', authenticate, isManager, managerCtrl.getWeeklySummary);
router.get('/manager/charts', authenticate, isManager, managerCtrl.getChartData);
router.get('/manager/settings/:userId', authenticate, isManager, notificationsCtrl.getUserSettings);
router.put('/manager/settings/:userId', authenticate, isManager, notificationsCtrl.updateUserSettings);

// ─── ADMIN: USERS ──────────────────────────────────────────────────────────
router.get('/users', authenticate, isAdmin, usersCtrl.getUsers);
router.get('/users/archived', authenticate, isAdmin, usersCtrl.getArchivedUsers);
router.get('/users/team', authenticate, usersCtrl.getTeamMembers);
router.post('/users/:id/restore', authenticate, isAdmin, usersCtrl.restoreUser);
router.get('/roster/:userId', authenticate, isAdmin, usersCtrl.getRoster);
router.put('/roster/:userId', authenticate, isAdmin, usersCtrl.updateRoster);
router.get('/users/:id', authenticate, isAdmin, usersCtrl.getUser);
router.post('/users', authenticate, isAdmin, usersCtrl.createUser);
router.put('/users/:id', authenticate, isAdmin, usersCtrl.updateUser);
router.delete('/users/:id', authenticate, isAdmin, usersCtrl.deleteUser);
router.post('/users/:id/unlock', authenticate, isAdmin, usersCtrl.unlockUser);

// ─── ADMIN: TEAMS ──────────────────────────────────────────────────────────
router.get('/teams', authenticate, teamsCtrl.getTeams);
router.post('/teams', authenticate, isAdmin, teamsCtrl.createTeam);
router.put('/teams/:id', authenticate, isAdmin, teamsCtrl.updateTeam);
router.delete('/teams/:id', authenticate, isAdmin, teamsCtrl.deleteTeam);
router.post('/teams/:teamId/managers', authenticate, isAdmin, teamsCtrl.assignManager);

// ─── ADMIN: SETTINGS ───────────────────────────────────────────────────────
router.get('/admin/settings', authenticate, isAdmin, adminCtrl.getSettings);
router.put('/admin/settings', authenticate, isAdmin, adminCtrl.updateSettings);
router.get('/admin/holidays', authenticate, isAdmin, adminCtrl.getHolidays);
router.post('/admin/holidays', authenticate, isAdmin, adminCtrl.createHoliday);
router.delete('/admin/holidays/:id', authenticate, isAdmin, adminCtrl.deleteHoliday);
router.get('/admin/non-working-dates', authenticate, isAdmin, adminCtrl.getNonWorkingDates);
router.post('/admin/non-working-dates', authenticate, isAdmin, adminCtrl.createNonWorkingDate);
router.delete('/admin/non-working-dates/:id', authenticate, isAdmin, adminCtrl.deleteNonWorkingDate);
router.get('/admin/audit-logs', authenticate, isAdmin, adminCtrl.getAuditLogs);
router.get('/admin/audit-logs/export', authenticate, isAdmin, adminCtrl.exportAuditLogs);
router.post('/admin/backup', authenticate, isAdmin, adminCtrl.runBackup);
router.get('/admin/backups', authenticate, isAdmin, adminCtrl.listBackups);
router.get('/admin/backups/:filename/download', authenticate, isAdmin, adminCtrl.downloadBackup);
router.delete('/admin/backups/:filename', authenticate, isAdmin, adminCtrl.deleteBackup);
router.get('/admin/system-health', authenticate, isAdmin, adminCtrl.getSystemHealth);
router.get('/admin/api-keys', authenticate, isAdmin, adminCtrl.getApiKeys);
router.post('/admin/api-keys', authenticate, isAdmin, adminCtrl.createApiKey);
router.delete('/admin/api-keys/:id', authenticate, isAdmin, adminCtrl.revokeApiKey);

// ─── ONGOING TASKS ────────────────────────────────────────────────────────
router.get('/tasks/ongoing', authenticate, tasksCtrl.getOngoing);
router.post('/tasks/ongoing', authenticate, tasksCtrl.createFromWorkItem);
router.post('/tasks/ongoing/sync', authenticate, tasksCtrl.syncFromEntry);
router.put('/tasks/ongoing/:id/complete', authenticate, tasksCtrl.complete);
router.put('/tasks/ongoing/:id/dismiss', authenticate, tasksCtrl.dismiss);

// ─── ZENDESK ───────────────────────────────────────────────────────────────
router.get('/zendesk/settings', authenticate, zendeskCtrl.getSettings);
router.put('/zendesk/settings', authenticate, zendeskCtrl.saveSettings);
router.get('/zendesk/test', authenticate, zendeskCtrl.testConnection);
router.get('/zendesk/today', authenticate, zendeskCtrl.getTodayActivity);
router.get('/manager/zendesk/today', authenticate, isManager, zendeskCtrl.getTeamTodayActivity);

// ─── AI ────────────────────────────────────────────────────────────────────
router.get('/ai/settings', authenticate, isAdmin, aiCtrl.getSettings);
router.put('/ai/settings', authenticate, isAdmin, aiCtrl.saveSettings);
router.post('/ai/settings/test', authenticate, isAdmin, aiCtrl.testConnection);
router.get('/ai/prompt-templates', authenticate, isAdmin, aiCtrl.getPromptTemplates);
router.post('/ai/prompt-templates', authenticate, isAdmin, aiCtrl.createPromptTemplate);
router.put('/ai/prompt-templates/:id', authenticate, isAdmin, aiCtrl.updatePromptTemplate);
router.get('/ai/jobs', authenticate, isAdmin, aiCtrl.getJobs);

// ─── PROJECTS ──────────────────────────────────────────────────────────────
router.get('/projects', authenticate, projectsCtrl.getProjects);
router.get('/projects/active', authenticate, projectsCtrl.getActiveProjects);
router.post('/projects', authenticate, projectsCtrl.createProject);
router.get('/projects/:id', authenticate, projectsCtrl.getProject);
router.put('/projects/:id', authenticate, projectsCtrl.updateProject);
router.delete('/projects/:id', authenticate, projectsCtrl.deleteProject);
router.post('/projects/:id/tasks', authenticate, projectsCtrl.createTask);
router.put('/projects/:id/tasks/:taskId', authenticate, projectsCtrl.updateTask);
router.delete('/projects/:id/tasks/:taskId', authenticate, projectsCtrl.deleteTask);
router.put('/projects/:id/tasks/:taskId/complete-from-entry', authenticate, projectsCtrl.completeTaskFromEntry);
router.put('/projects/:id/start-from-entry', authenticate, projectsCtrl.startProjectFromEntry);
router.post('/projects/:id/notes', authenticate, projectsCtrl.createNote);
router.delete('/projects/:id/notes/:noteId', authenticate, projectsCtrl.deleteNote);

// ─── YEASTAR ───────────────────────────────────────────────────────────────
router.get('/yeastar/settings', authenticate, isAdmin, yeastarCtrl.getSettings);
router.put('/yeastar/settings', authenticate, isAdmin, yeastarCtrl.saveSettings);
router.post('/yeastar/settings/test', authenticate, isAdmin, yeastarCtrl.testConnection);
router.get('/yeastar/today', authenticate, yeastarCtrl.getTodayActivity);
router.get('/manager/submissions/status', authenticate, isManager, managerCtrl.getSubmissionStatus);

module.exports = router;

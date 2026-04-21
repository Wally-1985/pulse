const { query } = require('../config/database');
const { sendEmail, emailTemplates } = require('./email');
const { createNotification } = require('../controllers/notifications.controller');
const { audit } = require('./audit');

// Checks for missing entries and sends reminders
// Should be called once daily at 10:00 AM (use node-cron or similar in production)
const runReminderCheck = async () => {
  console.log('[Reminders] Starting reminder check...');
  try {
    // Check TODAY — reminder runs at end-of-day threshold time
    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    // Skip weekends (basic check — roster logic below handles per-user)
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('[Reminders] Weekend — skipping');
      return;
    }

    // Check if it's a company-wide public holiday or non-working date
    const companyHolidayCheck = await query(
      `SELECT 1 FROM public_holidays WHERE date = $1 AND state IS NULL
       UNION SELECT 1 FROM non_working_dates WHERE date = $1`,
      [dateStr]
    );
    if (companyHolidayCheck.rows.length) {
      console.log(`[Reminders] ${dateStr} is a company-wide holiday/non-working day — skipping`);
      return;
    }

    // Find all active members with no submitted entry for yesterday
    // Exclude those on approved leave
    const usersResult = await query(
      `SELECT u.id, u.email, u.first_name, u.notification_preference, u.state
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'member'
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND u.id NOT IN (
           SELECT de.user_id FROM daily_entries de
           WHERE de.entry_date = $1 AND de.status = 'submitted' AND de.deleted_at IS NULL
         )
         AND u.id NOT IN (
           SELECT mus.user_id FROM manager_user_settings mus
           WHERE mus.leave_start <= $1 AND mus.leave_end >= $1
             AND mus.alerts_enabled = false
         )`,
      [dateStr]
    );

    let sent = 0;
    for (const user of usersResult.rows) {
      try {
        // Check if this date is a state-specific holiday for this user's state
        if (user.state) {
          const stateHoliday = await query(
            `SELECT 1 FROM public_holidays WHERE date = $1 AND state = $2`,
            [dateStr, user.state]
          );
          if (stateHoliday.rows.length) {
            console.log(`[Reminders] ${dateStr} is a ${user.state} holiday — skipping user ${user.id}`);
            continue;
          }
        }

        const pref = user.notification_preference || 'both';

        if (pref === 'email' || pref === 'both') {
          const emailContent = emailTemplates.missingEntryReminder(user, dateStr);
          await sendEmail({ to: user.email, ...emailContent });
        }

        if (pref === 'in_app' || pref === 'both') {
          await createNotification(
            user.id,
            'missing_entry',
            `Missing entry for ${dateStr}`,
            `You haven't submitted a daily entry for ${dateStr}. Please log your work.`,
            'daily_entry',
            null
          );
        }

        await audit({
          userId: user.id,
          actionType: 'reminder_sent',
          newValue: { date: dateStr, method: pref },
        });

        sent++;
      } catch (err) {
        console.error(`[Reminders] Failed for user ${user.id}:`, err);
        await audit({
          userId: user.id,
          actionType: 'reminder_failed',
          success: false,
          newValue: { date: dateStr, error: err.message },
        });
      }
    }

    console.log(`[Reminders] Done. Sent ${sent} reminders for ${dateStr}`);
  } catch (err) {
    console.error('[Reminders] Scheduler error:', err);
  }
};

// Simple interval-based scheduler — runs daily at the configured alert threshold time
const startScheduler = () => {
  const scheduleNext = async () => {
    // Read threshold from system settings (default 17:00)
    let alertHour = 17, alertMinute = 0;
    try {
      const { query } = require('../config/database');
      const r = await query(`SELECT value FROM system_settings WHERE key = 'missing_entry_alert_time'`);
      if (r.rows.length && r.rows[0].value) {
        const parts = r.rows[0].value.split(':');
        alertHour = parseInt(parts[0]) || 17;
        alertMinute = parseInt(parts[1]) || 0;
      }
    } catch { /* use defaults */ }

    const now = new Date();
    const next = new Date();
    next.setHours(alertHour, alertMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntilNext = next - now;
    console.log(`[Reminders] Next check scheduled for ${next.toISOString()}`);
    setTimeout(async () => {
      await runReminderCheck();
      scheduleNext();
    }, msUntilNext);
  };
  scheduleNext();
};

module.exports = { startScheduler, runReminderCheck };

const cron = require('node-cron');
const reminderService = require('./reminderService');
const logger = require('../utils/logger');

let cronTask = null;
let currentCronExpression = null;

/**
 * Converts a time string "HH:mm" into a cron expression "m H * * *"
 * e.g., "09:00" -> "0 9 * * *"
 */
function timeToCron(timeStr = '14:30') {
  const parts = timeStr.split(':');
  const hour = parseInt(parts[0] || '14', 10);
  const minute = parseInt(parts[1] || '30', 10);
  return `${minute} ${hour} * * *`;
}

/**
 * Initializes and starts the daily reminder background scheduler
 */
function initScheduler() {
  const settings = reminderService.getSettings();
  const timeStr = settings.reminderTime || '14:30';
  const cronExpr = timeToCron(timeStr);

  if (cronTask) {
    logger.info('Stopping existing reminder cron task...');
    cronTask.stop();
    cronTask = null;
  }

  currentCronExpression = cronExpr;
  logger.info(`Scheduling daily reminder check at ${timeStr} (Cron: "${cronExpr}"). Enabled: ${settings.enabled}`);

  cronTask = cron.schedule(cronExpr, async () => {
    logger.info(`⏰ Daily automated reminder scheduler triggered at ${new Date().toISOString()}`);
    try {
      await reminderService.runReminderScan({ manual: false });
    } catch (err) {
      logger.error('Error during scheduled reminder run:', { error: err.message });
    }
  });

  if (!settings.enabled) {
    cronTask.stop();
    logger.info('Daily reminder scheduler initialized but paused (disabled in settings).');
  } else {
    logger.info('Daily reminder scheduler active and running.');
  }
}

/**
 * Updates the cron schedule dynamically if settings (time or enabled state) changed
 */
function updateScheduler() {
  const settings = reminderService.getSettings();
  const timeStr = settings.reminderTime || '14:30';
  const newExpr = timeToCron(timeStr);

  if (newExpr !== currentCronExpression || !cronTask) {
    logger.info(`Reminder schedule time updated to ${timeStr}. Reinitializing scheduler...`);
    initScheduler();
  } else {
    if (settings.enabled) {
      cronTask.start();
      logger.info('Reminder scheduler resumed.');
    } else {
      cronTask.stop();
      logger.info('Reminder scheduler stopped (disabled in settings).');
    }
  }
}

function getSchedulerStatus() {
  const settings = reminderService.getSettings();
  return {
    enabled: Boolean(settings.enabled),
    reminderTime: settings.reminderTime || '14:30',
    cronExpression: currentCronExpression || timeToCron(settings.reminderTime || '14:30'),
    lastRunAt: settings.lastRunAt || null,
  };
}


module.exports = {
  initScheduler,
  updateScheduler,
  getSchedulerStatus,
};

const reminderService = require('../services/reminderService');
const schedulerService = require('../services/schedulerService');
const logger = require('../utils/logger');

/**
 * Handles GET /api/reminders/settings
 */
function getSettings(req, res) {
  try {
    const settings = reminderService.getSettings();
    const scheduler = schedulerService.getSchedulerStatus();
    return res.status(200).json({
      success: true,
      data: {
        ...settings,
        scheduler,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/reminders/settings
 */
function updateSettings(req, res) {
  try {
    const newSettings = req.body;
    const updated = reminderService.updateSettings(newSettings);
    schedulerService.updateScheduler();

    return res.status(200).json({
      success: true,
      message: 'Reminder settings updated successfully',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/reminders/trigger (Manual Run)
 */
async function triggerReminders(req, res, next) {
  try {
    const { extraItems } = req.body || {};
    logger.info('Manual reminder scan requested by admin');
    const result = await reminderService.runReminderScan({ manual: true, extraItems });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles GET /api/reminders/logs
 */
function getLogs(req, res) {
  try {
    const { type, status, search, limit, offset } = req.query;
    let logs = reminderService.getReminderLogs();

    if (type && type !== 'All') {
      logs = logs.filter((l) => l.reminderType === type.toLowerCase());
    }

    if (status && status !== 'All') {
      logs = logs.filter((l) => l.status === status.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          (l.studentName && l.studentName.toLowerCase().includes(q)) ||
          (l.phone && l.phone.includes(q))
      );
    }

    const total = logs.length;
    const l = parseInt(limit, 10) || 50;
    const o = parseInt(offset, 10) || 0;
    const paginated = logs.slice(o, o + l);

    return res.status(200).json({
      success: true,
      total,
      data: paginated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles GET /api/reminders/memberships
 */
function getMemberships(req, res) {
  try {
    const list = reminderService.getMemberships();
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/reminders/memberships
 */
function saveMemberships(req, res) {
  try {
    const { memberships } = req.body;
    if (Array.isArray(memberships)) {
      reminderService.saveMemberships(memberships);
    }
    return res.status(200).json({
      success: true,
      data: reminderService.getMemberships(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  triggerReminders,
  getLogs,
  getMemberships,
  saveMemberships,
};


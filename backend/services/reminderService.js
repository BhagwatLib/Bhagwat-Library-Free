const fs = require('fs');
const path = require('path');
const whatsappService = require('./whatsappService');
const logger = require('../utils/logger');

const LOGS_DIR = path.join(__dirname, '../logs');
const SETTINGS_FILE = path.join(LOGS_DIR, 'reminder_settings.json');
const REMINDER_LOGS_FILE = path.join(LOGS_DIR, 'reminder_logs.json');
const MEMBERSHIPS_FILE = path.join(LOGS_DIR, 'memberships.json');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = {
  whatsappEnabled: true,       // Toggle 1: WhatsApp Reminders (Enable / Disable)
  automatedScheduler: true,    // Toggle 2: Automated Reminder System (Enable / Disable)
  reminderTime: '14:30',       // Preferred time (2:00 PM – 3:00 PM default, e.g. 14:30)
  libraryName: 'Bhagwat Library',
  lastRunAt: null,
};

// Seed sample membership records if file doesn't exist
function getInitialMemberships() {
  const today = new Date();
  const formatYMD = (d) => d.toISOString().split('T')[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 2);

  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 25);

  return [
    {
      id: 'mem-1',
      studentName: 'Rahul Sharma',
      phone: '918789366398',
      seatNumber: 12,
      batch: 'Morning Shift (06:00 AM - 12:00 PM)',
      validityTo: formatYMD(tomorrow), // Due Tomorrow
      paymentStatus: 'Unpaid',
      dueAmount: 800,
    },
    {
      id: 'mem-2',
      studentName: 'Priya Patel',
      phone: '919876543210',
      seatNumber: 4,
      batch: 'Full Day Shift',
      validityTo: formatYMD(today), // Due Today
      paymentStatus: 'Unpaid',
      dueAmount: 1200,
    },
    {
      id: 'mem-3',
      studentName: 'Amit Kumar',
      phone: '919123456780',
      seatNumber: 18,
      batch: 'Evening Shift (04:00 PM - 10:00 PM)',
      validityTo: formatYMD(yesterday), // Overdue
      paymentStatus: 'Unpaid',
      dueAmount: 800,
    },
    {
      id: 'mem-4',
      studentName: 'Ananya Verma',
      phone: '919988776655',
      seatNumber: 22,
      batch: 'Morning Shift',
      validityTo: formatYMD(nextMonth), // Active / Valid
      paymentStatus: 'Paid',
      dueAmount: 0,
    },
  ];
}

// Helpers to load and save JSON files
function loadJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.error(`Error reading ${filePath}:`, { error: err.message });
  }
  return defaultValue;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Error writing ${filePath}:`, { error: err.message });
  }
}

// State
let settings = loadJSON(SETTINGS_FILE, DEFAULT_SETTINGS);
let reminderLogs = loadJSON(REMINDER_LOGS_FILE, []);
let memberships = loadJSON(MEMBERSHIPS_FILE, getInitialMemberships());
saveJSON(MEMBERSHIPS_FILE, memberships);

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabled: settings.automatedScheduler ?? settings.enabled ?? true,
    whatsappEnabled: settings.whatsappEnabled ?? true,
    automatedScheduler: settings.automatedScheduler ?? settings.enabled ?? true,
    reminderTime: settings.reminderTime || '14:30',
  };
}

function updateSettings(newSettings) {
  const current = getSettings();
  settings = {
    ...current,
    ...newSettings,
    enabled: newSettings.automatedScheduler !== undefined ? newSettings.automatedScheduler : (newSettings.enabled !== undefined ? newSettings.enabled : current.automatedScheduler),
  };
  saveJSON(SETTINGS_FILE, settings);
  logger.info('Updated reminder settings:', settings);
  return settings;
}

function getMemberships() {
  return memberships;
}

function saveMemberships(list) {
  memberships = list;
  saveJSON(MEMBERSHIPS_FILE, memberships);
  return memberships;
}

function getReminderLogs() {
  return reminderLogs;
}

function logReminderEntry(entry) {
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    sentAt: new Date().toISOString(),
    dateKey: new Date().toISOString().split('T')[0],
    ...entry,
  };
  reminderLogs.unshift(log);
  if (reminderLogs.length > 500) {
    reminderLogs = reminderLogs.slice(0, 500);
  }
  saveJSON(REMINDER_LOGS_FILE, reminderLogs);
  return log;
}

// Generate standardized monthly library membership validity messages
function generateMembershipMessage(type, studentName, seatNumber, validityDate, libraryName) {
  const name = studentName || 'Student';
  const seatStr = seatNumber ? ` (Seat #${seatNumber})` : '';
  const dateStr = validityDate || 'the scheduled date';
  const lib = libraryName || 'Bhagwat Library';

  switch (type) {
    case 'due_tomorrow':
      return `📚 Dear ${name}, this is a reminder from ${lib}. Your monthly library membership validity${seatStr} is due for renewal tomorrow (${dateStr}). Please renew your membership to continue uninterrupted library access.`;
    case 'due_today':
      return `📚 Dear ${name}, your monthly library membership validity${seatStr} expires today (${dateStr}). Kindly renew your membership before the library closes to retain your seat reservation.`;
    case 'overdue':
      return `⚠️ Dear ${name}, your monthly library membership validity${seatStr} at ${lib} expired on ${dateStr} and is now overdue. Please renew your membership as soon as possible to avoid losing your seat allocation.`;
    default:
      return `📚 Dear ${name}, this is a reminder from ${lib} regarding your monthly library membership renewal${seatStr} due on ${dateStr}.`;
  }
}

/**
 * Calculates day difference between validity date and today (0: today, 1: tomorrow, <0: overdue)
 */
function getDueDiffDays(validityDateStr) {
  if (!validityDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(validityDateStr);
  if (isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Executes a full scan of student monthly library memberships and sends reminders
 */
async function runReminderScan(options = { manual: false, extraItems: null }) {
  const currentSettings = getSettings();

  // 1. Check if WhatsApp Reminders are enabled
  if (!currentSettings.whatsappEnabled) {
    logger.info('WhatsApp reminders are disabled in settings. Skipping scan.');
    return { success: true, message: 'WhatsApp reminders are disabled', sentCount: 0, skippedCount: 0 };
  }

  // 2. Check if Automated Scheduler is enabled (for non-manual runs)
  if (!options.manual && !currentSettings.automatedScheduler) {
    logger.info('Automated reminder system is disabled in settings. Skipping scan.');
    return { success: true, message: 'Automated reminder system is disabled', sentCount: 0, skippedCount: 0 };
  }

  const todayDateKey = new Date().toISOString().split('T')[0];
  logger.info(`Starting monthly membership validity reminder scan (Manual: ${options.manual}, Date: ${todayDateKey})...`);

  // Allow passing current student records or fallback to local memberships
  const candidates = options.extraItems && Array.isArray(options.extraItems)
    ? options.extraItems
    : memberships;

  // Filter for active students whose payment is not marked Paid for the upcoming period
  const activeMemberships = candidates.filter((s) => {
    const isPaid = s.paymentStatus === 'Paid' || s.status === 'Paid';
    const diff = getDueDiffDays(s.validityTo || s.validityEnd || s.dueDate);
    // If student has already paid and validity is in the future (> 1 day), skip
    if (isPaid && diff > 1) return false;
    return Boolean(s.validityTo || s.validityEnd || s.dueDate);
  });

  const results = {
    totalScanned: activeMemberships.length,
    sent: [],
    skipped: [],
    failed: [],
  };

  for (const student of activeMemberships) {
    const validityDate = student.validityTo || student.validityEnd || student.dueDate;
    const diffDays = getDueDiffDays(validityDate);
    if (diffDays === null) continue;

    let reminderType = null;

    if (diffDays === 1) {
      reminderType = 'due_tomorrow'; // Due Tomorrow: reminder sent 1 day before expiry
    } else if (diffDays === 0) {
      reminderType = 'due_today'; // Due Today: reminder sent on expiry day
    } else if (diffDays < 0) {
      reminderType = 'overdue'; // Overdue / Expired: sent once per day until renewed
    }

    if (!reminderType) {
      // Due in 2+ days; not due for a reminder yet
      results.skipped.push({ student, reason: 'Membership validity is more than 1 day away' });
      continue;
    }

    // Anti-Spam: Check for same-day duplicate reminder
    const isDuplicate = reminderLogs.some(
      (log) =>
        log.dateKey === todayDateKey &&
        (log.studentId === student.id || log.phone === student.phone) &&
        log.status === 'sent'
    );

    if (isDuplicate) {
      logger.info(`Skipping duplicate reminder for ${student.name || student.studentName} - already sent today.`);
      results.skipped.push({ student, reason: 'Already sent today (deduplicated)' });
      continue;
    }

    const studentName = student.name || student.studentName || 'Student';
    const phone = student.phone || '';
    const seatNumber = student.seatNumber || student.seat || null;

    const message = generateMembershipMessage(
      reminderType,
      studentName,
      seatNumber,
      validityDate,
      currentSettings.libraryName
    );

    try {
      if (!whatsappService.ready) {
        throw new Error('WhatsApp client is not connected');
      }

      logger.info(`Sending monthly membership ${reminderType} reminder to ${phone} (${studentName})...`);
      const sendRes = await whatsappService.sendTextMessage(phone, message);

      const logEntry = logReminderEntry({
        studentId: student.id || student._id,
        studentName,
        phone,
        seatNumber,
        validityDate,
        reminderType,
        status: 'sent',
        message,
        messageId: sendRes?.messageId,
      });

      results.sent.push(logEntry);
    } catch (err) {
      logger.error(`Failed to send membership reminder for student ${student.id || studentName} to ${phone}:`, { error: err.message });
      const logEntry = logReminderEntry({
        studentId: student.id || student._id,
        studentName,
        phone,
        seatNumber,
        validityDate,
        reminderType,
        status: 'failed',
        message,
        error: err.message,
      });

      results.failed.push(logEntry);
    }
  }

  // Update lastRunAt timestamp
  updateSettings({ lastRunAt: new Date().toISOString() });

  logger.info(`Membership reminder scan finished. Sent: ${results.sent.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    sentCount: results.sent.length,
    skippedCount: results.skipped.length,
    failedCount: results.failed.length,
    results,
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getMemberships,
  saveMemberships,
  getReminderLogs,
  logReminderEntry,
  generateMembershipMessage,
  getDueDiffDays,
  runReminderScan,
};



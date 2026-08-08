const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

// Reminder configuration & scheduler controls
router.get('/settings', reminderController.getSettings);
router.post('/settings', reminderController.updateSettings);
router.post('/trigger', reminderController.triggerReminders);
router.get('/logs', reminderController.getLogs);

// Membership data endpoints
router.get('/memberships', reminderController.getMemberships);
router.post('/memberships', reminderController.saveMemberships);

module.exports = router;


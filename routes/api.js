const express = require('express');
const router = express.Router();

router.use('/sms', require('./sms'));
router.use('/calls', require('./calls'));
router.use('/contacts', require('./contacts'));
router.use('/status', require('./status'));
router.use('/modem', require('./modem'));
router.use('/ussd', require('./ussd'));
router.use('/webcam', require('./webcam'));
router.use('/settings', require('./settings'));
router.use('/storage', require('./storage'));

module.exports = router;
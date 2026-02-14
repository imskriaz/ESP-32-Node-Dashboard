const express = require('express');
const router = express.Router();

// Import routers
const smsRouter = require('./sms');
const callsRouter = require('./calls');
const contactsRouter = require('./contacts');
const statusRouter = require('./status');
const modemRouter = require('./modem');
const ussdRouter = require('./ussd');

// Use routers
router.use('/sms', smsRouter);
router.use('/calls', callsRouter);
router.use('/contacts', contactsRouter);
router.use('/status', statusRouter);
router.use('/modem', modemRouter);
router.use('/ussd', ussdRouter);

module.exports = router;
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const flash = require('connect-flash');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Database initialization
let db;
(async () => {
    db = await initializeDatabase();
    app.locals.db = db;
    logger.info('Database initialized successfully');
})();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Flash messages
app.use(flash());

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    res.locals.moment = moment;
    next();
});

// EJS setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Socket.IO middleware for authentication
io.use((socket, next) => {
    const sessionId = socket.handshake.auth.sessionId;
    // In production, validate session properly
    next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});

// Make io available to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', authMiddleware, require('./routes/api'));
app.use('/', authMiddleware, require('./routes/index'));

// 404 handler
app.use((req, res) => {
    res.status(404).render('pages/404', {
        title: 'Page Not Found',
        layout: 'layouts/main'
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).render('pages/404', {
        title: 'Server Error',
        message: 'Something went wrong!',
        layout: 'layouts/main'
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
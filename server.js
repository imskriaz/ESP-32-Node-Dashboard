require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const flash = require('connect-flash');
const moment = require('moment');
const ejs = require('ejs');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const authMiddleware = require('./middleware/auth');

const mqttService = require('./services/mqttService');
const modemService = require('./services/modemService');
const mqttRoutes = require('./routes/mqtt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Database initialization with try-catch
let db;
(async () => {
    try {
        db = await initializeDatabase();
        app.locals.db = db;
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database fails to initialize
    }
})();

// Make services available globally
try {
    global.app = app;
    global.io = io;
    global.mqttService = mqttService;
    global.modemService = modemService;
} catch (error) {
    logger.error('Error setting global services:', error);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
try {
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
} catch (error) {
    logger.error('Session configuration error:', error);
}

// Flash messages
app.use(flash());

// Make user available to all views
app.use((req, res, next) => {
    try {
        res.locals.user = req.session.user || null;
        res.locals.success_msg = req.flash('success');
        res.locals.error_msg = req.flash('error');
        res.locals.moment = moment;
    } catch (error) {
        logger.error('Error in user locals middleware:', error);
    }
    next();
});

// EJS setup
try {
    app.use(expressLayouts);
    app.set('view engine', 'html');
    app.engine('html', ejs.renderFile);
    app.set('views', path.join(__dirname, 'views'));
    app.set('layout', 'layouts/main');
    app.locals.settings['view options'] = {
        client: false,
        filename: path.join(__dirname, 'views')
    };
} catch (error) {
    logger.error('EJS setup error:', error);
}

// Socket.IO middleware for authentication
io.use((socket, next) => {
    try {
        const sessionId = socket.handshake.auth.sessionId;
        // In production, validate session properly
        next();
    } catch (error) {
        logger.error('Socket auth error:', error);
        next(new Error('Authentication error'));
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    try {
        logger.info(`Socket connected: ${socket.id}`);
        
        socket.on('disconnect', () => {
            try {
                logger.info(`Socket disconnected: ${socket.id}`);
            } catch (error) {
                logger.error('Error in disconnect handler:', error);
            }
        });

        socket.on('error', (error) => {
            logger.error(`Socket error for ${socket.id}:`, error);
        });

    } catch (error) {
        logger.error('Error in socket connection handler:', error);
    }
});

// Make io available to routes
app.use((req, res, next) => {
    try {
        req.io = io;
    } catch (error) {
        logger.error('Error setting io on request:', error);
    }
    next();
});

// Routes
try {
    app.use('/auth', require('./routes/auth'));
    app.use('/api', authMiddleware, require('./routes/api'));
    app.use('/', authMiddleware, require('./routes/index'));
} catch (error) {
    logger.error('Error loading routes:', error);
}

// 404 handler
app.use((req, res) => {
    try {
        res.status(404).render('pages/404', {
            title: 'Page Not Found',
            layout: 'layouts/main'
        });
    } catch (error) {
        logger.error('404 handler error:', error);
        res.status(404).send('Page not found');
    }
});

// Error handler
app.use((err, req, res, next) => {
    try {
        logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
        res.status(500).render('pages/404', {
            title: 'Server Error',
            message: 'Something went wrong!',
            layout: 'layouts/main'
        });
    } catch (error) {
        logger.error('Error handler failed:', error);
        res.status(500).send('Server Error');
    }
});

// Connect to MQTT broker with error handling
try {
    mqttService.connect();
} catch (error) {
    logger.error('Failed to connect to MQTT broker:', error);
}

// Set up MQTT message handlers with try-catch
try {
    mqttService.on('sms:incoming', (deviceId, data) => {
        try {
            io.emit('sms:received', { deviceId, ...data });
        } catch (error) {
            logger.error('Error in sms:incoming handler:', error);
        }
    });

    mqttService.on('call:incoming', (deviceId, data) => {
        try {
            io.emit('call:incoming', { deviceId, ...data });
        } catch (error) {
            logger.error('Error in call:incoming handler:', error);
        }
    });

    mqttService.on('ussd:response', (deviceId, data) => {
        try {
            io.emit('ussd:response', { deviceId, ...data });
        } catch (error) {
            logger.error('Error in ussd:response handler:', error);
        }
    });

    mqttService.on('webcam:image', (deviceId, data) => {
        try {
            io.emit('webcam:capture', { deviceId, ...data });
        } catch (error) {
            logger.error('Error in webcam:image handler:', error);
        }
    });

    mqttService.on('wifi:scan', (deviceId, data) => {
        try {
            io.emit('modem:wifi-scan', { deviceId, networks: data.networks });
        } catch (error) {
            logger.error('Error in wifi:scan handler:', error);
        }
    });

    mqttService.on('hotspot:clients', (deviceId, data) => {
        try {
            io.emit('modem:hotspot-clients', { deviceId, clients: data.clients });
        } catch (error) {
            logger.error('Error in hotspot:clients handler:', error);
        }
    });
} catch (error) {
    logger.error('Error setting up MQTT handlers:', error);
}

// Add MQTT routes
try {
    app.use('/api/mqtt', authMiddleware, mqttRoutes);
} catch (error) {
    logger.error('Error adding MQTT routes:', error);
}

const PORT = process.env.PORT || 3001;
try {
    server.listen(PORT, () => {
        logger.info(`Server running on http://localhost:${PORT}`);
        logger.info(`MQTT broker: ${process.env.MQTT_HOST || 'device.atebd.com'}:${process.env.MQTT_PORT || 1883}`);
    });
} catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
}

module.exports = app;
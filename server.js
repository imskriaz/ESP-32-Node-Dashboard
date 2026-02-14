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
const fs = require('fs');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const authMiddleware = require('./middleware/auth');

// Import services
const mqttService = require('./services/mqttService');
const modemService = require('./services/modemService');
const MQTTHandlers = require('./services/mqttHandlers');

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const indexRoutes = require('./routes/index');
const mqttRoutes = require('./routes/mqtt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==================== DATABASE INITIALIZATION ====================
let db;
(async () => {
    try {
        db = await initializeDatabase();
        app.locals.db = db;
        logger.info('✅ Database initialized successfully');
        
        // Create necessary directories
        const dirs = [
            path.join(__dirname, 'storage'),
            path.join(__dirname, 'backups'),
            path.join(__dirname, 'public/uploads'),
            path.join(__dirname, 'public/uploads/webcam'),
            path.join(__dirname, 'public/uploads/files'),
            path.join(__dirname, 'logs'),
            path.join(__dirname, 'data'),
            path.join(__dirname, 'temp')
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`📁 Created directory: ${dir}`);
            }
        });

    } catch (error) {
        logger.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
})();

// ==================== GLOBAL VARIABLES ====================
global.app = app;
global.io = io;
global.mqttService = mqttService;
global.modemService = modemService;
global.logger = logger;

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
try {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'esp32-s3-dashboard-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            sameSite: 'lax'
        },
        name: 'esp32.sid',
        rolling: true
    }));
    logger.info('✅ Session middleware configured');
} catch (error) {
    logger.error('❌ Session configuration error:', error);
}

// Flash messages
app.use(flash());

// Make variables available to all views
app.use((req, res, next) => {
    try {
        res.locals.user = req.session.user || null;
        res.locals.success_msg = req.flash('success');
        res.locals.error_msg = req.flash('error');
        res.locals.moment = moment;
        res.locals.currentYear = new Date().getFullYear();
        res.locals.nodeEnv = process.env.NODE_ENV || 'development';
    } catch (error) {
        logger.error('Error in locals middleware:', error);
    }
    next();
});

// Make io available to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Request logging in development
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        logger.debug(`${req.method} ${req.url}`);
        next();
    });
}

// ==================== EJS SETUP ====================
try {
    app.use(expressLayouts);
    app.set('view engine', 'html');
    app.engine('html', ejs.renderFile);
    app.set('views', path.join(__dirname, 'views'));
    app.set('layout', 'layouts/main');
    app.locals.settings = {
        'view options': {
            client: false,
            filename: path.join(__dirname, 'views')
        }
    };
    logger.info('✅ EJS template engine configured');
} catch (error) {
    logger.error('❌ EJS setup error:', error);
}

// ==================== SOCKET.IO ====================
io.use((socket, next) => {
    try {
        const sessionId = socket.handshake.auth.sessionId;
        // In production, validate session properly
        socket.sessionId = sessionId;
        next();
    } catch (error) {
        logger.error('Socket auth error:', error);
        next(new Error('Authentication error'));
    }
});

// Track connected clients
const connectedClients = new Map();

io.on('connection', (socket) => {
    const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        connectedAt: new Date().toISOString()
    };
    
    connectedClients.set(socket.id, clientInfo);
    logger.info(`🔌 Socket connected: ${socket.id} (${connectedClients.size} total)`);

    // Send initial connection status
    socket.emit('connected', { 
        id: socket.id,
        timestamp: new Date().toISOString(),
        mqtt: mqttService.connected,
        clients: connectedClients.size
    });

    // Send initial device status
    const deviceStatus = modemService.getDeviceStatus();
    socket.emit('device:status', {
        online: deviceStatus.online,
        signal: deviceStatus.mobile?.signalStrength || 0,
        battery: deviceStatus.system?.battery || 0,
        charging: deviceStatus.system?.charging || false,
        network: deviceStatus.mobile?.networkType || 'No Service',
        operator: deviceStatus.mobile?.operator || 'Unknown',
        uptime: deviceStatus.system?.uptime || '0s'
    });

    socket.on('disconnect', () => {
        connectedClients.delete(socket.id);
        logger.info(`🔌 Socket disconnected: ${socket.id} (${connectedClients.size} remaining)`);
    });

    socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
    });

    // Handle client requests
    socket.on('get:status', () => {
        socket.emit('status', {
            server: 'online',
            mqtt: mqttService.connected,
            clients: connectedClients.size,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('get:mqtt-status', () => {
        socket.emit('mqtt:status', mqttService.getStatus());
    });

    socket.on('get:device-status', () => {
        const status = modemService.getDeviceStatus();
        socket.emit('device:status', {
            online: status.online,
            signal: status.mobile?.signalStrength || 0,
            battery: status.system?.battery || 0,
            charging: status.system?.charging || false,
            network: status.mobile?.networkType || 'No Service',
            operator: status.mobile?.operator || 'Unknown',
            uptime: status.system?.uptime || '0s'
        });
    });

    socket.on('get:devices', () => {
        const devices = modemService.getAllDevices();
        socket.emit('devices:list', devices);
    });
});

logger.info('✅ Socket.IO configured');

// ==================== MQTT HANDLERS INITIALIZATION ====================
const mqttHandlers = new MQTTHandlers(mqttService, io, app);
mqttHandlers.initialize();

// ==================== ROUTES ====================
try {
    app.use('/auth', authRoutes);
    app.use('/api', authMiddleware, apiRoutes);
    app.use('/api/mqtt', authMiddleware, mqttRoutes);
    app.use('/', authMiddleware, indexRoutes);
    logger.info('✅ Routes loaded successfully');
} catch (error) {
    logger.error('❌ Error loading routes:', error);
}

// ==================== 404 HANDLER ====================
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

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    try {
        logger.error(`💥 Unhandled error: ${err.message}`, { 
            stack: err.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            body: req.body
        });

        // Don't send error details in production
        const message = process.env.NODE_ENV === 'production' 
            ? 'Something went wrong!' 
            : err.message;

        res.status(500).render('pages/404', {
            title: 'Server Error',
            message: message,
            layout: 'layouts/main'
        });
    } catch (error) {
        logger.error('Error handler failed:', error);
        res.status(500).send('Server Error');
    }
});

// ==================== HEALTH CHECK ENDPOINT ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mqtt: {
            connected: mqttService.connected,
            connecting: mqttService.connecting
        },
        database: !!app.locals.db,
        clients: connectedClients.size,
        memory: process.memoryUsage(),
        version: process.version
    });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3001;

try {
    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`=================================`);
        logger.info(`🚀 Server is running!`);
        logger.info(`📡 URL: http://localhost:${PORT}`);
        logger.info(`🌐 Public URL: http://0.0.0.0:${PORT}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔌 MQTT Broker: ${process.env.MQTT_HOST || '163.227.6.71'}:${process.env.MQTT_PORT || 1883}`);
        logger.info(`💾 Database: ${path.join(__dirname, 'data/database.sqlite')}`);
        logger.info(`👥 Max clients: ${connectedClients.size}`);
        logger.info(`=================================`);
    });

    server.on('error', (error) => {
        logger.error('❌ Server error:', error);
        if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${PORT} is already in use`);
        }
        process.exit(1);
    });

} catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
}

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    logger.info('🛑 Received shutdown signal, closing connections...');

    // Stop accepting new connections
    server.close(() => {
        logger.info('✅ HTTP server closed');
    });

    // Close Socket.IO connections
    try {
        io.close();
        logger.info('✅ Socket.IO closed');
    } catch (error) {
        logger.error('Error closing Socket.IO:', error);
    }

    // Close MQTT connection
    try {
        mqttHandlers.disconnect();
        logger.info('✅ MQTT disconnected');
    } catch (error) {
        logger.error('Error disconnecting MQTT:', error);
    }

    // Close database connection
    try {
        if (db) {
            await db.close();
            logger.info('✅ Database connection closed');
        }
    } catch (error) {
        logger.error('Error closing database:', error);
    }

    // Give time for cleanup
    setTimeout(() => {
        logger.info('👋 Goodbye!');
        process.exit(0);
    }, 1000);
}

// ==================== UNCAUGHT EXCEPTIONS ====================
process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    logger.error(error.stack);
    // Give time to log before exiting
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise);
    logger.error('💥 Reason:', reason);
});

module.exports = { app, server };
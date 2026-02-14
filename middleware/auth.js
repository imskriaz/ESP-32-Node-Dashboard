const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Checks if user is logged in, redirects to login if not
 */
const authMiddleware = (req, res, next) => {
    // Public paths that don't require authentication
    const publicPaths = [
        '/auth/login',
        '/auth/logout',
        '/login'
    ];

    if (publicPaths.includes(req.path) || req.path.startsWith('/auth/')) {
        return next();
    }

    // Check if user is authenticated
    if (!req.session.user) {
        logger.debug(`Unauthorized access attempt to ${req.path}`);
        
        // Check if it's an API request
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }
        
        return res.redirect('/auth/login');
    }

    // Add user to request for easy access
    req.user = req.session.user;
    next();
};

/**
 * Check if user has admin role
 */
const adminMiddleware = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        logger.warn(`Admin access denied for user: ${req.session.user?.username}`);
        
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Admin access required' 
            });
        }
        
        req.flash('error', 'Access denied. Admin privileges required.');
        return res.redirect('/');
    }
    next();
};

module.exports = authMiddleware;
module.exports.admin = adminMiddleware;
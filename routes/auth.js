const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Login page
router.get('/login', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session.user) {
        return res.redirect('/');
    }
    
    res.render('pages/login', {
        title: 'Login',
        layout: false,
        error_msg: req.flash('error')
    });
});

// Login handler
router.post('/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', errors.array()[0].msg);
            return res.redirect('/auth/login');
        }

        const { username, password } = req.body;
        const db = req.app.locals.db;

        // Find user
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user) {
            logger.warn(`Failed login attempt for username: ${username}`);
            req.flash('error', 'Invalid username or password');
            return res.redirect('/auth/login');
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            logger.warn(`Failed login attempt for username: ${username}`);
            req.flash('error', 'Invalid username or password');
            return res.redirect('/auth/login');
        }

        // Update last login
        await db.run(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            email: user.email,
            role: user.role
        };

        logger.info(`User logged in: ${username}`);
        
        // Redirect to dashboard
        res.redirect('/');
    } catch (error) {
        logger.error('Login error:', error);
        req.flash('error', 'An error occurred during login');
        res.redirect('/auth/login');
    }
});

// Logout handler
router.get('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error:', err);
        }
        logger.info(`User logged out: ${username}`);
        res.redirect('/auth/login');
    });
});

// Check session status (API)
router.get('/session', (req, res) => {
    if (req.session.user) {
        res.json({
            authenticated: true,
            user: {
                username: req.session.user.username,
                name: req.session.user.name,
                role: req.session.user.role
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;
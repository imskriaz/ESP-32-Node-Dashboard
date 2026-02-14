const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Get all contacts with pagination and search
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = 'SELECT * FROM contacts';
        let countQuery = 'SELECT COUNT(*) as count FROM contacts';
        let params = [];
        let whereClauses = [];

        if (search) {
            whereClauses.push('(name LIKE ? OR phone_number LIKE ? OR email LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (whereClauses.length > 0) {
            const whereString = ' WHERE ' + whereClauses.join(' AND ');
            query += whereString;
            countQuery += whereString;
        }

        query += ' ORDER BY favorite DESC, name ASC LIMIT ? OFFSET ?';
        
        const queryParams = [...params, limit, offset];
        const countParams = [...params];

        const contacts = await db.all(query, queryParams);
        const total = await db.get(countQuery, countParams);

        res.json({
            success: true,
            data: contacts,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        logger.error('API contacts list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch contacts',
            error: error.message
        });
    }
});

// Get single contact
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;

        const contact = await db.get('SELECT * FROM contacts WHERE id = ?', [id]);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        logger.error('API get contact error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch contact',
            error: error.message
        });
    }
});

// Create new contact
router.post('/', [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone_number').notEmpty().withMessage('Phone number is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { name, phone_number, email, company, favorite, notes } = req.body;
        const db = req.app.locals.db;

        // Format phone number
        let formattedNumber = phone_number;
        if (!phone_number.startsWith('+')) {
            const digits = phone_number.replace(/\D/g, '');
            if (digits.length === 10) {
                formattedNumber = '+88' + digits;
            } else if (digits.length === 11 && digits.startsWith('0')) {
                formattedNumber = '+88' + digits.substring(1);
            } else if (digits.length > 0) {
                formattedNumber = '+' + digits;
            }
        }

        const result = await db.run(`
            INSERT INTO contacts (name, phone_number, email, company, favorite, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
            name, 
            formattedNumber, 
            email || null, 
            company || null, 
            favorite ? 1 : 0, 
            notes || null
        ]);

        logger.info(`Contact created: ${name}`);

        const newContact = await db.get('SELECT * FROM contacts WHERE id = ?', [result.lastID]);

        res.json({
            success: true,
            message: 'Contact created successfully',
            data: newContact
        });
    } catch (error) {
        logger.error('API create contact error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create contact',
            error: error.message
        });
    }
});

// Update contact
router.put('/:id', [
    body('name').optional().notEmpty(),
    body('phone_number').optional().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { id } = req.params;
        const { name, phone_number, email, company, favorite, notes } = req.body;
        const db = req.app.locals.db;

        // Check if contact exists
        const existing = await db.get('SELECT * FROM contacts WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        // Build update query
        let updates = [];
        let params = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (phone_number !== undefined) {
            let formattedNumber = phone_number;
            if (!phone_number.startsWith('+')) {
                const digits = phone_number.replace(/\D/g, '');
                if (digits.length === 10) {
                    formattedNumber = '+88' + digits;
                } else if (digits.length > 0) {
                    formattedNumber = '+' + digits;
                }
            }
            updates.push('phone_number = ?');
            params.push(formattedNumber);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email || null);
        }
        if (company !== undefined) {
            updates.push('company = ?');
            params.push(company || null);
        }
        if (favorite !== undefined) {
            updates.push('favorite = ?');
            params.push(favorite ? 1 : 0);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            params.push(notes || null);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(id);
        await db.run(`
            UPDATE contacts 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, params);

        logger.info(`Contact updated: ${id}`);

        const updatedContact = await db.get('SELECT * FROM contacts WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Contact updated successfully',
            data: updatedContact
        });
    } catch (error) {
        logger.error('API update contact error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update contact',
            error: error.message
        });
    }
});

// Delete contact
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.app.locals.db;

        const result = await db.run('DELETE FROM contacts WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        logger.info(`Contact deleted: ${id}`);

        res.json({
            success: true,
            message: 'Contact deleted successfully'
        });
    } catch (error) {
        logger.error('API delete contact error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete contact',
            error: error.message
        });
    }
});

// Toggle favorite
router.patch('/:id/favorite', async (req, res) => {
    try {
        const { id } = req.params;
        const { favorite } = req.body;
        const db = req.app.locals.db;

        // Check if contact exists
        const existing = await db.get('SELECT * FROM contacts WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        await db.run(
            'UPDATE contacts SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [favorite ? 1 : 0, id]
        );

        const updatedContact = await db.get('SELECT * FROM contacts WHERE id = ?', [id]);

        logger.info(`Contact ${id} favorite toggled to ${favorite}`);

        res.json({
            success: true,
            message: favorite ? 'Added to favorites' : 'Removed from favorites',
            data: updatedContact
        });
    } catch (error) {
        logger.error('API toggle favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update favorite status'
        });
    }
});

// Search contacts
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const db = req.app.locals.db;
        const limit = parseInt(req.query.limit) || 10;

        const contacts = await db.all(`
            SELECT id, name, phone_number, favorite 
            FROM contacts 
            WHERE name LIKE ? OR phone_number LIKE ? 
            ORDER BY favorite DESC, name ASC 
            LIMIT ?
        `, [`%${query}%`, `%${query}%`, limit]);

        res.json({
            success: true,
            data: contacts
        });
    } catch (error) {
        logger.error('API search contacts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search contacts',
            error: error.message
        });
    }
});

module.exports = router;
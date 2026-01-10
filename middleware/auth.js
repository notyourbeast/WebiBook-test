// middleware/auth.js - SIMPLIFIED
const jwt = require('jsonwebtoken');

// Simple token generation
const generateToken = (userId) => {
    try {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '30d' }
        );
    } catch (error) {
        // Fallback to simple hash
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(`${userId}-${Date.now()}`).digest('hex');
    }
};

// Simple token verification
const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            req.user = null;
            return next();
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
            req.user = { _id: decoded.userId };
        } catch (jwtError) {
            req.user = null;
        }
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        req.user = null;
        next();
    }
};

module.exports = { generateToken, verifyToken };
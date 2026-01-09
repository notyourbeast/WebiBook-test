const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = {
    // Generate JWT Token
    generateToken: (userId) => {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
    },

    // Verify JWT Token Middleware
    verifyToken: async (req, res, next) => {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            
            if (!token) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = user;
            req.token = token;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Invalid token' });
        }
    },

    // Optional authentication
    optionalAuth: async (req, res, next) => {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId);
                
                if (user) {
                    req.user = user;
                    req.token = token;
                }
            }
            next();
        } catch (error) {
            next();
        }
    }
};

module.exports = auth;
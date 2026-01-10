#!/usr/bin/env node
/**
 * WebiBook Analytics Backend Server - MongoDB Version
 * Multi-user, multi-device system
 */
require('dotenv').config();

// Debug: Check if env variables are loaded
console.log('=== Environment Variables Check ===');
console.log('ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? '✓ Loaded' : '✗ NOT FOUND');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✓ Loaded' : '✗ NOT FOUND');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✓ Loaded' : '✗ NOT FOUND');
console.log('PORT:', process.env.PORT || 3000);
console.log('==================================\n');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const geoip = require('geoip-lite');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://webibook-test-3zoz.onrender.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database Connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined in .env file');
            throw new Error('MongoDB URI is missing');
        }
        
        console.log('🔗 Connecting to MongoDB...');
        
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ MongoDB Connected Successfully');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

// Connect to database
connectDB().catch(console.error);

// Simple in-memory auth for now (bypass MongoDB issues)
const generateToken = (userId, email) => {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(`${userId}-${email}-${Date.now()}`).digest('hex');
};

// In-memory storage for development
const memoryStorage = {
    users: [],
    events: [],
    emails: [],
    visits: []
};

// Get client info
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const geo = geoip.lookup(ip);
    
    req.clientInfo = {
        ip,
        userAgent: req.headers['user-agent'] || '',
        geo: geo ? {
            country: geo.country,
            region: geo.region,
            city: geo.city,
            timezone: geo.timezone,
            ll: geo.ll
        } : null,
        referrer: req.headers.referer
    };
    next();
});

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Simple Register/Login - FIXED VERSION
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('📨 REGISTER REQUEST RECEIVED:', req.body);
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            console.log('❌ Invalid email format:', email);
            return res.status(400).json({ 
                success: false,
                error: 'Valid email is required' 
            });
        }
        
        const cleanEmail = email.toLowerCase().trim();
        
        // Try MongoDB first
        try {
            // Check if User model is available
            let UserModel;
            try {
                UserModel = require('./models/User');
            } catch (err) {
                UserModel = null;
            }
            
            if (UserModel && mongoose.connection.readyState === 1) {
                let user = await UserModel.findOne({ email: cleanEmail });
                
                if (!user) {
                    // Create new user
                    user = new UserModel({
                        email: cleanEmail,
                        name: cleanEmail.split('@')[0],
                        deviceInfo: {
                            userAgent: req.clientInfo.userAgent || '',
                            browser: 'unknown',
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                        },
                        location: {
                            ipAddress: req.clientInfo.ip || 'unknown',
                            country: 'unknown'
                        },
                        firstVisit: new Date(),
                        lastVisit: new Date(),
                        visitCount: 1
                    });
                    await user.save();
                }
                
                const token = generateToken(user._id || cleanEmail, cleanEmail);
                
                return res.json({
                    success: true,
                    message: 'Registration successful!',
                    user: {
                        id: user._id || cleanEmail,
                        email: user.email || cleanEmail,
                        name: user.name || cleanEmail.split('@')[0],
                        savedEvents: user.savedEvents || [],
                        visitCount: user.visitCount || 1
                    },
                    token
                });
            }
        } catch (dbError) {
            console.log('⚠️ MongoDB failed, using memory storage:', dbError.message);
        }
        
        // Fallback to memory storage
        const existingUser = memoryStorage.users.find(u => u.email === cleanEmail);
        
        if (existingUser) {
            // Update existing user
            existingUser.lastVisit = new Date();
            existingUser.visitCount += 1;
            
            const token = generateToken(existingUser.id, cleanEmail);
            
            return res.json({
                success: true,
                message: 'Welcome back!',
                user: {
                    id: existingUser.id,
                    email: existingUser.email,
                    name: existingUser.name,
                    savedEvents: existingUser.savedEvents || [],
                    visitCount: existingUser.visitCount
                },
                token
            });
        }
        
        // Create new user in memory
        const newUser = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            email: cleanEmail,
            name: cleanEmail.split('@')[0],
            savedEvents: [],
            deviceInfo: {
                userAgent: req.clientInfo.userAgent || '',
                browser: 'unknown',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            location: {
                ipAddress: req.clientInfo.ip || 'unknown',
                country: 'unknown'
            },
            firstVisit: new Date(),
            lastVisit: new Date(),
            visitCount: 1,
            createdAt: new Date()
        };
        
        memoryStorage.users.push(newUser);
        
        const token = generateToken(newUser.id, cleanEmail);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                savedEvents: [],
                visitCount: 1
            },
            token
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Registration failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get events
app.get('/api/events', async (req, res) => {
    try {
        // Try MongoDB
        try {
            const EventModel = require('./models/Event');
            if (mongoose.connection.readyState === 1) {
                const events = await EventModel.find({ isActive: true }).lean();
                return res.json({
                    success: true,
                    events: events.map(e => ({
                        id: e.eventId,
                        eventId: e.eventId,
                        title: e.title,
                        topic: e.topic,
                        date: e.date,
                        time: e.time,
                        duration: e.duration,
                        audience: e.audience,
                        url: e.url
                    }))
                });
            }
        } catch (dbError) {
            console.log('⚠️ Using fallback events:', dbError.message);
        }
        
        // Fallback events
        const fallbackEvents = [
            {
                id: 'event-1',
                eventId: 'event-1',
                title: 'Introduction to React Hooks',
                topic: 'Development',
                date: 'January 18, 2024',
                time: '2:00 PM EST',
                duration: '1 hour',
                audience: 'Frontend developers new to React',
                url: 'https://example.com/react-hooks'
            },
            {
                id: 'event-2',
                eventId: 'event-2',
                title: 'Data Science Fundamentals',
                topic: 'Data',
                date: 'January 19, 2024',
                time: '10:00 AM PST',
                duration: '90 minutes',
                audience: 'Beginners interested in data analysis',
                url: 'https://example.com/data-science'
            },
            {
                id: 'event-3',
                eventId: 'event-3',
                title: 'Product Design Workshop',
                topic: 'Design',
                date: 'January 20, 2024',
                time: '3:30 PM EST',
                duration: '2 hours',
                audience: 'Product managers and designers',
                url: 'https://example.com/product-design'
            }
        ];
        
        res.json({
            success: true,
            events: fallbackEvents
        });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch events',
            events: [] 
        });
    }
});

// Save event
app.post('/api/events/save', async (req, res) => {
    try {
        const { eventId, token } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
        // For now, just return success
        res.json({
            success: true,
            message: 'Event saved successfully'
        });
        
    } catch (error) {
        console.error('Save event error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save event' 
        });
    }
});

// Unsave event
app.post('/api/events/unsave', async (req, res) => {
    try {
        const { eventId, token } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
        res.json({
            success: true,
            message: 'Event unsaved successfully'
        });
        
    } catch (error) {
        console.error('Unsave event error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to unsave event' 
        });
    }
});

// Email subscription
app.post('/api/emails/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ 
                success: false,
                error: 'Valid email is required' 
            });
        }
        
        const cleanEmail = email.toLowerCase().trim();
        
        // Store in memory
        if (!memoryStorage.emails.find(e => e.email === cleanEmail)) {
            memoryStorage.emails.push({
                email: cleanEmail,
                subscribedAt: new Date(),
                source: 'weekly_reminder'
            });
        }
        
        res.json({
            success: true,
            message: 'Subscribed to weekly emails!'
        });
        
    } catch (error) {
        console.error('Email subscription error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to subscribe. Please try again.' 
        });
    }
});

// Track visit
app.post('/api/visits/track', async (req, res) => {
    try {
        const { isReturning, sessionId } = req.body;
        
        const visitData = {
            sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isReturning: isReturning || false,
            visitedAt: new Date(),
            deviceInfo: {
                userAgent: req.clientInfo.userAgent,
                browser: 'unknown'
            },
            location: {
                ipAddress: req.clientInfo.ip,
                country: req.clientInfo.geo?.country || 'unknown'
            }
        };
        
        memoryStorage.visits.push(visitData);
        
        // Set session cookie
        res.cookie('sessionId', visitData.sessionId, {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            httpOnly: true
        });
        
        res.json({
            success: true,
            message: 'Visit tracked',
            sessionId: visitData.sessionId
        });
        
    } catch (error) {
        console.error('Visit tracking error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to track visit' 
        });
    }
});

// Track event click
app.post('/api/events/click', async (req, res) => {
    try {
        const { eventId, eventTitle, eventTopic } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
        // Track in memory
        console.log(`📊 Event click tracked: ${eventId} - ${eventTitle}`);
        
        res.json({
            success: true,
            message: 'Event click tracked'
        });
        
    } catch (error) {
        console.error('Track event click error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to track event click' 
        });
    }
});

// Admin dashboard
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (!password || password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied' 
            });
        }
        
        const dashboardData = {
            metrics: {
                emailSubscriptions: memoryStorage.emails.length,
                totalUsers: memoryStorage.users.length,
                totalVisits: memoryStorage.visits.length,
                returnRate: '0%',
                activeUsers: memoryStorage.users.length
            },
            emailSubscriptions: memoryStorage.emails.map(e => ({
                email: e.email,
                subscribedAt: e.subscribedAt
            })),
            users: memoryStorage.users.map(u => ({
                email: u.email,
                savedEvents: u.savedEvents,
                visitCount: u.visitCount
            })),
            eventClicks: []
        };
        
        res.json({
            success: true,
            dashboard: dashboardData
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load dashboard' 
        });
    }
});

// Export data
app.get('/api/admin/export', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (!password || password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied' 
            });
        }
        
        const exportData = {
            timestamp: new Date().toISOString(),
            weeklyEmails: memoryStorage.emails.map(e => e.email),
            savedEvents: memoryStorage.users.reduce((acc, user) => {
                if (user.savedEvents && user.savedEvents.length > 0) {
                    acc[user.email] = user.savedEvents;
                }
                return acc;
            }, {}),
            visitStats: {
                firstVisits: memoryStorage.visits.filter(v => !v.isReturning).length,
                returnVisits: memoryStorage.visits.filter(v => v.isReturning).length,
                totalVisits: memoryStorage.visits.length,
                lastVisit: memoryStorage.visits.length > 0 
                    ? memoryStorage.visits[memoryStorage.visits.length - 1].visitedAt 
                    : null
            },
            lastUpdated: new Date().toISOString()
        };
        
        res.json(exportData);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to export data' 
        });
    }
});

// ============================================================================
// STATIC FILES AND ROUTING
// ============================================================================

// Serve static files
app.use(express.static(__dirname));

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            success: false,
            error: 'API endpoint not found' 
        });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'Route not found' 
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`🚀 WebiBook Server running on port ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}?admin=${process.env.ADMIN_PASSWORD}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/health`);
    console.log(`📝 Mode: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('👋 Shutting down server...');
    await mongoose.connection.close();
    process.exit(0);
});
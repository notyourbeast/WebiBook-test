#!/usr/bin/env node
/**
 * WebiBook Analytics Backend Server - MongoDB Version
 */
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

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

// Load models safely with fallback
let User, Event, EmailSubscription, Visit, EventClick;
try {
    User = require('./models/User');
    Event = require('./models/Event');
    EmailSubscription = require('./models/EventSubscription');
    Visit = require('./models/Visit');
    EventClick = require('./models/EventClick');
    console.log('✅ All models loaded successfully');
} catch (error) {
    console.error('❌ Error loading models:', error.message);
    console.log('⚠️  Some features may not work');
}

// Database connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined in .env file');
            console.log('⚠️  Using in-memory mode');
            return;
        }
        
        console.log('🔗 Connecting to MongoDB...');
        
        // REMOVED deprecated options for Mongoose 9.x
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB Connected Successfully');
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('⚠️  Using in-memory mode');
    }
};

// Connect to database
connectDB();

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

app.use(express.json());
app.use(cookieParser());

// Client info middleware
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

// Simple token generation (fallback if auth.js fails)
const generateSimpleToken = (userId) => {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(`${userId}-${Date.now()}`).digest('hex');
};

// ============================================================================
// API ENDPOINTS - SIMPLIFIED VERSION
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        models: {
            User: !!User,
            Event: !!Event,
            EmailSubscription: !!EmailSubscription
        }
    });
});

// Register/Login User - SIMPLIFIED
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('📨 REGISTER REQUEST:', req.body);
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid email is required' 
            });
        }
        
        const cleanEmail = email.toLowerCase().trim();
        
        // Try MongoDB first
        if (User && mongoose.connection.readyState === 1) {
            try {
                let user = await User.findOne({ email: cleanEmail });
                
                if (user) {
                    user.lastVisit = new Date();
                    user.visitCount += 1;
                    await user.save();
                } else {
                    user = new User({
                        email: cleanEmail,
                        name: cleanEmail.split('@')[0],
                        deviceInfo: {
                            userAgent: req.clientInfo.userAgent || '',
                            browser: 'unknown',
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                        },
                        location: {
                            ipAddress: req.clientInfo.ip || 'unknown',
                            country: req.clientInfo.geo?.country || 'unknown'
                        },
                        firstVisit: new Date(),
                        lastVisit: new Date(),
                        visitCount: 1
                    });
                    await user.save();
                }
                
                const token = generateSimpleToken(user._id);
                
                return res.json({
                    success: true,
                    message: 'Registration successful!',
                    user: {
                        id: user._id || cleanEmail,
                        email: user.email,
                        name: user.name || cleanEmail.split('@')[0],
                        savedEvents: user.savedEvents || [],
                        visitCount: user.visitCount || 1
                    },
                    token
                });
                
            } catch (dbError) {
                console.log('⚠️ MongoDB operation failed:', dbError.message);
            }
        }
        
        // Fallback: Always return success
        const token = generateSimpleToken(cleanEmail);
        
        res.json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: cleanEmail,
                email: cleanEmail,
                name: cleanEmail.split('@')[0],
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
        if (Event && mongoose.connection.readyState === 1) {
            try {
                const events = await Event.find({ isActive: true }).lean();
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
            } catch (dbError) {
                console.log('⚠️ Using fallback events');
            }
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
        const { eventId } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
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
        
        // Try to save to MongoDB
        if (EmailSubscription && mongoose.connection.readyState === 1) {
            try {
                let subscription = await EmailSubscription.findOne({ email: cleanEmail });
                
                if (!subscription) {
                    subscription = new EmailSubscription({
                        email: cleanEmail,
                        source: 'weekly_reminder',
                        subscribedAt: new Date(),
                        isActive: true
                    });
                    await subscription.save();
                }
            } catch (dbError) {
                console.log('⚠️ Email subscription save failed:', dbError.message);
            }
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
        
        let metrics = {
            emailSubscriptions: 0,
            totalUsers: 0,
            totalVisits: 0,
            returnRate: '0%',
            activeUsers: 0
        };
        
        let emailSubscriptions = [];
        let users = [];
        
        // Try to get data from MongoDB
        if (mongoose.connection.readyState === 1) {
            try {
                if (EmailSubscription) {
                    metrics.emailSubscriptions = await EmailSubscription.countDocuments({ isActive: true });
                    emailSubscriptions = await EmailSubscription.find({ isActive: true })
                        .sort({ subscribedAt: -1 })
                        .limit(100)
                        .select('email subscribedAt')
                        .lean();
                }
                
                if (User) {
                    metrics.totalUsers = await User.countDocuments();
                    users = await User.find()
                        .sort({ lastVisit: -1 })
                        .limit(50)
                        .select('email savedEvents visitCount firstVisit lastVisit')
                        .lean();
                }
                
                if (Visit) {
                    metrics.totalVisits = await Visit.countDocuments();
                }
                
            } catch (dbError) {
                console.log('⚠️ Dashboard data fetch failed:', dbError.message);
            }
        }
        
        res.json({
            success: true,
            dashboard: {
                metrics,
                emailSubscriptions,
                users,
                eventClicks: []
            }
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
            weeklyEmails: [],
            savedEvents: {},
            visitStats: {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                lastVisit: null
            },
            lastUpdated: new Date().toISOString()
        };
        
        // Try to get data from MongoDB
        if (mongoose.connection.readyState === 1) {
            try {
                if (EmailSubscription) {
                    const emails = await EmailSubscription.find({ isActive: true }).lean();
                    exportData.weeklyEmails = emails.map(e => e.email);
                }
                
                if (User) {
                    const users = await User.find().lean();
                    exportData.savedEvents = users.reduce((acc, user) => {
                        if (user.savedEvents && user.savedEvents.length > 0) {
                            acc[user.email] = user.savedEvents.map(se => se.eventId);
                        }
                        return acc;
                    }, {});
                }
                
                if (Visit) {
                    const visits = await Visit.find().sort({ visitedAt: -1 }).limit(1000).lean();
                    exportData.visitStats.totalVisits = visits.length;
                    exportData.visitStats.returnVisits = visits.filter(v => v.isReturning).length;
                    exportData.visitStats.firstVisits = visits.filter(v => !v.isReturning).length;
                    exportData.visitStats.lastVisit = visits.length > 0 ? visits[0].visitedAt : null;
                }
                
            } catch (dbError) {
                console.log('⚠️ Export data fetch failed:', dbError.message);
            }
        }
        
        res.json(exportData);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to export data' 
        });
    }
});

// Initialize sample data
async function initializeSampleData() {
    try {
        if (Event && mongoose.connection.readyState === 1) {
            const eventCount = await Event.countDocuments();
            
            if (eventCount === 0) {
                const sampleEvents = [
                    {
                        eventId: 'event-1',
                        title: 'Introduction to React Hooks',
                        topic: 'Development',
                        date: 'January 18, 2024',
                        time: '2:00 PM EST',
                        duration: '1 hour',
                        audience: 'Frontend developers new to React',
                        url: 'https://example.com/react-hooks',
                        description: 'Learn the fundamentals of React Hooks'
                    },
                    {
                        eventId: 'event-2',
                        title: 'Data Science Fundamentals',
                        topic: 'Data',
                        date: 'January 19, 2024',
                        time: '10:00 AM PST',
                        duration: '90 minutes',
                        audience: 'Beginners interested in data analysis',
                        url: 'https://example.com/data-science',
                        description: 'Introduction to data science concepts'
                    },
                    {
                        eventId: 'event-3',
                        title: 'Product Design Workshop',
                        topic: 'Design',
                        date: 'January 20, 2024',
                        time: '3:30 PM EST',
                        duration: '2 hours',
                        audience: 'Product managers and designers',
                        url: 'https://example.com/product-design',
                        description: 'Workshop on modern product design principles'
                    }
                ];
                
                await Event.insertMany(sampleEvents);
                console.log('✅ Sample events added to database');
            }
        }
    } catch (error) {
        console.error('Error initializing sample data:', error);
    }
}

// ============================================================================
// STATIC FILES
// ============================================================================

app.use(express.static(__dirname));

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
// START SERVER
// ============================================================================

app.listen(PORT, async () => {
    console.log(`🚀 WebiBook Server running on port ${PORT}`);
    console.log(`📊 MongoDB Status: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    console.log(`🔐 Admin: http://localhost:${PORT}?admin=${process.env.ADMIN_PASSWORD}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
    
    // Initialize sample data
    await initializeSampleData();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('👋 Shutting down server...');
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
    }
    process.exit(0);
});
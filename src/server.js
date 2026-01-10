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

// Database and Models - CORRECT PATHS FOR YOUR STRUCTURE
const connectDB = require('../config/database');  // database.js is in config/
const User = require('../models/User');           // User.js is in models/
const Event = require('../models/Event');         // Event.js is in models/
const EmailSubscription = require('../models/EventSubscription'); // models/
const Visit = require('../models/Visit');         // models/
const EventClick = require('../models/EventClick'); // models/
const auth = require('../middleware/auth');       // auth.js is in middleware/



const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();
// At the top of server.js, add this for production
if (process.env.NODE_ENV === 'production') {
    console.log('🚀 Running in production mode');
}

// Update CORS for production
app.use(cors({
    origin: [
        'https://webibook-test.netlify.app',
        'http://localhost:3000'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Get client IP and location
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const geo = geoip.lookup(ip);
    
    req.clientInfo = {
        ip,
        userAgent: req.headers['user-agent'],
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
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateUser(email, deviceInfo, location) {
    try {
        // Check if user exists
        let user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Create new user
            user = new User({
                email: email.toLowerCase(),
                deviceInfo,
                location,
                firstVisit: new Date(),
                lastVisit: new Date(),
                visitCount: 1
            });
            await user.save();
        } else {
            // Update existing user
            user.visitCount += 1;
            user.lastVisit = new Date();
            user.deviceInfo = { ...user.deviceInfo, ...deviceInfo };
            await user.save();
        }
        
        return user;
    } catch (error) {
        console.error('Error in getOrCreateUser:', error);
        throw error;
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: 'MongoDB'
    });
});

// Register/Login User - Email only
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        
        const cleanEmail = email.toLowerCase().trim();
        
        // Check if user exists
        let user = await User.findOne({ email: cleanEmail });
        
        if (user) {
            // User exists - just update last visit
            user.lastVisit = new Date();
            user.visitCount += 1;
            await user.save();
            
            // Generate token
            const token = auth.generateToken(user._id);
            
            return res.json({
                success: true,
                message: 'Welcome back!',
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name || user.email.split('@')[0],
                    savedEvents: user.savedEvents || [],
                    visitCount: user.visitCount
                },
                token
            });
        }
        
        // Create new user (NO PASSWORD)
        user = new User({
            email: cleanEmail,
            name: cleanEmail.split('@')[0],
            deviceInfo: {
                userAgent: req.clientInfo.userAgent || '',
                browser: req.clientInfo.userAgent?.match(/(chrome|firefox|safari|edge)/i)?.[0] || 'unknown',
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
        
        // Generate token
        const token = auth.generateToken(user._id);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
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
            details: error.message 
        });
    }
});

// Get user profile
app.get('/api/auth/profile', auth.verifyToken, async (req, res) => {
    try {
        // Get user with latest data
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name || user.email.split('@')[0],
                savedEvents: user.savedEvents || [],
                visitCount: user.visitCount || 0
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get profile' 
        });
    }
});

// ============================================================================
// EVENTS MANAGEMENT
// ============================================================================

// Get all events
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find({ isActive: true })
            .sort({ date: 1 })
            .select('-__v');
        
        res.json({
            success: true,
            events
        });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Save event for user
app.post('/api/events/save', auth.verifyToken, async (req, res) => {
    try {
        const { eventId } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ error: 'Event ID is required' });
        }
        
        // Check if event exists
        const event = await Event.findOne({ eventId });
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        // Check if already saved
        const alreadySaved = req.user.savedEvents.some(
            saved => saved.eventId === eventId
        );
        
        if (!alreadySaved) {
            // Add to saved events
            req.user.savedEvents.push({
                eventId,
                savedAt: new Date()
            });
            
            // Increment saved count on event
            event.savedCount += 1;
            await event.save();
            
            await req.user.save();
        }
        
        res.json({
            success: true,
            message: 'Event saved',
            savedEvents: req.user.savedEvents
        });
    } catch (error) {
        console.error('Save event error:', error);
        res.status(500).json({ error: 'Failed to save event' });
    }
});

// Unsave event
app.post('/api/events/unsave', auth.verifyToken, async (req, res) => {
    try {
        const { eventId } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ error: 'Event ID is required' });
        }
        
        // Remove from saved events
        req.user.savedEvents = req.user.savedEvents.filter(
            saved => saved.eventId !== eventId
        );
        
        // Decrement saved count on event
        const event = await Event.findOne({ eventId });
        if (event && event.savedCount > 0) {
            event.savedCount -= 1;
            await event.save();
        }
        
        await req.user.save();
        
        res.json({
            success: true,
            message: 'Event unsaved',
            savedEvents: req.user.savedEvents
        });
    } catch (error) {
        console.error('Unsave event error:', error);
        res.status(500).json({ error: 'Failed to unsave event' });
    }
});

// Track event click
app.post('/api/events/click', auth.optionalAuth, async (req, res) => {
    try {
        const { eventId, eventTitle, eventTopic } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ error: 'Event ID is required' });
        }
        
        // Record click
        const eventClick = new EventClick({
            eventId,
            eventTitle: eventTitle || eventId,
            eventTopic: eventTopic || 'unknown',
            userId: req.user?._id,
            sessionId: req.cookies.sessionId || 'anonymous',
            deviceInfo: {
                userAgent: req.clientInfo.userAgent
            },
            location: {
                ipAddress: req.clientInfo.ip,
                country: req.clientInfo.geo?.country
            }
        });
        
        await eventClick.save();
        
        // Update event click count
        await Event.findOneAndUpdate(
            { eventId },
            { $inc: { clickCount: 1 } },
            { upsert: true }
        );
        
        res.json({ success: true, message: 'Event click tracked' });
    } catch (error) {
        console.error('Track event click error:', error);
        res.status(500).json({ error: 'Failed to track event click' });
    }
});

// ============================================================================
// EMAIL SUBSCRIPTIONS
// ============================================================================

// Subscribe to weekly emails
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
        
        // First, ensure user exists (create if not)
        let user = await User.findOne({ email: cleanEmail });
        
        if (!user) {
            user = new User({
                email: cleanEmail,
                name: cleanEmail.split('@')[0],
                deviceInfo: {
                    userAgent: req.clientInfo.userAgent || '',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                location: {
                    ipAddress: req.clientInfo.ip || 'unknown'
                },
                firstVisit: new Date(),
                lastVisit: new Date(),
                visitCount: 1
            });
            await user.save();
        }
        
        // Subscribe to weekly emails
        let subscription = await EmailSubscription.findOne({ email: cleanEmail });
        
        if (!subscription) {
            subscription = new EmailSubscription({
                email: cleanEmail,
                source: 'weekly_reminder',
                subscribedAt: new Date(),
                isActive: true,
                userId: user._id
            });
            await subscription.save();
        } else if (!subscription.isActive) {
            subscription.isActive = true;
            subscription.unsubscribedAt = null;
            await subscription.save();
        }
        
        res.json({
            success: true,
            message: 'Subscribed to weekly emails!',
            email: cleanEmail,
            alreadySubscribed: !!subscription
        });
        
    } catch (error) {
        console.error('Email subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to subscribe. Please try again.'
        });
    }
});

// Unsubscribe from emails
app.post('/api/emails/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const subscription = await EmailSubscription.findOne({ 
            email: email.toLowerCase() 
        });
        
        if (subscription) {
            subscription.isActive = false;
            subscription.unsubscribedAt = new Date();
            await subscription.save();
        }
        
        res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// ============================================================================
// VISIT TRACKING
// ============================================================================

// Track visit
app.post('/api/visits/track', auth.optionalAuth, async (req, res) => {
    try {
        const { isReturning, sessionId } = req.body;
        
        // Generate session ID if not provided
        const currentSessionId = sessionId || 
            `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Set session cookie
        res.cookie('sessionId', currentSessionId, {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            httpOnly: true
        });
        
        // Record visit
        const visit = new Visit({
            userId: req.user?._id,
            sessionId: currentSessionId,
            isNewUser: !isReturning,
            isReturning: isReturning || false,
            deviceInfo: {
                userAgent: req.clientInfo.userAgent,
                browser: req.clientInfo.userAgent?.match(/(chrome|firefox|safari|edge)/i)?.[0] || 'unknown',
                os: req.clientInfo.userAgent?.match(/(windows|mac os|linux|android|ios)/i)?.[0] || 'unknown',
                language: req.headers['accept-language']?.split(',')[0] || 'en',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            location: {
                ipAddress: req.clientInfo.ip,
                country: req.clientInfo.geo?.country,
                city: req.clientInfo.geo?.city,
                region: req.clientInfo.geo?.region
            },
            referrer: req.clientInfo.referrer,
            visitedAt: new Date()
        });
        
        await visit.save();
        
        // Update user visit count if logged in
        if (req.user) {
            req.user.visitCount += 1;
            req.user.lastVisit = new Date();
            await req.user.save();
        }
        
        res.json({
            success: true,
            message: 'Visit tracked',
            sessionId: currentSessionId,
            isNewUser: !isReturning
        });
    } catch (error) {
        console.error('Visit tracking error:', error);
        res.status(500).json({ error: 'Failed to track visit' });
    }
});

// ============================================================================
// ADMIN DASHBOARD ENDPOINTS
// ============================================================================

// Get admin dashboard data (protected)
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        // Check admin password from query parameter
        const { password } = req.query;
        
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Get all data in parallel
        const [
            totalUsers,
            activeUsers,
            emailSubscriptions,
            totalVisits,
            eventClicks,
            popularEvents,
            recentVisits
        ] = await Promise.all([
            // Total users
            User.countDocuments(),
            
            // Active users (visited in last 30 days)
            User.countDocuments({ 
                lastVisit: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }),
            
            // Email subscriptions
            EmailSubscription.countDocuments({ isActive: true }),
            
            // Total visits
            Visit.countDocuments(),
            
            // Event clicks summary
            EventClick.aggregate([
                { $group: {
                    _id: '$eventId',
                    count: { $sum: 1 },
                    lastClicked: { $max: '$clickedAt' }
                }},
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]),
            
            // Popular events
            Event.find()
                .sort({ savedCount: -1 })
                .limit(10)
                .select('eventId title topic savedCount clickCount'),
                
            // Recent visits
            Visit.find()
                .sort({ visitedAt: -1 })
                .limit(20)
                .populate('userId', 'email')
                .select('visitedAt deviceInfo.browser location.country isNewUser')
        ]);
        
        // Calculate return rate
        const uniqueVisitors = await Visit.distinct('sessionId');
        const returningVisits = await Visit.countDocuments({ isReturning: true });
        const returnRate = totalVisits > 0 ? 
            Math.round((returningVisits / totalVisits) * 100) : 0;
        
        // Get daily stats for last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dailyStats = await Visit.aggregate([
            { $match: { visitedAt: { $gte: thirtyDaysAgo } } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
                visits: { $sum: 1 },
                newUsers: { $sum: { $cond: ['$isNewUser', 1, 0] } },
                returningUsers: { $sum: { $cond: ['$isReturning', 1, 0] } }
            }},
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            dashboard: {
                metrics: {
                    totalUsers,
                    activeUsers,
                    emailSubscriptions,
                    totalVisits,
                    uniqueVisitors: uniqueVisitors.length,
                    returnRate: `${returnRate}%`,
                    avgVisitsPerUser: totalUsers > 0 ? (totalVisits / totalUsers).toFixed(2) : 0
                },
                emailSubscriptions: await EmailSubscription.find({ isActive: true })
                    .sort({ subscribedAt: -1 })
                    .limit(100)
                    .select('email subscribedAt'),
                eventClicks,
                popularEvents,
                recentVisits,
                dailyStats,
                users: await User.find()
                    .sort({ lastVisit: -1 })
                    .limit(50)
                    .select('email savedEvents visitCount firstVisit lastVisit')
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Get user analytics
app.get('/api/admin/analytics', async (req, res) => {
    try {
        const { password } = req.query;
        
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Cohort analysis
        const cohorts = await User.aggregate([
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$firstVisit' } },
                totalUsers: { $sum: 1 },
                activeUsers: {
                    $sum: {
                        $cond: [
                            { $gte: ['$lastVisit', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                            1, 0
                        ]
                    }
                }
            }},
            { $sort: { _id: -1 } },
            { $limit: 30 }
        ]);
        
        // Device analytics
        const deviceStats = await Visit.aggregate([
            { $group: {
                _id: '$deviceInfo.browser',
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } }
        ]);
        
        // Geographic analytics
        const locationStats = await Visit.aggregate([
            { $match: { 'location.country': { $exists: true, $ne: null } } },
            { $group: {
                _id: '$location.country',
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        res.json({
            success: true,
            analytics: {
                cohorts,
                deviceStats,
                locationStats,
                hourlyStats: await getHourlyStats(),
                userRetention: await calculateRetention()
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

async function getHourlyStats() {
    return await Visit.aggregate([
        { $group: {
            _id: { $hour: '$visitedAt' },
            count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
    ]);
}

async function calculateRetention() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [d7Active, d30Active, totalUsers] = await Promise.all([
        User.countDocuments({ lastVisit: { $gte: sevenDaysAgo } }),
        User.countDocuments({ lastVisit: { $gte: thirtyDaysAgo } }),
        User.countDocuments()
    ]);
    
    return {
        d7Retention: totalUsers > 0 ? Math.round((d7Active / totalUsers) * 100) : 0,
        d30Retention: totalUsers > 0 ? Math.round((d30Active / totalUsers) * 100) : 0,
        d7Active,
        d30Active,
        totalUsers
    };
}

// ============================================================================
// DATA EXPORT
// ============================================================================

// Export all data (admin only)
app.get('/api/admin/export', async (req, res) => {
    try {
        const { password, format } = req.query;
        
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const exportData = {
            timestamp: new Date().toISOString(),
            users: await User.find().select('-__v').lean(),
            events: await Event.find().select('-__v').lean(),
            emailSubscriptions: await EmailSubscription.find().select('-__v').lean(),
            visits: await Visit.find().limit(1000).select('-__v').lean(),
            eventClicks: await EventClick.find().limit(1000).select('-__v').lean(),
            summary: {
                totalUsers: await User.countDocuments(),
                totalVisits: await Visit.countDocuments(),
                totalEmails: await EmailSubscription.countDocuments(),
                totalEventClicks: await EventClick.countDocuments()
            }
        };
        
        if (format === 'csv') {
            // Implement CSV export if needed
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=webibook-export.csv');
            // Convert to CSV (simplified)
            res.send(JSON.stringify(exportData));
        } else {
            res.json(exportData);
        }
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// ============================================================================
// INITIALIZE SAMPLE DATA
// ============================================================================

async function initializeSampleData() {
    try {
        // Check if events exist
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
    } catch (error) {
        console.error('Error initializing sample data:', error);
    }
}

// ============================================================================
// STATIC FILES AND ROUTING
// ============================================================================

// Serve static files from project root (not src folder)
app.use(express.static(path.join(__dirname, '..')));

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, async () => {
    console.log(`🚀 WebiBook MongoDB Server running on port ${PORT}`);
    console.log(`📊 Database: MongoDB Atlas`);
    console.log(`🔐 Admin: http://localhost:${PORT}?admin=${process.env.ADMIN_PASSWORD}`);
    console.log(`🌐 API: http://localhost:${PORT}/api/health`);
    
    // Initialize sample data
    await initializeSampleData();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('👋 Shutting down server...');
    await mongoose.connection.close();
    process.exit(0);
});
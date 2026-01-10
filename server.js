#!/usr/bin/env node
/**
 * WebiBook Analytics Backend Server - Multi-user System
 */
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

require('dotenv').config();

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
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined in .env file');
            return;
        }
        
        console.log('🔗 Connecting to MongoDB...');
        
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB Connected Successfully');
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
    }
};

connectDB();

// Simple in-memory storage as fallback
const memoryStorage = {
    users: new Map(), // Use Map for better user management
    events: [],
    emails: [],
    visits: [],
    eventClicks: new Map()
};

// Load models with fallback
let User, Event, EmailSubscription, Visit, EventClick;
try {
    User = require('./models/User');
    Event = require('./models/Event');
    EmailSubscription = require('./models/EventSubscription');
    Visit = require('./models/Visit');
    EventClick = require('./models/EventClick');
    console.log('✅ Models loaded');
} catch (error) {
    console.log('⚠️ Models not found, using memory storage');
}

// CORS Configuration - ALLOW ALL FOR NOW
app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
            timezone: geo.timezone
        } : null,
        referrer: req.headers.referer
    };
    next();
});

// ============================================================================
// AUTH HELPER FUNCTIONS
// ============================================================================

const generateToken = (userId, email) => {
    try {
        return jwt.sign(
            { userId, email },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '30d' }
        );
    } catch (error) {
        // Fallback token
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(`${userId}-${email}-${Date.now()}`).digest('hex');
    }
};

const verifyToken = (token) => {
    try {
        if (!token) return null;
        return jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    } catch (error) {
        return null;
    }
};

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

// Register/Login - MULTI-USER FIXED
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
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Try MongoDB
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
                        savedEvents: [],
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
                
                const token = generateToken(user._id.toString(), cleanEmail);
                
                return res.json({
                    success: true,
                    message: 'Registration successful!',
                    user: {
                        id: user._id,
                        email: user.email,
                        name: user.name,
                        savedEvents: user.savedEvents || [],
                        visitCount: user.visitCount || 1
                    },
                    token
                });
                
            } catch (dbError) {
                console.log('⚠️ MongoDB error, using memory:', dbError.message);
            }
        }
        
        // Memory storage
        let user = memoryStorage.users.get(cleanEmail);
        
        if (user) {
            // Existing user
            user.lastVisit = new Date();
            user.visitCount += 1;
        } else {
            // New user
            user = {
                id: userId,
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
                    country: req.clientInfo.geo?.country || 'unknown'
                },
                firstVisit: new Date(),
                lastVisit: new Date(),
                visitCount: 1,
                createdAt: new Date()
            };
            memoryStorage.users.set(cleanEmail, user);
        }
        
        const token = generateToken(userId, cleanEmail);
        
        res.json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                savedEvents: user.savedEvents || [],
                visitCount: user.visitCount
            },
            token
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Registration failed. Please try again.'
        });
    }
});

// Get user profile
app.get('/api/auth/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'No token' });
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        
        // MongoDB
        if (User && mongoose.connection.readyState === 1) {
            const user = await User.findById(decoded.userId);
            if (user) {
                return res.json({
                    success: true,
                    user: {
                        id: user._id,
                        email: user.email,
                        name: user.name,
                        savedEvents: user.savedEvents || [],
                        visitCount: user.visitCount
                    }
                });
            }
        }
        
        // Memory
        const user = Array.from(memoryStorage.users.values())
            .find(u => u.id === decoded.userId || u.email === decoded.email);
        
        if (user) {
            return res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    savedEvents: user.savedEvents || [],
                    visitCount: user.visitCount
                }
            });
        }
        
        res.status(404).json({ success: false, error: 'User not found' });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, error: 'Failed to get profile' });
    }
});

// Get events
app.get('/api/events', async (req, res) => {
    try {
        // MongoDB
        if (Event && mongoose.connection.readyState === 1) {
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
        }
        
        // Fallback
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

// Save event - PERMANENT SAVE
app.post('/api/events/save', async (req, res) => {
    try {
        const { eventId } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication required' 
            });
        }
        
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        
        // MongoDB
        if (User && mongoose.connection.readyState === 1) {
            const user = await User.findById(decoded.userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            // Check if already saved
            const alreadySaved = user.savedEvents.some(e => e.eventId === eventId);
            if (!alreadySaved) {
                user.savedEvents.push({
                    eventId,
                    savedAt: new Date()
                });
                await user.save();
            }
            
            return res.json({
                success: true,
                message: 'Event saved permanently',
                savedEvents: user.savedEvents
            });
        }
        
        // Memory storage
        const user = Array.from(memoryStorage.users.values())
            .find(u => u.id === decoded.userId || u.email === decoded.email);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Check if already saved
        const alreadySaved = user.savedEvents.includes(eventId);
        if (!alreadySaved) {
            user.savedEvents.push(eventId);
        }
        
        res.json({
            success: true,
            message: 'Event saved',
            savedEvents: user.savedEvents
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
        const { eventId } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!eventId) return res.status(400).json({ success: false, error: 'Event ID required' });
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        
        const decoded = verifyToken(token);
        if (!decoded) return res.status(401).json({ success: false, error: 'Invalid token' });
        
        // MongoDB
        if (User && mongoose.connection.readyState === 1) {
            const user = await User.findById(decoded.userId);
            if (!user) return res.status(404).json({ success: false, error: 'User not found' });
            
            user.savedEvents = user.savedEvents.filter(e => e.eventId !== eventId);
            await user.save();
            
            return res.json({
                success: true,
                message: 'Event unsaved',
                savedEvents: user.savedEvents
            });
        }
        
        // Memory
        const user = Array.from(memoryStorage.users.values())
            .find(u => u.id === decoded.userId || u.email === decoded.email);
        
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        user.savedEvents = user.savedEvents.filter(e => e !== eventId);
        
        res.json({
            success: true,
            message: 'Event unsaved',
            savedEvents: user.savedEvents
        });
        
    } catch (error) {
        console.error('Unsave error:', error);
        res.status(500).json({ success: false, error: 'Failed to unsave event' });
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
        
        // MongoDB
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
                console.log('⚠️ Email save failed:', dbError.message);
            }
        }
        
        // Memory
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
        console.error('Email error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to subscribe' 
        });
    }
});

// Track visit
app.post('/api/visits/track', async (req, res) => {
    try {
        const { isReturning, sessionId } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        let userId = null;
        let userEmail = null;
        
        if (token) {
            const decoded = verifyToken(token);
            if (decoded) {
                userId = decoded.userId;
                userEmail = decoded.email;
            }
        }
        
        const visitData = {
            userId,
            userEmail,
            sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isReturning: isReturning || false,
            visitedAt: new Date(),
            deviceInfo: {
                userAgent: req.clientInfo.userAgent,
                browser: req.clientInfo.userAgent?.match(/(chrome|firefox|safari|edge)/i)?.[0] || 'unknown'
            },
            location: {
                ipAddress: req.clientInfo.ip,
                country: req.clientInfo.geo?.country || 'unknown'
            }
        };
        
        // MongoDB
        if (Visit && mongoose.connection.readyState === 1) {
            try {
                const visit = new Visit(visitData);
                await visit.save();
            } catch (dbError) {
                console.log('⚠️ Visit save failed:', dbError.message);
            }
        }
        
        // Memory
        memoryStorage.visits.push(visitData);
        
        res.cookie('sessionId', visitData.sessionId, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true
        });
        
        res.json({
            success: true,
            message: 'Visit tracked',
            sessionId: visitData.sessionId
        });
        
    } catch (error) {
        console.error('Visit error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to track visit' 
        });
    }
});

// Track event click
// Track event click - UPDATED TO PROPERLY UPDATE EVENT COUNT
app.post('/api/events/click', async (req, res) => {
    try {
        const { eventId, eventTitle, eventTopic } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!eventId) {
            return res.status(400).json({ 
                success: false,
                error: 'Event ID is required' 
            });
        }
        
        let userId = null;
        let userEmail = null;
        
        if (token) {
            const decoded = verifyToken(token);
            if (decoded) {
                userId = decoded.userId;
                userEmail = decoded.email;
            }
        }
        
        const clickData = {
            eventId,
            eventTitle: eventTitle || eventId,
            eventTopic: eventTopic || 'unknown',
            userId,
            userEmail,
            clickedAt: new Date(),
            deviceInfo: {
                userAgent: req.clientInfo.userAgent || ''
            },
            location: {
                ipAddress: req.clientInfo.ip || 'unknown'
            }
        };
        
        // MongoDB - Save click AND update event count
        if (mongoose.connection.readyState === 1) {
            try {
                // 1. Save the click in EventClick collection
                if (EventClick) {
                    const eventClick = new EventClick(clickData);
                    await eventClick.save();
                }
                
                // 2. Update the event's click count - FIXED
                if (Event) {
                    await Event.findOneAndUpdate(
                        { eventId: eventId },
                        { 
                            $inc: { clickCount: 1 },
                            $set: { 
                                title: eventTitle || undefined,
                                topic: eventTopic || undefined
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
                
                console.log(`✅ Event click tracked and count updated for ${eventId}`);
                
            } catch (dbError) {
                console.error('⚠️ Event click save failed:', dbError.message);
            }
        }
        
        // Memory storage - Also update here
        if (!memoryStorage.eventClicks.has(eventId)) {
            memoryStorage.eventClicks.set(eventId, {
                eventId,
                eventTitle: eventTitle || eventId,
                eventTopic: eventTopic || 'unknown',
                count: 1,
                lastClicked: new Date()
            });
        } else {
            const existing = memoryStorage.eventClicks.get(eventId);
            existing.count += 1;
            existing.lastClicked = new Date();
        }
        
        res.json({
            success: true,
            message: 'Event click tracked and count updated'
        });
        
    } catch (error) {
        console.error('Click error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to track event click' 
        });
    }
});

// ============================================================================
// ADMIN DASHBOARD - FIXED
// ============================================================================

// Get admin dashboard data
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
            totalSavedEvents: 0,
            totalVisits: 0,
            returnRate: '0%',
            activeUsers: 0,
            uniqueVisitors: 0,
            avgVisitsPerUser: 0
        };
        
        let emailSubscriptions = [];
        let users = [];
        let eventClicks = [];
        let visits = [];
        
        // MongoDB data
        // In the admin dashboard route, update the event clicks aggregation:
if (EventClick && mongoose.connection.readyState === 1) {
    try {
        eventClicks = await EventClick.aggregate([
            { 
                $group: {
                    _id: '$eventId',
                    title: { $first: '$eventTitle' },
                    topic: { $first: '$eventTopic' },
                    count: { $sum: 1 },
                    lastClicked: { $max: '$clickedAt' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);
        
        // Also get events to show all event data
        if (Event) {
            const allEvents = await Event.find().lean();
            eventClicks = eventClicks.map(click => {
                const event = allEvents.find(e => e.eventId === click._id);
                return {
                    _id: click._id,
                    title: click.title || (event?.title || 'Unknown Event'),
                    topic: click.topic || (event?.topic || 'Unknown'),
                    count: click.count,
                    lastClicked: click.lastClicked,
                    savedCount: event?.savedCount || 0,
                    clickCount: event?.clickCount || 0
                };
            });
        }
    } catch (dbError) {
        console.log('⚠️ Event clicks aggregation failed:', dbError.message);
    }
}
        
        // Fallback to memory data
        if (metrics.totalUsers === 0) {
            metrics.emailSubscriptions = memoryStorage.emails.length;
            metrics.totalUsers = memoryStorage.users.size;
            metrics.totalVisits = memoryStorage.visits.length;
            
            // Calculate saved events from memory
            metrics.totalSavedEvents = Array.from(memoryStorage.users.values())
                .reduce((total, user) => total + (user.savedEvents?.length || 0), 0);
            
            // Memory email subscriptions
            emailSubscriptions = memoryStorage.emails.map(e => ({
                email: e.email,
                subscribedAt: e.subscribedAt
            }));
            
            // Memory users
            users = Array.from(memoryStorage.users.values()).map(user => ({
                email: user.email,
                savedEvents: user.savedEvents,
                visitCount: user.visitCount,
                firstVisit: user.firstVisit,
                lastVisit: user.lastVisit
            }));
            
            // Memory event clicks
            eventClicks = Array.from(memoryStorage.eventClicks.values()).map(click => ({
                _id: click.eventId,
                title: click.eventTitle,
                topic: 'unknown',
                count: click.count,
                lastClicked: click.lastClicked
            }));
            
            // Memory visits
            visits = memoryStorage.visits.slice(-20).map(visit => ({
                visitedAt: visit.visitedAt,
                deviceInfo: visit.deviceInfo,
                location: visit.location,
                isReturning: visit.isReturning
            }));
        }
        
        // Calculate active users (visited in last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        metrics.activeUsers = users.filter(user => 
            new Date(user.lastVisit) >= sevenDaysAgo
        ).length;
        
        // Calculate average visits per user
        metrics.avgVisitsPerUser = metrics.totalUsers > 0 
            ? (metrics.totalVisits / metrics.totalUsers).toFixed(2) 
            : 0;
        
        res.json({
            success: true,
            dashboard: {
                metrics,
                emailSubscriptions,
                users,
                eventClicks,
                visits,
                dailyStats: [] // Simplified for now
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

// Export all data
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
            savedEvents: {},
            visitStats: {
                firstVisits: memoryStorage.visits.filter(v => !v.isReturning).length,
                returnVisits: memoryStorage.visits.filter(v => v.isReturning).length,
                totalVisits: memoryStorage.visits.length,
                lastVisit: memoryStorage.visits.length > 0 
                    ? memoryStorage.visits[memoryStorage.visits.length - 1].visitedAt 
                    : null
            },
            eventClicks: Array.from(memoryStorage.eventClicks.values()),
            lastUpdated: new Date().toISOString()
        };
        
        // Add saved events from memory
        memoryStorage.users.forEach(user => {
            if (user.savedEvents && user.savedEvents.length > 0) {
                exportData.savedEvents[user.email] = user.savedEvents;
            }
        });
        
        // Try to get MongoDB data
        if (mongoose.connection.readyState === 1) {
            try {
                if (EmailSubscription) {
                    const emails = await EmailSubscription.find({ isActive: true }).lean();
                    exportData.weeklyEmails = emails.map(e => e.email);
                }
                
                if (User) {
                    const users = await User.find().lean();
                    users.forEach(user => {
                        if (user.savedEvents && user.savedEvents.length > 0) {
                            exportData.savedEvents[user.email] = user.savedEvents.map(se => se.eventId);
                        }
                    });
                }
                
                if (Visit) {
                    const visits = await Visit.find().sort({ visitedAt: -1 }).lean();
                    exportData.visitStats.totalVisits = visits.length;
                    exportData.visitStats.returnVisits = visits.filter(v => v.isReturning).length;
                    exportData.visitStats.firstVisits = visits.filter(v => !v.isReturning).length;
                    exportData.visitStats.lastVisit = visits.length > 0 ? visits[0].visitedAt : null;
                }
                
                if (EventClick) {
                    const clicks = await EventClick.find().lean();
                    exportData.eventClicks = clicks;
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
    console.log(`🔐 Admin Password: ${process.env.ADMIN_PASSWORD}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
    
    // Initialize sample data
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
                        description: 'Learn the fundamentals of React Hooks',
                        savedCount: 0,
                        clickCount: 0
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
                        description: 'Introduction to data science concepts',
                        savedCount: 0,
                        clickCount: 0
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
                        description: 'Workshop on modern product design principles',
                        savedCount: 0,
                        clickCount: 0
                    }
                ];
                
                await Event.insertMany(sampleEvents);
                console.log('✅ Sample events added to database');
            }
        }
    } catch (error) {
        console.error('Error initializing sample data:', error);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('👋 Shutting down server...');
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
    }
    process.exit(0);
});
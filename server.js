#!/usr/bin/env node
/**
 * WebiBook Analytics Backend Server
 * Collects and aggregates data from all users across devices
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'webiBook-data.json');

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json());

// Initialize data file if it doesn't exist
async function initializeDataFile() {
    try {
        await fs.access(DATA_FILE);
        // File exists - check if it needs migration
        const existingData = await readData();
        
        // Migrate old data structure to new one
        if (!existingData.userSessions) {
            existingData.userSessions = {};
        }
        if (!existingData.visitStats) {
            existingData.visitStats = {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                uniqueUsers: 0,
                lastVisit: null
            };
        } else {
            // Ensure new fields exist
            existingData.visitStats.uniqueUsers = existingData.visitStats.uniqueUsers || 0;
        }
        
        // If we have old visit data but no user sessions, estimate unique users
        if (existingData.visitStats.totalVisits > 0 && existingData.visitStats.uniqueUsers === 0) {
            // Rough estimate: assume 30% of visits are unique users (adjust based on your data)
            existingData.visitStats.uniqueUsers = Math.max(1, Math.round(existingData.visitStats.totalVisits * 0.3));
        }
        
        await writeData(existingData);
        console.log('✅ Data file migrated to new structure');
        
    } catch (error) {
        // File doesn't exist, create it with new structure
        const initialData = {
            weeklyEmails: [],
            savedEvents: {},
            visitStats: {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                uniqueUsers: 0,
                lastVisit: null
            },
            userSessions: {},
            eventClicks: {},
            lastUpdated: new Date().toISOString()
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ Created initial data file with user tracking');
    }
}

// Read data from file
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Backward compatibility - add missing fields
        if (!parsedData.userSessions) parsedData.userSessions = {};
        if (!parsedData.visitStats) {
            parsedData.visitStats = {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                uniqueUsers: 0,
                lastVisit: null
            };
        } else {
            // Ensure all fields exist
            parsedData.visitStats.firstVisits = parsedData.visitStats.firstVisits || 0;
            parsedData.visitStats.returnVisits = parsedData.visitStats.returnVisits || 0;
            parsedData.visitStats.totalVisits = parsedData.visitStats.totalVisits || 0;
            parsedData.visitStats.uniqueUsers = parsedData.visitStats.uniqueUsers || 0;
            parsedData.visitStats.lastVisit = parsedData.visitStats.lastVisit || null;
        }
        
        return parsedData;
    } catch (error) {
        console.error('Error reading data file:', error);
        return {
            weeklyEmails: [],
            savedEvents: {},
            visitStats: {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                uniqueUsers: 0,
                lastVisit: null
            },
            userSessions: {},
            eventClicks: {},
            lastUpdated: new Date().toISOString()
        };
    }
}

// Write data to file
async function writeData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing data file:', error);
        return false;
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all aggregated data (for admin dashboard)
app.get('/api/data', async (req, res) => {
    try {
        const data = await readData();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Submit weekly reminder email
app.post('/api/emails', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Invalid email address' });
        }
        
        const data = await readData();
        
        // Check if email already exists (supporting both string and object)
        const emailExists = data.weeklyEmails.some(entry => {
            if (typeof entry === 'string') {
                return entry === email;
            } else {
                return entry.email === email;
            }
        });
        
        // Add email if not already present
        if (!emailExists) {
            data.weeklyEmails.push({
                email: email,
                timestamp: new Date().toISOString()
            });
            await writeData(data);
        }
        
        res.json({ success: true, message: 'Email saved' });
    } catch (error) {
        console.error('Error saving email:', error);
        res.status(500).json({ error: 'Failed to save email' });
    }
});

// Save event for a user
app.post('/api/events/save', async (req, res) => {
    try {
        const { email, eventId } = req.body;
        
        if (!email || !eventId) {
            return res.status(400).json({ error: 'Email and eventId are required' });
        }
        
        const data = await readData();
        
        // Initialize user's saved events array if needed
        if (!data.savedEvents[email]) {
            data.savedEvents[email] = [];
        }
        
        // Add event if not already saved
        if (!data.savedEvents[email].includes(eventId)) {
            data.savedEvents[email].push(eventId);
            await writeData(data);
        }
        
        res.json({ success: true, message: 'Event saved' });
    } catch (error) {
        console.error('Error saving event:', error);
        res.status(500).json({ error: 'Failed to save event' });
    }
});

// Unsave event for a user
app.post('/api/events/unsave', async (req, res) => {
    try {
        const { email, eventId } = req.body;
        
        if (!email || !eventId) {
            return res.status(400).json({ error: 'Email and eventId are required' });
        }
        
        const data = await readData();
        
        if (data.savedEvents[email]) {
            data.savedEvents[email] = data.savedEvents[email].filter(id => id !== eventId);
            await writeData(data);
        }
        
        res.json({ success: true, message: 'Event unsaved' });
    } catch (error) {
        console.error('Error unsaving event:', error);
        res.status(500).json({ error: 'Failed to unsave event' });
    }
});

// Track event clicks
app.post('/api/events/click', async (req, res) => {
    try {
        const { eventId, eventTitle, eventTopic } = req.body;
        
        if (!eventId) {
            return res.status(400).json({ error: 'eventId is required' });
        }
        
        const data = await readData();
        
        if (!data.eventClicks) {
            data.eventClicks = {};
        }
        
        if (!data.eventClicks[eventId]) {
            data.eventClicks[eventId] = {
                id: eventId,
                title: eventTitle || eventId,
                topic: eventTopic || 'unknown',
                count: 0,
                lastClicked: null
            };
        }
        
        data.eventClicks[eventId].count += 1;
        data.eventClicks[eventId].lastClicked = new Date().toISOString();
        
        await writeData(data);
        
        res.json({ success: true, message: 'Event click tracked' });
    } catch (error) {
        console.error('Error tracking event click:', error);
        res.status(500).json({ error: 'Failed to track event click' });
    }
});

// Track visit statistics
app.post('/api/visits', async (req, res) => {
    try {
        const { userId, isNewUser } = req.body;
        const data = await readData();
        
        // Initialize structures if needed
        if (!data.visitStats) {
            data.visitStats = {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0,
                uniqueUsers: 0,
                lastVisit: null
            };
        }
        
        if (!data.userSessions) {
            data.userSessions = {};
        }
        
        // Generate or retrieve user ID
        let currentUserId = userId;
        if (!currentUserId) {
            currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // Track unique user
        let isFirstVisit = false;
        if (isNewUser && !data.userSessions[currentUserId]) {
            data.userSessions[currentUserId] = {
                firstVisit: new Date().toISOString(),
                visits: 0,
                lastVisit: null
            };
            data.visitStats.uniqueUsers = Object.keys(data.userSessions).length;
            isFirstVisit = true;
        }
        
        // Update user session
        if (data.userSessions[currentUserId]) {
            data.userSessions[currentUserId].visits += 1;
            data.userSessions[currentUserId].lastVisit = new Date().toISOString();
        } else {
            // User exists but wasn't in sessions (migration case)
            data.userSessions[currentUserId] = {
                firstVisit: new Date().toISOString(),
                visits: 1,
                lastVisit: new Date().toISOString()
            };
            data.visitStats.uniqueUsers = Object.keys(data.userSessions).length;
        }
        
        // Update aggregate stats correctly
        if (isFirstVisit) {
            data.visitStats.firstVisits += 1;
        } else {
            data.visitStats.returnVisits += 1;
        }
        
        data.visitStats.totalVisits += 1;
        data.visitStats.lastVisit = new Date().toISOString();
        
        await writeData(data);
        
        res.json({ 
            success: true, 
            message: 'Visit tracked',
            userId: currentUserId,
            isFirstVisit: isFirstVisit
        });
    } catch (error) {
        console.error('Error tracking visit:', error);
        res.status(500).json({ error: 'Failed to track visit' });
    }
});

// Get user retention analytics
app.get('/api/analytics/retention', async (req, res) => {
    try {
        const data = await readData();
        
        const userSessions = data.userSessions || {};
        const users = Object.values(userSessions);
        
        // Calculate retention metrics
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        
        // Active users
        const dailyActive = users.filter(user => 
            user.lastVisit && new Date(user.lastVisit) > oneDayAgo
        ).length;
        
        const weeklyActive = users.filter(user => 
            user.lastVisit && new Date(user.lastVisit) > sevenDaysAgo
        ).length;
        
        const monthlyActive = users.filter(user => 
            user.lastVisit && new Date(user.lastVisit) > thirtyDaysAgo
        ).length;
        
        // Retention cohorts
        const cohorts = {};
        users.forEach(user => {
            const firstVisitDate = new Date(user.firstVisit).toISOString().split('T')[0];
            if (!cohorts[firstVisitDate]) {
                cohorts[firstVisitDate] = {
                    date: firstVisitDate,
                    totalUsers: 0,
                    returnedDay1: 0,
                    returnedDay7: 0,
                    returnedDay30: 0
                };
            }
            cohorts[firstVisitDate].totalUsers += 1;
            
            // Check if returned within timeframes
            const daysSinceFirst = Math.floor((now - new Date(user.firstVisit)) / (1000 * 60 * 60 * 24));
            const returnedLater = user.visits > 1;
            
            if (returnedLater && daysSinceFirst >= 1) cohorts[firstVisitDate].returnedDay1 += 1;
            if (returnedLater && daysSinceFirst >= 7) cohorts[firstVisitDate].returnedDay7 += 1;
            if (returnedLater && daysSinceFirst >= 30) cohorts[firstVisitDate].returnedDay30 += 1;
        });
        
        res.json({
            success: true,
            metrics: {
                totalUniqueUsers: users.length,
                dailyActiveUsers: dailyActive,
                weeklyActiveUsers: weeklyActive,
                monthlyActiveUsers: monthlyActive,
                totalVisits: data.visitStats.totalVisits || 0,
                averageVisitsPerUser: users.length > 0 ? (data.visitStats.totalVisits / users.length).toFixed(2) : 0,
                returnRate: users.length > 0 ? 
                    ((users.filter(u => u.visits > 1).length / users.length) * 100).toFixed(1) + '%' : '0%'
            },
            cohorts: Object.values(cohorts).slice(-10).reverse(), // Last 10 cohorts, newest first
            userSessions: userSessions
        });
    } catch (error) {
        console.error('Error getting retention analytics:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

// Serve static files (for both development and production)
// IMPORTANT: This must come AFTER all API routes
app.use(express.static(path.join(__dirname)));

// Serve index.html for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
async function startServer() {
    await initializeDataFile();
    
    const server = app.listen(PORT, () => {
        console.log(`🚀 WebiBook Analytics Server running on port ${PORT}`);
        console.log(`📊 Data file: ${DATA_FILE}`);
        console.log(`🌐 API endpoint: http://localhost:${PORT}/api/data`);
        console.log(`📱 Frontend: http://localhost:${PORT}`);
        console.log(`🔐 Admin: http://localhost:${PORT}?admin=webiBook2024`);
    });
    
    // Handle port already in use error
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${PORT} is already in use!`);
            console.log(`\n💡 Try one of these solutions:`);
            console.log(`   1. Kill the process: lsof -ti:${PORT} | xargs kill -9`);
            console.log(`   2. Use a different port: PORT=3001 npm run dev`);
            console.log(`   3. Find what's using it: lsof -i:${PORT}\n`);
            process.exit(1);
        } else {
            throw err;
        }
    });
}

startServer().catch(console.error);
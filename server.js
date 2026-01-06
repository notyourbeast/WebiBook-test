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
    } catch (error) {
        // File doesn't exist, create it with empty structure
        const initialData = {
            weeklyEmails: [],
            savedEvents: {},
            visitStats: {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0
            },
            eventClicks: {},
            lastUpdated: new Date().toISOString()
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ Created initial data file');
    }
}

// Read data from file
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data file:', error);
        return {
            weeklyEmails: [],
            savedEvents: {},
            visitStats: {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0
            },
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
        
        // Add email if not already present
        if (!data.weeklyEmails.includes(email)) {
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
        const { isReturning, visitCount, daysSince } = req.body;
        const data = await readData();
        
        // Initialize visit stats if needed
        if (!data.visitStats) {
            data.visitStats = {
                firstVisits: 0,
                returnVisits: 0,
                totalVisits: 0
            };
        }
        
        // Track visit
        const now = new Date().toISOString();
        if (!isReturning) {
            // First visit
            data.visitStats.firstVisits = (data.visitStats.firstVisits || 0) + 1;
        } else {
            // Return visit
            data.visitStats.returnVisits = (data.visitStats.returnVisits || 0) + 1;
        }
        
        data.visitStats.totalVisits = (data.visitStats.totalVisits || 0) + 1;
        data.visitStats.lastVisit = now;
        
        await writeData(data);
        
        res.json({ success: true, message: 'Visit tracked' });
    } catch (error) {
        console.error('Error tracking visit:', error);
        res.status(500).json({ error: 'Failed to track visit' });
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


// models/User.js - FIXED VERSION
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: ''
    },
    savedEvents: [{
        eventId: String,
        savedAt: { type: Date, default: Date.now }
    }],
    deviceInfo: {
        userAgent: { type: String, default: '' },
        browser: { type: String, default: '' },
        os: { type: String, default: '' },
        timezone: { type: String, default: '' }
    },
    location: {
        ipAddress: { type: String, default: '' },
        country: { type: String, default: '' },
        city: { type: String, default: '' }
    },
    visitCount: {
        type: Number,
        default: 0
    },
    lastVisit: {
        type: Date,
        default: Date.now
    },
    firstVisit: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// FIX 1: Remove or fix the pre-save hook - OPTION A (remove it)
// Simply remove these lines entirely:
// userSchema.pre('save', function(next) {
//     this.updatedAt = Date.now();
//     next();
// });

// FIX 2: Or use async version - OPTION B (update it)
userSchema.pre('save', async function(next) {
    try {
        this.updatedAt = Date.now();
        next();
    } catch (error) {
        next(error);
    }
});

// FIX 3: Or remove the hook entirely and handle it differently - OPTION C
// Comment out the entire pre-save hook and let Mongoose handle timestamps

module.exports = mongoose.model('User', userSchema);
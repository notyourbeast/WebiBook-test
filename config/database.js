// config/database.js - SIMPLIFIED
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.log('⚠️  MONGODB_URI not found, using memory storage');
            return;
        }
        
        console.log('🔗 Attempting MongoDB connection...');
        
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        });
        
        console.log('✅ MongoDB Connected Successfully');
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('⚠️  Using memory storage instead');
        // Don't exit process, use memory storage
    }
};

module.exports = connectDB;
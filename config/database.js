const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            console.error('❌ MONGODB_URI is not defined in .env file');
            console.log('⚠️  Using in-memory database for development');
            return;
        }
        
        console.log('🔗 Connecting to MongoDB...');
        
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB Connected Successfully');
        
        // Connection event listeners
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected');
        });
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.log('⚠️  Server will continue without database connection');
        // Don't exit process for development
    }
};

module.exports = connectDB;
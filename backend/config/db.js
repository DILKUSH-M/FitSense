const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitsense';

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected.');
  } catch (error) {
    console.error('MongoDB connection failed:', error.name);
    throw error;
  }
}

module.exports = connectDB;

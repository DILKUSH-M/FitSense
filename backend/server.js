require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const workoutRoutes = require('./routes/workoutRoutes');
const activityRoutes = require('./routes/activityRoutes');
const nutritionRoutes = require('./routes/nutritionRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const privacyRoutes = require('./routes/privacyRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const trackingRoutes = require('./routes/trackingRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const clientBuildPath = path.resolve(__dirname, '..', 'frontend', 'dist');
const frontendIndexPath = path.join(clientBuildPath, 'index.html');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is unset; using a temporary development secret for this process.');
}

if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be configured in production.');
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com'],
      'script-src': ["'self'", "'wasm-unsafe-eval'"],
    },
  },
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    ok: databaseConnected,
    database: databaseConnected ? 'connected' : 'disconnected',
    message: databaseConnected ? 'FitSense API is ready.' : 'MongoDB is not connected.',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/tracking', trackingRoutes);

app.use(express.static(clientBuildPath, { index: false }));
app.use((req, res, next) => {
  const shouldServeFrontend = (
    req.method === 'GET'
    && req.path !== '/api'
    && !req.path.startsWith('/api/')
    && path.extname(req.path) === ''
    && fs.existsSync(frontendIndexPath)
  );
  if (!shouldServeFrontend) {
    return next();
  }

  return res.sendFile('index.html', { root: clientBuildPath }, (error) => {
    if (error) {
      return next(error);
    }
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'FitSense API',
    status: 'running',
    health: '/api/health',
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;
  if (statusCode >= 500) {
    console.error(error.stack || error);
  }
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message || 'Internal server error',
  });
});

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`FitSense API listening on port ${PORT}.`);
    });
  } catch (error) {
    console.error('FitSense API startup failed because MongoDB is unavailable:', error.name);
    process.exitCode = 1;
  }
})();

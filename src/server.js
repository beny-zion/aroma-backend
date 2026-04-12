require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { protect } = require('./middleware/auth');

// Import routes
const {
  customerRoutes,
  branchRoutes,
  deviceRoutes,
  serviceLogRoutes,
  scentRoutes,
  adminRoutes,
  deviceTypeRoutes,
  authRoutes,
  userRoutes,
  workOrderRoutes
} = require('./routes');

const app = express();

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map(o => o.trim());

    // Allow requests with no origin (mobile apps, curl, health checks)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging - morgan
app.use(morgan(':method :url :status :response-time ms'));

// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/users', userRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/customers', protect, customerRoutes);
app.use('/api/branches', protect, branchRoutes);
app.use('/api/devices', protect, deviceRoutes);
app.use('/api/service-logs', protect, serviceLogRoutes);
app.use('/api/scents', protect, scentRoutes);
app.use('/api/admin', protect, adminRoutes);
app.use('/api/device-types', protect, deviceTypeRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Aroma Plus API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'שגיאת שרת פנימית',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

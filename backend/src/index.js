'use strict';

// Load and validate environment variables first
const { PORT } = require('./config/env');
const connectDB = require('./config/db');

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const sitesRoutes = require('./routes/sites.routes');
const historyRoutes = require('./routes/history.routes');
const logsRoutes = require('./routes/logs.routes');
const seoRoutes = require('./routes/seo.routes');
const chatRoutes = require('./routes/chat.routes');
const errorMiddleware = require('./middleware/error.middleware');

const seoBot = require('./seo-bot/index');

const app = express();

// Global middleware
app.use(cors());

// API logger
app.use((req, res, next) => {
  console.log(`[API] → ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());

// Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/sites', sitesRoutes);
app.use('/v1/history', historyRoutes);
app.use('/v1/logs', logsRoutes);
app.use('/v1/seo', seoRoutes);
app.use('/v1/chat', chatRoutes);

// Global error handler (must be last)
app.use(errorMiddleware);

// Connect to DB, start server, then start SEO bot
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  seoBot.start();
});

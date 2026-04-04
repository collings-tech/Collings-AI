'use strict';

const ErrorLog = require('../models/ErrorLog');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  console.error('Unhandled error:', err);

  // Persist to DB (best-effort — never block the response)
  ErrorLog.create({
    userId: req.user?.id || null,
    source: 'server',
    message: err.message || 'Internal Server Error',
    stack: err.stack || null,
    context: { method: req.method, url: req.originalUrl },
  }).catch(() => {});

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({ error: message });
}

module.exports = errorMiddleware;

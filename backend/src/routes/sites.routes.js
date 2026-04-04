'use strict';

const { Router } = require('express');
const sitesController = require('../controllers/sites.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();

// All sites routes require authentication
router.use(authMiddleware);

// GET /v1/sites
router.get('/', sitesController.getAll);

// POST /v1/sites
router.post('/', sitesController.add);

// PUT /v1/sites/:id
router.put('/:id', sitesController.update);

// DELETE /v1/sites/:id
router.delete('/:id', sitesController.delete);

module.exports = router;

const express = require('express');
const multer = require('multer');
const { authenticate, requireActive, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/async-handler');
const { requireObjectBody } = require('../middleware/require-object-body');
const profile = require('../controllers/profile-controller');
const catalog = require('../controllers/catalog-controller');
const history = require('../controllers/history-controller');
const uploads = require('../controllers/upload-controller');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

router.use(asyncHandler(authenticate));
router.get('/me', asyncHandler(profile.getProfile));
router.use(requireActive);
router.get('/bootstrap', asyncHandler(catalog.listBootstrap));
router.get('/counters/:dni', asyncHandler(catalog.getCounter));
router.post('/files', upload.single('file'), asyncHandler(uploads.uploadFile));

router.put('/catalogs/:collectionName/:id', requireAdmin, requireObjectBody, asyncHandler(catalog.saveCatalog));
router.patch('/catalogs/:collectionName/:id', requireAdmin, requireObjectBody, asyncHandler(catalog.saveCatalog));
router.delete('/catalogs/:collectionName/:id', requireAdmin, asyncHandler(catalog.removeCatalog));
router.post('/catalogs/partidasContables/batch', requireAdmin, requireObjectBody, asyncHandler(catalog.importPartidas));
router.patch('/users/:id', requireObjectBody, asyncHandler(history.updateUser));
router.post('/planillas', requireObjectBody, asyncHandler(history.createPlanilla));
router.patch('/history-group/:key', requireObjectBody, asyncHandler(history.updateHistoryGroup));
router.patch('/history/:id', requireObjectBody, asyncHandler(history.updateHistory));
router.delete('/history/:id', asyncHandler(history.deleteHistory));

module.exports = router;

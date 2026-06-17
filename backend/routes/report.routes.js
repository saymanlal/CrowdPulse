/**
 * report.routes.js — CrowdPulse Report Routes  (Phase 7 + Phase 8)
 *
 * POST /api/report/process — AI + IPFS pipeline  (Phase 7)
 * POST /api/report/create  — AI + IPFS + Blockchain  (Phase 8)
 */

import { Router } from 'express';
import multer      from 'multer';
import {
  processReportController,
  createReportController,
} from '../controllers/report.controller.js';

const router = Router();

// ─── Multer (in-memory, 10 MB, images only) ───────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files:    1,
  },
  fileFilter(_req, file, cb) {
    if (/^image\//i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type "${file.mimetype}". Only images are accepted.`));
    }
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/report/process                                         (Phase 7)
 * Gemini Vision + IPFS — no blockchain write.
 *
 * curl -X POST http://localhost:3001/api/report/process \
 *      -F "image=@pothole.jpg"
 */
router.post('/process', upload.single('image'), processReportController);

/**
 * POST /api/report/create                                          (Phase 8)
 * Full pipeline: Gemini Vision → Pinata IPFS → ReportRegistry on SAYMAN.
 *
 * curl -X POST http://localhost:3001/api/report/create \
 *      -F "image=@pothole.jpg" \
 *      -F "location=MG Road, Bangalore" \
 *      -F "reporter=<wallet_address>"
 */
router.post('/create', upload.single('image'), createReportController);

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 10 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  _next();
});

export default router;

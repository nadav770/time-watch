import { Router } from 'express';
import { requireRole } from '../middleware/auth';

const router = Router();

router.use(requireRole('admin'));

// GET    /api/month-locks
// POST   /api/month-locks
// DELETE /api/month-locks/:id

export default router;

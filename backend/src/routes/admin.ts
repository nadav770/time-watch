import { Router } from 'express';
import { requireRole } from '../middleware/auth';

const router = Router();

router.use(requireRole('admin'));

// Admin-specific routes (user-task assignments, audit log)

export default router;

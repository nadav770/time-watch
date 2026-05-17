import { Router, Request, Response } from 'express';
import { findActiveTimer, createTimer, deleteTimer } from '../repositories/timerRepository';

const router = Router();

// Resolves the authenticated user's id from the JWT-populated req.user. Returns null when missing.
function getUserId(req: Request): number | string | null {
  return req.user && req.user.id ? req.user.id : null
}

/**
 * @swagger
 * /api/timer/status:
 *   get:
 *     summary: Get active timer status
 *     tags: [Timer]
 *     responses:
 *       200:
 *         description: Active timer or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timer:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/TimerState'
 *                     - type: object
 *                       nullable: true
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ message: 'Authentication required' })
    const timer = await findActiveTimer(userId as number)
    res.json({ timer: timer ?? null })
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/timer/start:
 *   post:
 *     summary: Start a new timer
 *     tags: [Timer]
 *     responses:
 *       201:
 *         description: Timer started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timer:
 *                   $ref: '#/components/schemas/TimerState'
 *       409:
 *         description: Timer already active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ message: 'Authentication required' })
    const existing = await findActiveTimer(userId as number)
    if (existing) {
      return res.status(409).json({ message: 'Timer already active' })
    }
    const timer = await createTimer(userId as number)
    return res.status(201).json({ timer })
  } catch (err: any) {
    console.error('[POST /start] error:', err.message)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/timer/stop:
 *   post:
 *     summary: Stop the active timer and return its start_time so the frontend can open the report form
 *     tags: [Timer]
 *     responses:
 *       200:
 *         description: Timer stopped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 start_time:
 *                   type: string
 *                   format: date-time
 *                 date:
 *                   type: string
 *                   format: date
 *       404:
 *         description: No active timer
 */
// Clears the active timer and returns its start_time and date so the frontend can open the report form.
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ message: 'Authentication required' })

    const timer = await findActiveTimer(userId as number)
    if (!timer) {
      return res.status(404).json({ message: 'No active timer' })
    }

    await deleteTimer(userId as number)

    return res.status(200).json({ start_time: timer.start_time, date: timer.date })
  } catch (err: any) {
    console.error('[POST /stop] error:', err.message)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router;

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import db from '../db/knex';

const router = Router();

router.use(requireRole('admin'));

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Clients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Pass "true" to return active clients only
 *     responses:
 *       200:
 *         description: List of clients
 */
// Returns all clients; pass ?active=true to filter by is_active = true only
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = db('clients')
      .select('id', 'name', 'contact', 'is_active', 'created_at')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')

    if (req.query.active === 'true') {
      query.where('is_active', true)
    }

    const clients = await query
    res.json(clients)
  } catch (err) {
    console.error('GET /api/clients error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               contact:
 *                 type: string
 *     responses:
 *       201:
 *         description: Client created
 *       400:
 *         description: Name is required
 */
// Creates a new client with is_active = true; name is required
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, contact } = req.body as { name?: string; contact?: string }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' })
    }

    const [client] = await db('clients')
      .insert({
        name: name.trim(),
        contact: contact || null,
        is_active: true,
      })
      .returning(['id', 'name', 'contact', 'is_active', 'created_at'])

    res.status(201).json(client)
  } catch (err) {
    console.error('POST /api/clients error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update a client
 *     tags: [Clients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contact:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Client updated
 *       404:
 *         description: Client not found
 */
// Updates an existing client's name, contact, and/or is_active by id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, contact, is_active } = req.body as { name?: string; contact?: string; is_active?: boolean }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (contact !== undefined) updates.contact = contact
    if (is_active !== undefined) updates.is_active = is_active

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'At least one field must be provided' })
    }

    updates.updated_at = db.fn.now()

    const [client] = await db('clients')
      .where({ id })
      .whereNull('deleted_at')
      .update(updates)
      .returning(['id', 'name', 'contact', 'is_active', 'created_at'])

    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    res.json(client)
  } catch (err) {
    console.error('PUT /api/clients/:id error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router;

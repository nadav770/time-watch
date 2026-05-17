import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import db from '../db/knex';

const router = Router();

router.use(requireRole('admin'));

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     tags: [Projects]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: integer
 *         description: Filter projects by client id
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Pass "true" to return active projects only
 *     responses:
 *       200:
 *         description: List of projects joined with client name
 */
// Returns all non-deleted projects joined with client name; supports ?client_id and ?active filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = db('projects')
      .join('clients', 'projects.client_id', 'clients.id')
      .select(
        'projects.id',
        'projects.name',
        'projects.client_id',
        'clients.name as client_name',
        'projects.is_active',
        'projects.created_at'
      )
      .whereNull('projects.deleted_at')
      .orderBy('projects.created_at', 'desc')

    if (req.query.client_id) {
      query.where('projects.client_id', req.query.client_id)
    }

    if (req.query.active === 'true') {
      query.where('projects.is_active', true)
    }

    const projects = await query
    res.json(projects)
  } catch (err) {
    console.error('GET /api/projects error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, client_id]
 *             properties:
 *               name:
 *                 type: string
 *               client_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Project created
 *       400:
 *         description: Validation error
 */
// Creates a new project; validates name and client_id before inserting
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, client_id } = req.body as { name?: string; client_id?: number }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' })
    }

    if (!client_id) {
      return res.status(400).json({ message: 'Client is required' })
    }

    const client = await db('clients')
      .where({ id: client_id, is_active: true })
      .whereNull('deleted_at')
      .first()

    if (!client) {
      return res.status(400).json({ message: 'Invalid client' })
    }

    const [project] = await db('projects')
      .insert({
        name: name.trim(),
        client_id,
        is_active: true,
      })
      .returning(['id', 'name', 'client_id', 'is_active', 'created_at'])

    res.status(201).json({ ...project, client_name: client.name })
  } catch (err) {
    console.error('POST /api/projects error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
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
 *               client_id:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Project updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Project not found
 */
// Updates an existing project's name, client_id, and/or is_active by id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, client_id, is_active } = req.body as { name?: string; client_id?: number; is_active?: boolean }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (client_id !== undefined) updates.client_id = client_id
    if (is_active !== undefined) updates.is_active = is_active

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'At least one field must be provided' })
    }

    if (client_id !== undefined) {
      const client = await db('clients')
        .where({ id: client_id, is_active: true })
        .whereNull('deleted_at')
        .first()

      if (!client) {
        return res.status(400).json({ message: 'Invalid client' })
      }
    }

    updates.updated_at = db.fn.now()

    const [project] = await db('projects')
      .where({ id })
      .whereNull('deleted_at')
      .update(updates)
      .returning(['id', 'name', 'client_id', 'is_active', 'created_at'])

    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    const client = await db('clients')
      .where({ id: project.client_id })
      .select('name')
      .first()

    res.json({ ...project, client_name: client ? client.name : null })
  } catch (err) {
    console.error('PUT /api/projects/:id error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router;

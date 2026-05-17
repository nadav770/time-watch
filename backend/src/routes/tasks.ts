import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import db from '../db/knex';

const router = Router();

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: integer
 *         description: Filter tasks by project id
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed]
 *         description: Filter tasks by status
 *     responses:
 *       200:
 *         description: List of tasks joined with project name and client name
 */
router.get('/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const tasks = await db('user_tasks')
      .join('tasks', 'user_tasks.task_id', 'tasks.id')
      .join('projects', 'tasks.project_id', 'projects.id')
      .join('clients', 'projects.client_id', 'clients.id')
      .select(
        'tasks.id as task_id',
        'tasks.name as task_name',
        'projects.id as project_id',
        'projects.name as project_name',
        'clients.id as client_id',
        'clients.name as client_name'
      )
      .where('user_tasks.user_id', req.user!.id)
      .where('tasks.status', 'open')
      .whereNull('user_tasks.deleted_at')
      .whereNull('tasks.deleted_at')
      .orderBy('clients.name', 'asc')
      .orderBy('projects.name', 'asc')
      .orderBy('tasks.name', 'asc')

    res.json(tasks)
  } catch (err) {
    console.error('GET /api/tasks/mine error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Returns all non-deleted tasks joined with project and client; supports ?project_id and ?status filters
router.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const query = db('tasks')
      .join('projects', 'tasks.project_id', 'projects.id')
      .join('clients', 'projects.client_id', 'clients.id')
      .select(
        'tasks.id',
        'tasks.name',
        'tasks.project_id',
        'projects.name as project_name',
        'clients.name as client_name',
        'tasks.status',
        'tasks.created_at'
      )
      .whereNull('tasks.deleted_at')
      .orderBy('tasks.created_at', 'desc')

    if (req.query.project_id) {
      query.where('tasks.project_id', req.query.project_id)
    }

    if (req.query.status) {
      query.where('tasks.status', req.query.status)
    }

    const tasks = await query
    res.json(tasks)
  } catch (err) {
    console.error('GET /api/tasks error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, project_id]
 *             properties:
 *               name:
 *                 type: string
 *               project_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Task created
 *       400:
 *         description: Validation error
 */
// Creates a new task with status=open; validates name and project_id before inserting
router.post('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, project_id } = req.body as { name?: string; project_id?: number }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' })
    }

    if (!project_id) {
      return res.status(400).json({ message: 'Project is required' })
    }

    const project = await db('projects')
      .join('clients', 'projects.client_id', 'clients.id')
      .where('projects.id', project_id)
      .where('projects.is_active', true)
      .whereNull('projects.deleted_at')
      .select('projects.id', 'projects.name', 'clients.name as client_name')
      .first()

    if (!project) {
      return res.status(400).json({ message: 'Invalid project' })
    }

    const [task] = await db('tasks')
      .insert({
        name: name.trim(),
        project_id,
        status: 'open',
      })
      .returning(['id', 'name', 'project_id', 'status', 'created_at'])

    res.status(201).json({
      ...task,
      project_name: project.name,
      client_name: project.client_name,
    })
  } catch (err) {
    console.error('POST /api/tasks error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
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
 *               status:
 *                 type: string
 *                 enum: [open, closed]
 *     responses:
 *       200:
 *         description: Task updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Task not found
 */
// Updates an existing task's name and/or status by id; returns task with project and client names
router.put('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, status } = req.body as { name?: string; status?: string }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (status !== undefined) updates.status = status

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'At least one field must be provided' })
    }

    if (status !== undefined && !['open', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    updates.updated_at = db.fn.now()

    const [task] = await db('tasks')
      .where({ id })
      .whereNull('deleted_at')
      .update(updates)
      .returning(['id', 'name', 'project_id', 'status', 'created_at'])

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    const project = await db('projects')
      .join('clients', 'projects.client_id', 'clients.id')
      .where('projects.id', task.project_id)
      .select('projects.name', 'clients.name as client_name')
      .first()

    res.json({
      ...task,
      project_name: project ? project.name : null,
      client_name: project ? project.client_name : null,
    })
  } catch (err) {
    console.error('PUT /api/tasks/:id error:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router;

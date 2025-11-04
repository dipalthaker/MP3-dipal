// routes/tasks.js
const Task = require('../models/task');
const User = require('../models/user');
const buildQuery = require('../utils/query');
const { ok, fail } = require('./resp');

// helpers
const toBool = (v) => v === true || v === 'true' || v === 'on' || v === '1';
const toDate = (v) =>
  v === undefined || v === null || v === '' ? undefined : new Date(Number(v));

module.exports = function (router) {
  // /api/tasks
  router
    .route('/')
    // GET /api/tasks
    .get(async (req, res) => {
      try {
      
        const { q, count, applyLimit } = buildQuery(Task, req.query);

      
        const limit = applyLimit(req.query.limit, 100);
        if (limit !== undefined) q.limit(limit);

        if (count) {
          
          const total = await Task.countDocuments(q.getQuery());
          return ok(res, total);
        }

        const docs = await q.exec();
        return ok(res, docs);
      } catch (e) {
        return fail(res, e.status || 400, e.message || 'Bad request');
      }
    })

    // POST /api/tasks
    .post(async (req, res) => {
      try {
        const {
          name,
          description,
          deadline,
          completed,
          assignedUser,
          assignedUserName,
        } = req.body;

        if (!name || !description) {
          return fail(res, 400, 'name and description are required');
        }
        if (deadline === undefined) {
          return fail(res, 400, 'deadline (ms epoch) is required');
        }

        let assignedId = assignedUser || null;
        let assignedName = assignedUserName || 'unassigned';

        if (assignedId && assignedId !== 'unassigned') {
          const u = await User.findById(assignedId);
          if (!u) return fail(res, 400, 'assignedUser does not exist');
          assignedId = u._id;
          assignedName = u.name;
        } else {
          assignedId = null;
          assignedName = 'unassigned';
        }

        // Create task; store deadline as Date and completed as Boolean
        const task = new Task({
          name,
          description,
          deadline: toDate(deadline),
          completed: toBool(completed),
          assignedUser: assignedId,
          assignedUserName: assignedName,
        });

        await task.save();

        // Two-way: add to user.pendingTasks if assigned
        if (assignedId) {
          await User.findByIdAndUpdate(assignedId, {
            $addToSet: { pendingTasks: task._id },
          });
        }

        return ok(res, task, 201);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    });

  // /api/tasks/:id
  router
    .route('/:id')
    // GET /api/tasks/:id (+select support)
    .get(async (req, res) => {
      try {
        const id = req.params.id;
        let projection = {};
        if (req.query.select) {
          try {
            projection = JSON.parse(req.query.select);
          } catch {
            return fail(res, 400, 'Invalid JSON for select');
          }
        }
        const doc = await Task.findById(id, projection);
        if (!doc) return fail(res, 404, 'Not Found');
        return ok(res, doc);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })

    // PUT /api/tasks/:id (replace doc; maintain two-way references)
    .put(async (req, res) => {
      try {
        const id = req.params.id;
        const payload = req.body;

        if (!payload.name || !payload.description || payload.deadline === undefined) {
          return fail(res, 400, 'name, description, and deadline are required');
        }

        const prev = await Task.findById(id);
        if (!prev) return fail(res, 404, 'Not Found');

        // Determine new assignment
        let newAssignedId = null;
        let newAssignedName = 'unassigned';

        if (payload.assignedUser && payload.assignedUser !== 'unassigned') {
          const u = await User.findById(payload.assignedUser);
          if (!u) return fail(res, 400, 'assignedUser does not exist');
          newAssignedId = u._id;
          newAssignedName = u.name;
        }

        const updated = await Task.findByIdAndUpdate(
          id,
          {
            name: payload.name,
            description: payload.description,
            deadline: toDate(payload.deadline),
            completed: toBool(payload.completed),
            assignedUser: newAssignedId,
            assignedUserName: newAssignedName,
          },
          { new: true, runValidators: true, overwrite: true }
        );

        // Two-way maintenance
        const prevUser = prev.assignedUser?.toString();
        const nextUser = newAssignedId?.toString();

        if (prevUser && prevUser !== nextUser) {
          await User.findByIdAndUpdate(prevUser, {
            $pull: { pendingTasks: updated._id },
          });
        }
        if (nextUser && prevUser !== nextUser) {
          await User.findByIdAndUpdate(nextUser, {
            $addToSet: { pendingTasks: updated._id },
          });
        }

        return ok(res, updated);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })

    // DELETE /api/tasks/:id (remove two-way link; return 204)
    .delete(async (req, res) => {
      try {
        const id = req.params.id;
        const task = await Task.findByIdAndDelete(id);
        if (!task) return fail(res, 404, 'Not Found');

        if (task.assignedUser) {
          await User.findByIdAndUpdate(task.assignedUser, {
            $pull: { pendingTasks: task._id },
          });
        }

        return res.status(204).send();
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    });

  return router;
};

// routes/tasks.js
const Task = require('../models/task');
const User = require('../models/user');
const buildQuery = require('../utils/query');
const { ok, fail } = require('./resp');

// helpers
const toArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));

module.exports = function (router) {
  // /api/tasks
  router
    .route('/')
    // GET list with query params (where/sort/select/skip/limit/count)
    .get(async (req, res) => {
      try {
        const { q, count, applyLimit } = buildQuery(Task, req.query);
        const limit = applyLimit(req.query.limit, 100); // default 100 for tasks
        if (limit !== undefined) q.limit(limit);
        if (count) return ok(res, await Task.countDocuments(q.getQuery()));
        return ok(res, await q.exec());
      } catch (e) {
        return fail(res, e.status || 400, e.message || 'Bad request');
      }
    })
    // POST create task
    .post(async (req, res) => {
      try {
        // Spec: name + deadline required; description optional
        const {
          name,
          description = '',
          deadline,
          completed,
          assignedUser,
          assignedUserName,
        } = req.body;

        if (!name) return fail(res, 400, 'name is required');
        if (deadline === undefined)
          return fail(res, 400, 'deadline (ms epoch) is required');

        // Validate assignment (if any)
        let assignedId = null;
        let assignedName = 'unassigned';
        if (assignedUser && assignedUser !== 'unassigned') {
          const u = await User.findById(assignedUser);
          if (!u) return fail(res, 400, 'assignedUser does not exist');
          assignedId = u._id;
          assignedName = u.name;
        }

        const task = new Task({
          name,
          description,
          deadline,
          completed: !!completed,
          assignedUser: assignedId,
          assignedUserName: assignedName,
        });
        await task.save();

        // Two-way add only if assigned AND task is pending (completed === false)
        if (assignedId && task.completed === false) {
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
    // GET single (supports ?select=)
    .get(async (req, res) => {
      try {
        const base = Task.findById(req.params.id);
        if (req.query.select) base.select(JSON.parse(req.query.select));
        const doc = await base.exec();
        if (!doc) return fail(res, 404, 'Not Found');
        return ok(res, doc);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })
    // PUT replace entire task
    .put(async (req, res) => {
      try {
        const id = req.params.id;
        const p = req.body;

        if (!p.name || p.deadline === undefined) {
          return fail(res, 400, 'name and deadline are required');
        }

        // Resolve new assignment (if provided)
        let newAssignedId = null;
        let newAssignedName = 'unassigned';
        if (p.assignedUser && p.assignedUser !== 'unassigned') {
          const u = await User.findById(p.assignedUser);
          if (!u) return fail(res, 400, 'assignedUser does not exist');
          newAssignedId = u._id;
          newAssignedName = u.name;
        }

        const prev = await Task.findById(id);
        if (!prev) return fail(res, 404, 'Not Found');

        const updated = await Task.findByIdAndUpdate(
          id,
          {
            name: p.name,
            description: p.description ?? prev.description ?? '',
            deadline: p.deadline,
            completed: !!p.completed,
            assignedUser: newAssignedId,
            assignedUserName: newAssignedName,
          },
          { new: true, runValidators: true, overwrite: true }
        );

        // Two-way reconciliation
        const prevUser = prev.assignedUser ? String(prev.assignedUser) : null;
        const nextUser = newAssignedId ? String(newAssignedId) : null;
        const prevDone = !!prev.completed;
        const nextDone = !!updated.completed;

        // Remove from previous user's pending if user changed OR task just became completed
        if (prevUser && (prevUser !== nextUser || (!prevDone && nextDone))) {
          await User.findByIdAndUpdate(prevUser, {
            $pull: { pendingTasks: updated._id },
          });
        }

        // Ensure presence in next user's pending if assigned & not completed
        if (nextUser && nextDone === false) {
          await User.findByIdAndUpdate(nextUser, {
            $addToSet: { pendingTasks: updated._id },
          });
        }

        return ok(res, updated);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })
    // DELETE task
    .delete(async (req, res) => {
      try {
        const id = req.params.id;
        const task = await Task.findByIdAndDelete(id);
        if (!task) return fail(res, 404, 'Not Found');

        // Two-way cleanup (remove from user's pendingTasks)
        if (task.assignedUser) {
          await User.findByIdAndUpdate(task.assignedUser, {
            $pull: { pendingTasks: task._id },
          });
        }

        return ok(res, task);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    });

  return router;
};

// routes/users.js
const User = require('../models/user');
const Task = require('../models/task');
const buildQuery = require('../utils/query');
const { ok, fail } = require('./resp');

module.exports = function (router) {
  // /api/users
  router
    .route('/')
    // GET /api/users
    .get(async (req, res) => {
      try {
        const { q, count, applyLimit } = buildQuery(User, req.query);

       
        const limit = applyLimit(req.query.limit, undefined);
        if (limit !== undefined) q.limit(limit);

        if (count) {
          const total = await User.countDocuments(q.getQuery());
          return ok(res, total);
        }

        const docs = await q.exec();
        return ok(res, docs);
      } catch (e) {
        return fail(res, e.status || 400, e.message || 'Bad request');
      }
    })

    // POST /api/users
    .post(async (req, res) => {
      try {
        const { name, email, pendingTasks } = req.body;
        if (!name || !email) return fail(res, 400, 'name and email are required');

        const exists = await User.findOne({ email });
        if (exists) return fail(res, 400, 'email already exists');

        const user = new User({
          name,
          email,
          pendingTasks: Array.isArray(pendingTasks) ? pendingTasks : [],
        });

        await user.save();

        if (user.pendingTasks.length) {
          await Task.updateMany(
            { _id: { $in: user.pendingTasks } },
            { $set: { assignedUser: user._id, assignedUserName: user.name } }
          );
        }

        return ok(res, user, 201);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    });

  // /api/users/:id
  router
    .route('/:id')
    // GET /api/users/:id (+select support)
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
        const doc = await User.findById(id, projection);
        if (!doc) return fail(res, 404, 'Not Found');
        return ok(res, doc);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })

    // PUT /api/users/:id (replace entire user; maintain two-way with tasks)
    .put(async (req, res) => {
      try {
        const id = req.params.id;
        const payload = req.body;

        if (!payload.name || !payload.email) {
          return fail(res, 400, 'name and email are required');
        }

        const prev = await User.findById(id);
        if (!prev) return fail(res, 404, 'Not Found');

        const dup = await User.findOne({ email: payload.email, _id: { $ne: id } });
        if (dup) return fail(res, 400, 'email already exists');

        const nextPending = Array.isArray(payload.pendingTasks) ? payload.pendingTasks : [];

        // Replace user
        const updated = await User.findByIdAndUpdate(
          id,
          {
            name: payload.name,
            email: payload.email,
            pendingTasks: nextPending,
          },
          { new: true, runValidators: true, overwrite: true }
        );

        const prevSet = new Set((prev.pendingTasks || []).map(String));
        const nextSet = new Set((nextPending || []).map(String));

        const removed = [...prevSet].filter((t) => !nextSet.has(t));
        if (removed.length) {
          await Task.updateMany(
            { _id: { $in: removed }, assignedUser: id },
            { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
          );
        }

        // Tasks newly added -> assign to this user
        const added = [...nextSet].filter((t) => !prevSet.has(t));
        if (added.length) {
          await Task.updateMany(
            { _id: { $in: added } },
            { $set: { assignedUser: id, assignedUserName: updated.name } }
          );
        }

        return ok(res, updated);
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    })

    // DELETE /api/users/:id (unassign their tasks; return 204)
    .delete(async (req, res) => {
      try {
        const id = req.params.id;
        const user = await User.findByIdAndDelete(id);
        if (!user) return fail(res, 404, 'Not Found');

        await Task.updateMany(
          { assignedUser: id },
          { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
        );

        return res.status(204).send();
      } catch (e) {
        return fail(res, 400, e.message || 'Bad request');
      }
    });

  return router;
};

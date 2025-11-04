// routes/users.js
const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');
const buildQuery = require('../utils/query');
const { ok, fail } = require('./resp');

// helpers
const toArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
const asObjectIdSet = (arr) => new Set(toArray(arr).map((x) => String(x)));

module.exports = function (router) {
  // /api/users
  router
    .route('/')
    // GET list with query params; no default limit for users
    .get(async (req, res) => {
      try {
        const { q, count } = buildQuery(User, req.query);
        if (count) return ok(res, await User.countDocuments(q.getQuery()));
        return ok(res, await q.exec());
      } catch (e) {
        return fail(res, e.status || 400, e.message || 'Bad request');
      }
    })
    // POST create user (and optional pendingTasks two-way)
    .post(async (req, res) => {
      try {
        const { name, email } = req.body;
        if (!name || !email) return fail(res, 400, 'name and email are required');

        // Normalize pendingTasks input but only keep *pending* tasks
        const requestedPending = asObjectIdSet(req.body['pendingTasks'] ?? req.body['pendingTasks[]']);
        const tasks = requestedPending.size
          ? await Task.find({ _id: { $in: Array.from(requestedPending) } })
          : [];
        const pendingOnly = tasks.filter((t) => !t.completed).map((t) => t._id);

        // Create the user with filtered pending tasks
        const user = new User({
          name,
          email,
          pendingTasks: pendingOnly,
        });

        await user.save();

        // Assign those tasks to this user (two-way)
        if (pendingOnly.length) {
          await Task.updateMany(
            { _id: { $in: pendingOnly } },
            { $set: { assignedUser: user._id, assignedUserName: user.name } }
          );
        }

        return ok(res, user, 201);
      } catch (e) {
        if (String(e).includes('duplicate key')) {
          return fail(res, 400, 'email must be unique');
        }
        return fail(res, 400, 'Bad request');
      }
    });

  // /api/users/:id
  router
    .route('/:id')
    // GET single (supports ?select=)
    .get(async (req, res) => {
      try {
        const base = User.findById(req.params.id);
        if (req.query.select) base.select(JSON.parse(req.query.select));
        const doc = await base.exec();
        if (!doc) return fail(res, 404, 'Not Found');
        return ok(res, doc);
      } catch (e) {
        return fail(res, 400, 'Bad request');
      }
    })
    // PUT replace entire user (and reconcile two-way)
    .put(async (req, res) => {
      try {
        const id = req.params.id;
        const p = req.body;

        if (!p.name || !p.email)
          return fail(res, 400, 'name and email are required');

        const existing = await User.findById(id);
        if (!existing) return fail(res, 404, 'Not Found');

        // Normalize new pendingTasks and filter to only *pending* tasks
        const requestedPending = asObjectIdSet(p['pendingTasks'] ?? p['pendingTasks[]']);
        const tasks = requestedPending.size
          ? await Task.find({ _id: { $in: Array.from(requestedPending) } })
          : [];
        const assignable = tasks.filter((t) => !t.completed).map((t) => String(t._id));
        const assignableSet = new Set(assignable);

        // 1) Update the User document first with filtered list
        const updated = await User.findByIdAndUpdate(
          id,
          { name: p.name, email: p.email, pendingTasks: Array.from(assignableSet) },
          { new: true, runValidators: true, overwrite: true }
        );

        // 2) Unassign tasks that were assigned to this user but are not in the new list
        await Task.updateMany(
          { assignedUser: id, _id: { $nin: Array.from(assignableSet) } },
          { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
        );

        // 3) Assign all tasks from the new list to this user (they are guaranteed not completed)
        if (assignable.length) {
          await Task.updateMany(
            { _id: { $in: Array.from(assignableSet) } },
            { $set: { assignedUser: id, assignedUserName: updated.name } }
          );
        }

        return ok(res, updated);
      } catch (e) {
        if (String(e).includes('duplicate key')) {
          return fail(res, 400, 'email must be unique');
        }
        return fail(res, 400, 'Bad request');
      }
    })
    // DELETE user (unassign all their tasks)
    .delete(async (req, res) => {
      try {
        const id = req.params.id;
        const user = await User.findByIdAndDelete(id);
        if (!user) return fail(res, 404, 'Not Found');

        await Task.updateMany(
          { assignedUser: id },
          { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
        );

        return ok(res, user);
      } catch (e) {
        return fail(res, 400, 'Bad request');
      }
    });

  return router;
};

module.exports = function buildQuery(model, queryParams) {
    let { where, sort, select, skip, limit, count } = queryParams;
  
    // Parse JSON-bearing parameters
    const parseJSON = (v) => {
      if (v === undefined) return undefined;
      try { return JSON.parse(v); } catch { throw { status: 400, message: `Invalid JSON for query param` }; }
    };
  
    where = parseJSON(where) || {};
    sort = parseJSON(sort);
    select = parseJSON(select);
  
    // Build mongoose query
    let q = model.find(where);
    if (sort) q = q.sort(sort);
    if (select) q = q.select(select);
    if (skip !== undefined) q = q.skip(Number(skip) || 0);
  
    // Default limit per README: unlimited for users, 100 for tasks – we’ll apply in per-route
    const applyLimit = (n, def) => Number.isFinite(Number(n)) ? Number(n) : def;
  
    return { q, count: (count === 'true' || count === true), applyLimit };
  };
  
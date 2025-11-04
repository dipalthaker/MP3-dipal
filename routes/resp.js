exports.ok = (res, data, code=200) => res.status(code).json({ message: 'OK', data });
exports.fail = (res, code, message) => res.status(code).json({ message, data: [] });

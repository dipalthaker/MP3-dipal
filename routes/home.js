
module.exports = function (router) {
  router.get('/', (req, res) => {
    res.json({ message: 'OK', data: 'Welcome to APIed Piper' });
  });
  return router;
};

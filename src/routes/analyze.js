'use strict';

const express = require('express');
const { asyncRoute } = require('../lib/express');

function analyzeRoutes({ ai }) {
  const router = express.Router();

  router.post('/', asyncRoute(async (req, res) => {
    const { metaData, tnData, datePreset } = req.body || {};
    const result = await ai.analyze({ metaData: metaData || {}, tnData: tnData || {}, datePreset });
    res.json(result);
  }));

  return router;
}

module.exports = { analyzeRoutes };

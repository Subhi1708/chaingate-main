// routes/chain.js

const express = require('express');
const router = express.Router();
const { getChain, validateChain } = require('../server/blockchain');
const { accessLog, blocks } = require('../server/db');

// ── GET /chain/blocks ─────────────────────────────────────────────────────────
router.get('/blocks', (req, res) => {
  const chain = getChain();
  const valid = validateChain();
  res.json({
    success: true,
    chain,
    totalBlocks: chain.length,
    valid,
  });
});

// ── GET /chain/block/:index ───────────────────────────────────────────────────
router.get('/block/:index', (req, res) => {
  const chain = getChain();
  const block = chain[parseInt(req.params.index)];
  if (!block) return res.status(404).json({ success: false, message: 'Block not found' });
  res.json({ success: true, block });
});

// ── GET /chain/stats ──────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const chain = getChain();
  const valid = validateChain();
  const stats = accessLog.todayStats.get();

  res.json({
    success: true,
    totalBlocks: chain.length,
    valid,
    lastBlock: chain[chain.length - 1],
    todayStats: stats,
  });
});

module.exports = router;

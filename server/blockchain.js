// server/blockchain.js
// Real blockchain: SHA-256 hashing, proof-of-work mining, SQLite persistence

const crypto = require('crypto');
const { blocks } = require('./db');

const DIFFICULTY = 2; // leading zeros required in hash

function sha256(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function mineBlock(index, previousHash, data, ts) {
  let nonce = 0;
  let hash;
  const prefix = '0'.repeat(DIFFICULTY);
  do {
    nonce++;
    hash = sha256({ index, previousHash, data, ts, nonce });
  } while (!hash.startsWith(prefix));
  return { nonce, hash };
}

// ── In-memory chain (loaded from DB on start) ─────────────────────────────────

let chain = [];

function loadChain() {
  const rows = blocks.all.all();
  if (rows.length === 0) {
    // Create genesis block
    const genesis = createGenesisBlock();
    chain = [genesis];
  } else {
    chain = rows.map(r => ({
      index: r.block_index,
      previousHash: r.previous_hash,
      hash: r.hash,
      nonce: r.nonce,
      data: JSON.parse(r.data),
      ts: r.ts,
    }));
  }
}

function createGenesisBlock() {
  const ts = Date.now();
  const data = [{
    type: 'GENESIS',
    msg: 'ChainGate v1 — College Access Control System',
    college: 'Government Engineering College',
    txId: randomTxId(),
    ts,
  }];
  const { nonce, hash } = mineBlock(0, '0', data, ts);
  const block = { index: 0, previousHash: '0', hash, nonce, data, ts };

  blocks.insert.run({
    block_index: 0,
    previous_hash: '0',
    hash,
    nonce,
    data: JSON.stringify(data),
  });

  return block;
}

function addBlock(txData) {
  const prev = chain[chain.length - 1];
  const ts = Date.now();
  const data = [{ ...txData, txId: randomTxId(), ts }];
  const { nonce, hash } = mineBlock(chain.length, prev.hash, data, ts);

  const block = {
    index: chain.length,
    previousHash: prev.hash,
    hash,
    nonce,
    data,
    ts,
  };

  blocks.insert.run({
    block_index: block.index,
    previous_hash: block.previousHash,
    hash: block.hash,
    nonce: block.nonce,
    data: JSON.stringify(block.data),
  });

  chain.push(block);
  return block;
}

function validateChain() {
  for (let i = 1; i < chain.length; i++) {
    const curr = chain[i];
    const prev = chain[i - 1];
    if (curr.previousHash !== prev.hash) return false;
    const recalc = sha256({
      index: curr.index,
      previousHash: curr.previousHash,
      data: curr.data,
      ts: curr.ts,
      nonce: curr.nonce,
    });
    if (curr.hash !== recalc) return false;
  }
  return true;
}

function getChain() { return chain; }
function getLastBlock() { return chain[chain.length - 1]; }

function randomTxId() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Load persisted chain on module import
loadChain();

module.exports = { addBlock, validateChain, getChain, getLastBlock, sha256 };
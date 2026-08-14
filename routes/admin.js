// routes/admin.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../middleware/auth');
const { students, accessLog, emergencyPasses, faceChecks } = require('../server/db');
const { addBlock, validateChain, getChain } = require('../server/blockchain');

const JWT_SECRET = 'chaingate-secret-key-fixed-12345';
const ADMIN_PASSWORD = 'admin123';

// ── POST /admin/login ─────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required' });

  const correct = ADMIN_PASSWORD;
  if (password !== correct) {
    return res.status(401).json({ success: false, message: 'Wrong password' });
  }

  const token = jwt.sign({ role: 'admin', iat: Date.now() }, JWT_SECRET, {
    expiresIn: '8h',
  });
  res.json({ success: true, token });
});

// ── POST /admin/register-student ─────────────────────────────────────────────
router.post('/register-student', requireAdmin, (req, res) => {
  const { studentId, name, department, year, phone, photoData } = req.body;

  if (!studentId || !name || !department) {
    return res.status(400).json({ success: false, message: 'studentId, name, department required' });
  }

  // Check duplicate
  const existing = students.findByRollNo.get(studentId);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Student already registered' });
  }

  students.insert.run({
    roll_no: studentId,
    name,
    department,
    year: year || '',
    phone: phone || '',
    photo_data: photoData || null,
  });

  // Write to blockchain
  const block = addBlock({
    type: 'STUDENT_REGISTERED',
    studentId,
    name,
    department,
    year,
    msg: `Student registered: ${name} (${studentId})`,
  });

  // Write to access_log
  accessLog.insert.run({
    type: 'STUDENT_REGISTERED',
    student_id: studentId,
    name,
    department,
    msg: `Registered: ${name} (${studentId}) — ${department}`,
    tx_id: block.data[0].txId,
    block_hash: block.hash,
  });

  res.json({ success: true, message: 'Student registered', blockHash: block.hash });
});

// ── GET /admin/students ───────────────────────────────────────────────────────
router.get('/students', requireAdmin, (req, res) => {
  const q = req.query.q;
  let list;
  if (q) {
    const like = `%${q}%`;
    list = students.search.all(like, like, like);
  } else {
    list = students.findAll.all();
  }
  // Strip photo_data from list view (bandwidth)
  res.json({ success: true, students: list.map(s => ({ ...s, photo_data: s.photo_data ? '[photo]' : null })) });
});

// ── GET /admin/student/:rollNo ────────────────────────────────────────────────
router.get('/student/:rollNo', requireAdmin, (req, res) => {
  const s = students.findByRollNo.get(req.params.rollNo);
  if (!s) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, student: s });
});

// ── POST /admin/suspend-student ───────────────────────────────────────────────
router.post('/suspend-student', requireAdmin, (req, res) => {
  const { studentId, active } = req.body;
  students.setActive.run(active ? 1 : 0, studentId);

  addBlock({
    type: active ? 'STUDENT_ACTIVATED' : 'STUDENT_SUSPENDED',
    studentId,
    msg: `Student ${studentId} ${active ? 'activated' : 'suspended'} by admin`,
  });

  res.json({ success: true });
});

// ── POST /admin/delete-student ──────────────────────────────────────────────
router.post('/delete-student', requireAdmin, (req, res) => {
  const { studentId } = req.body;
  if(!studentId) return res.status(400).json({success:false,message:'studentId required'});
  
  const student = students.findByRollNo.get(studentId);
  if(!student) return res.status(404).json({success:false,message:'Student not found'});
  
  students.delete.run(studentId);
  addBlock({
    type:'STUDENT_DELETED',
    studentId:studentId,
    msg:`Student ${studentId} deleted by admin`
  });
  res.json({success:true,message:'Student deleted'});
});

// ── POST /admin/issue-pass ────────────────────────────────────────────────────
router.post('/issue-pass', requireAdmin, (req, res) => {
  const { studentId, reason, durationMinutes = 60 } = req.body;
  if (!studentId || !reason) {
    return res.status(400).json({ success: false, message: 'studentId and reason required' });
  }

  const s = students.findByRollNo.get(studentId);
  if (!s) return res.status(404).json({ success: false, message: 'Student not found' });

  const passId = uuidv4();
  const expiry = Date.now() + durationMinutes * 60 * 1000;

  emergencyPasses.insert.run({ pass_id: passId, student_id: studentId, reason, expiry });

  const block = addBlock({
    type: 'EMERGENCY_PASS_ISSUED',
    studentId,
    name: s.name,
    reason,
    expiry,
    msg: `Emergency pass issued: ${s.name} (${studentId}) — ${reason}`,
  });

  res.json({ success: true, passId, expiry, blockHash: block.hash });
});

// ── GET /admin/passes ─────────────────────────────────────────────────────────
router.get('/passes', requireAdmin, (req, res) => {
  const passes = emergencyPasses.findActive.all();
  res.json({ success: true, passes });
});

// ── POST /admin/gate-override ─────────────────────────────────────────────────
router.post('/gate-override', requireAdmin, (req, res) => {
  const { action, reason } = req.body; // action: 'open' | 'close'
  if (!['open', 'close'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be open or close' });
  }

  const type = action === 'open' ? 'ADMIN_GATE_OPEN' : 'ADMIN_GATE_CLOSE';
  const block = addBlock({
    type,
    msg: `Admin gate override: ${action.toUpperCase()} — ${reason || 'no reason given'}`,
  });

  accessLog.insert.run({
    type,
    student_id: null,
    name: 'ADMIN',
    department: null,
    msg: `Gate ${action} override — ${reason}`,
    tx_id: block.data[0].txId,
    block_hash: block.hash,
  });

  res.json({ success: true, action, blockHash: block.hash });
});

// ── GET /admin/dashboard ──────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, (req, res) => {
  const stats = accessLog.todayStats.get();
  const recentLog = accessLog.recent.all(20);
  const studentCount = students.findAll.all().length;
  const chainValid = validateChain();
  const chain = getChain();
  const recentFails = faceChecks.recentFails.all();

  res.json({
    success: true,
    stats: {
      totalStudents: studentCount,
      todayEntries: stats.entries || 0,
      todayDenied: stats.denied || 0,
      faceMismatches: stats.mismatches || 0,
      chainBlocks: chain.length,
      chainValid,
    },
    recentLog,
    recentFails,
  });
});

// ── GET /admin/log ────────────────────────────────────────────────────────────
router.get('/log', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const log = accessLog.recent.all(limit);
  res.json({ success: true, log });
});

module.exports = router;
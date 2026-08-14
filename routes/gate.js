// routes/gate.js

const express = require('express');
const router = express.Router();
const { students, qrTokens, accessLog, faceChecks } = require('../server/db');
const { addBlock } = require('../server/blockchain');

// 🔥 CONFIG (you can adjust)
const MIN_CONFIDENCE = 70; // % required to open gate

// ── POST /gate/verify-qr ──────────────────────────────────────────────────────
router.post('/verify-qr', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });

  const qr = qrTokens.findByToken.get(token);

  if (!qr) {
    return res.json({ success: false, message: 'Unknown token — not issued by this server' });
  }
  if (qr.used) {
    return res.json({ success: false, message: 'QR already used — replay attack blocked' });
  }
  if (Date.now() > qr.expiry) {
    return res.json({ success: false, message: `QR expired` });
  }

  const student = students.findByRollNo.get(qr.student_id);
  if (!student) {
    return res.json({ success: false, message: 'Student not found' });
  }
  if (!student.active) {
    return res.json({ success: false, message: 'Student suspended' });
  }

  qrTokens.markUsed.run(Date.now(), token);

  res.json({
    success: true,
    user: {
      studentId: qr.student_id,
      name: qr.name,
      department: qr.department,
      type: qr.type,
    },
  });
});

// ── POST /gate/log-access ─────────────────────────────────────────────────────
router.post('/log-access', (req, res) => {
  let { studentId, name, department, type, matched, confidence, reason, checkType } = req.body;

  // 🔴 VALIDATION
  if (typeof matched !== 'boolean' || confidence === undefined) {
    return res.status(400).json({
      success: false,
      message: "Invalid face verification data"
    });
  }

  // 🔥 STRICT BACKEND CONTROL (DON'T TRUST FRONTEND)
  const isValid = matched === true && confidence >= MIN_CONFIDENCE;

  // 🔍 Debug (remove in production)
  console.log("Face Check:", {
    studentId,
    matched,
    confidence,
    isValid
  });

  const eventType = isValid
    ? 'GATE_OPEN'
    : (checkType === 'continuous' ? 'CONTINUOUS_FAIL' : 'FACE_MISMATCH');

  const message = isValid
    ? `Gate opened: ${name} (${studentId}) — ${confidence}%`
    : `Access denied: ${name} (${studentId}) — ${confidence}% — ${reason || 'Face mismatch'}`;

  // 🔗 Blockchain entry
  const block = addBlock({
    type: eventType,
    studentId,
    name,
    department,
    msg: message,
  });

  // 🗃️ Access log
  accessLog.insert.run({
    type: eventType,
    student_id: studentId,
    name,
    department,
    msg: message,
    tx_id: block.data[0].txId,
    block_hash: block.hash,
  });

  // 🧠 Face audit log
  faceChecks.insert.run({
    student_id: studentId,
    matched: isValid ? 1 : 0,
    confidence: confidence || 0,
    reason: isValid ? '' : (reason || 'Face mismatch'),
    method: 'face-api',
    check_type: checkType || 'initial',
  });

  // 🔴 RESPONSE (IMPORTANT)
  res.json({
    success: true,
    access: isValid,   // 🔥 frontend must use this
    message,
    blockHash: block.hash,
    txId: block.data[0].txId
  });
});

// ── POST /gate/log-deny ───────────────────────────────────────────────────────
router.post('/log-deny', (req, res) => {
  const { studentId, reason, type = 'ACCESS_DENIED' } = req.body;

  const block = addBlock({
    type,
    studentId,
    msg: `Access denied: ${studentId || 'unknown'} — ${reason}`,
  });

  accessLog.insert.run({
    type,
    student_id: studentId || null,
    name: null,
    department: null,
    msg: `Denied: ${reason}`,
    tx_id: block.data[0].txId,
    block_hash: block.hash,
  });

  res.json({ success: true });
});

// ── GET /gate/student/:rollNo ─────────────────────────────────────────────────
router.get('/student/:rollNo', (req, res) => {
  const s = students.findByRollNo.get(req.params.rollNo);

  if (!s) return res.status(404).json({ success: false, message: 'Student not found' });
  if (!s.active) return res.json({ success: false, message: 'Student suspended' });

  res.json({
    success: true,
    student: {
      rollNo: s.roll_no,
      name: s.name,
      department: s.department,
      year: s.year,
      photoData: s.photo_data,
    },
  });
});

module.exports = router;
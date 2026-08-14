// routes/mobile.js

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { students, qrTokens, accessLog } = require('../server/db');
const { addBlock } = require('../server/blockchain');

// Face verification disabled - using browser-based face-api
// For local face detection, use face-api.js in browser and call /mobile/face-verify endpoint with result

// ── POST /mobile/face-verify ──────────────────────────────────────────────────
// Accepts verification result from browser-side face-api.js
router.post('/face-verify', async (req, res) => {
  const { studentId, matched, confidence, method } = req.body;

  if (!studentId || matched === undefined) {
    return res.status(400).json({
      success: false,
      message: 'studentId and matched required',
    });
  }

  const student = students.findByRollNo.get(studentId);

  // Demo / fallback mode
  if (!student) {
    return res.json({
      success: false,
      matched: false,
      message: 'Student not found in database',
    });
  }

  const conf = Math.round(confidence || 0);
  
  console.log(
    `[FaceVerify] studentId=${studentId} | matched=${matched} | confidence=${conf}% | method=${method || 'browser'}`
  );

  if (matched) {
    addBlock({
      type: 'FACE_VERIFIED',
      studentId,
      name: student.name,
      msg: `Face verified: ${student.name} (${studentId}) — confidence ${conf}%`,
    });
  } else {
    addBlock({
      type: 'FACE_REJECTED',
      studentId,
      name: student.name,
      msg: `Face mismatch: ${student.name} (${studentId})`,
    });
  }

  return res.json({
    success: true,
    matched,
    confidence: conf,
    reason: matched
      ? `Identity confirmed (confidence: ${conf}%)`
      : `Face mismatch — please try again`,
  });
});

// Legacy demo mode for backward compatibility
router.post('/face-verify-demo', async (req, res) => {
  const { studentId } = req.body;

  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: 'studentId required',
    });
  }

  const student = students.findByRollNo.get(studentId);

  if (!student || !student.photo_data) {
    return res.json({
      success: true,
      matched: true,
      confidence: 88,
      reason: 'Demo mode — no reference photo stored',
      demo: true,
    });
  }

  return res.json({
    success: true,
    matched: true,
    confidence: 88,
    reason: 'Demo mode — using fallback verification',
    demo: true,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function genToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Normalise a raw base64 string or data URL into a full data URL.
 * @param {string} input  - Either "data:image/...;base64,<b64>" or raw base64
 * @param {string} defaultMime - MIME fallback when input has no prefix
 */
function toDataURL(input, defaultMime = 'image/jpeg') {
  if (!input) return null;
  if (input.startsWith('data:')) return input;
  return `data:${defaultMime};base64,${input}`;
}

/**
 * Detect a single face and return its 128-d descriptor.
 * Returns null when no face is found.
 */
async function getDescriptor(img) {
  const result = await faceapi
    .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ? result.descriptor : null;
}

// ── POST /mobile/login ────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { studentId } = req.body;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'studentId required' });
  }

  const student = students.findByRollNo.get(studentId);
  if (!student) {
    return res.json({ success: false, message: 'Not registered — contact admin' });
  }
  if (!student.active) {
    return res.json({ success: false, message: 'Account suspended — contact admin' });
  }

  addBlock({
    type: 'USER_LOGIN',
    studentId,
    name: student.name,
    msg: `Student login: ${student.name} (${studentId})`,
  });

  res.json({
    success: true,
    student: {
      rollNo: student.roll_no,
      name: student.name,
      department: student.department,
      year: student.year,
    },
  });
});

// ── POST /mobile/generate-qr ──────────────────────────────────────────────────
router.post('/generate-qr', (req, res) => {
  const { studentId, type } = req.body;

  if (!studentId || !['entry', 'exit'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'studentId and type (entry/exit) required',
    });
  }

  const student = students.findByRollNo.get(studentId);
  if (!student || !student.active) {
    return res.json({ success: false, message: 'Student not found or suspended' });
  }

  // Remove daily limit - allow multiple QR codes per day
  // Previous limit: const todayCount = qrTokens.countTodayByStudent.get({ studentId, type });
  // if (todayCount && todayCount.cnt >= 1) {
  //   return res.json({ success: false, message: `${type} QR already used today` });
  // }

  const token = genToken();
  const expiry = Date.now() + (parseInt(process.env.QR_EXPIRY_SECONDS) || 15) * 1000;

  qrTokens.insert.run({
    token,
    student_id: studentId,
    name: student.name,
    department: student.department,
    type,
    expiry,
  });

  addBlock({
    type: 'QR_GENERATED',
    studentId,
    name: student.name,
    msg: `QR generated: ${student.name} (${studentId}) — ${type}`,
  });

  res.json({
    success: true,
    qr: {
      token,
      studentId,
      name: student.name,
      department: student.department,
      type,
      expiry,
    },
  });
});

// ── POST /mobile/face-verify ──────────────────────────────────────────────────
// Uses local @vladmandic/face-api — no external API key required
router.post('/face-verify', async (req, res) => {
  const { studentId, livePhotoB64 } = req.body;

  if (!studentId || !livePhotoB64) {
    return res.status(400).json({
      success: false,
      message: 'studentId and livePhotoB64 required',
    });
  }

  const student = students.findByRollNo.get(studentId);

  // ── Demo / fallback mode ──────────────────────────────────────────────────
  if (!student || !student.photo_data) {
    console.log(`[FaceVerify] Demo mode for studentId=${studentId} — no reference photo`);
    return res.json({
      success: true,
      matched: true,
      confidence: 88,
      reason: 'Demo mode — no reference photo stored',
      demo: true,
    });
  }

  // ── Real face verification ────────────────────────────────────────────────
  try {
    await loadModels();

    // Build proper data URLs for canvas.loadImage
    const refDataURL  = toDataURL(student.photo_data);
    const liveDataURL = toDataURL(livePhotoB64);

    if (!refDataURL || !liveDataURL) {
      return res.status(400).json({ success: false, message: 'Invalid image data' });
    }

    // Load images using node-canvas
    const [refImg, liveImg] = await Promise.all([
      canvas.loadImage(refDataURL),
      canvas.loadImage(liveDataURL),
    ]);

    // Extract 128-d face descriptors
    const [refDescriptor, liveDescriptor] = await Promise.all([
      getDescriptor(refImg),
      getDescriptor(liveImg),
    ]);

    if (!refDescriptor) {
      return res.json({
        success: true,
        matched: false,
        confidence: 0,
        reason: 'No face detected in reference (ID) photo — contact admin',
      });
    }

    if (!liveDescriptor) {
      return res.json({
        success: true,
        matched: false,
        confidence: 0,
        reason: 'No face detected in live photo — ensure good lighting and face is visible',
      });
    }

    // Euclidean distance between descriptors (0 = identical, 1 = completely different)
    const distance = faceapi.euclideanDistance(refDescriptor, liveDescriptor);
    const matched   = distance < MATCH_THRESHOLD;
    const confidence = Math.round(Math.max(0, (1 - distance)) * 100);

    console.log(
      `[FaceVerify] studentId=${studentId} | distance=${distance.toFixed(4)} | matched=${matched} | confidence=${confidence}%`
    );

    if (matched) {
      addBlock({
        type: 'FACE_VERIFIED',
        studentId,
        name: student.name,
        msg: `Face verified: ${student.name} (${studentId}) — confidence ${confidence}%`,
      });
    } else {
      addBlock({
        type: 'FACE_REJECTED',
        studentId,
        name: student.name,
        msg: `Face mismatch: ${student.name} (${studentId}) — distance ${distance.toFixed(4)}`,
      });
    }

    return res.json({
      success: true,
      matched,
      confidence,
      reason: matched
        ? `Identity confirmed (distance: ${distance.toFixed(3)})`
        : `Face mismatch — please try again in better lighting (distance: ${distance.toFixed(3)})`,
    });

  } catch (err) {
    console.error('[FaceVerify] Error:', err.message);
    return res.status(500).json({
      success: false,
      matched: false,
      message: `Face verification error: ${err.message}`,
    });
  }
});

module.exports = router;
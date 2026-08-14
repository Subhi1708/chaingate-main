# ChainGate - College Gate Security System

A blockchain-based college gate access control system with QR code authentication and face verification.

## Features

- **QR Code Authentication** - Students generate secure QR passes for entry/exit
- **Face Verification** - Browser-based face detection for identity confirmation
- **Admin Panel** - Manage students, view access logs, issue emergency passes
- **Blockchain Logging** - All access events recorded on blockchain
- **Real-time Stats** - Dashboard showing entries, denied attempts, and activity

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Webcam (for face verification at gate station)

## Installation Steps

### 1. Clone/Download the Project

Extract the project files to your desired location.

### 2. Install Dependencies

```bash
npm install
```

This will install:
- express - Web server
- better-sqlite3 - SQLite database
- jsonwebtoken - Authentication
- @vladmandic/face-api - Face detection (browser)
- Other required packages

### 3. Database Setup

The database is automatically created on first run:
- Location: `data/chaingate.db`
- Tables: students, qr_tokens, access_log, blocks, emergency_passes, face_checks

### 4. Start the Server

```bash
npm start
```

The server runs at `http://localhost:3000`

## Usage Guide

### Access the Application

| Component | URL |
|-----------|-----|
| Hub/Index | http://localhost:3000/ |
| Admin Panel | http://localhost:3000/chaingate-admin.html |
| Gate Station | http://localhost:3000/chaingate-gate.html |
| Mobile App | http://localhost:3000/chaingate-mobile.html |
| Blockchain | http://localhost:3000/chaingate-chain.html |

### Admin Panel (Security Officer)

1. **Login**: Password is `admin123`
2. **Register Students**: Add students with ID card photo for face verification
3. **View Dashboard**: See today's entries, denied attempts, registered students
4. **Access Log**: View complete audit trail of all gate events
5. **Emergency Passes**: Issue temporary access tokens
6. **Gate Override**: Manually open/close gate

### Mobile App (Students)

1. **Login**: Enter Roll Number, Name, and Department
2. **Generate QR**: Tap "Entry QR" or "Exit QR" to generate a pass
3. **QR Expiry**: QR codes expire after 15 seconds for security

### Gate Station (Security Guard)

1. **Scan QR**: Use camera or paste QR token manually
2. **Backend Verify**: Token validated against server
3. **Face Verify**: Student takes photo for identity confirmation
4. **Gate Control**: If all checks pass, gate opens automatically

## System Flow

```
[Student Mobile App]
       ↓
  Generate QR Pass (15s expiry)
       ↓
[Gate Station]
       ↓
  Scan QR Code
       ↓
  Verify Token with Server
       ↓
  Face Verification (Browser-based)
       ↓
  Gate Opens / Denied
```

## Database Schema

- **students**: Registered students with photos
- **qr_tokens**: Generated QR codes (single-use)
- **access_log**: All gate events
- **blocks**: Blockchain ledger
- **emergency_passes**: Temporary access tokens

## Configuration

Environment variables (optional - defaults work out of box):
- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - JWT signing key
- `ADMIN_PASSWORD` - Admin login password (default: admin123)
- `QR_EXPIRY_SECONDS` - QR code validity (default: 15)

## Troubleshooting

### "Entry QR already used today"
- Fixed: Removed daily limit, unlimited QR codes now allowed

### Face Detection Not Working
- Ensure webcam is connected and allowed
- Models load from CDN on first use (may take 10-20 seconds)
- Check browser console for errors
- Ensure good lighting for face detection

### Server Won't Start
- Check if port 3000 is available
- Run `npm install` to ensure all dependencies are installed

### Database Issues
- Database auto-creates on first run
- Delete `data/chaingate.db` to reset (all data will be lost)

### Backend Offline in Admin Panel
- This is normal if server runs on different device
- Local mode allows viewing previously registered students
- Students registered in local mode save to browser storage only

## Network Access

To access from other devices on the same network:
- Server binds to `0.0.0.0` (all interfaces)
- Use computer's local IP instead of localhost
- Example: `http://192.168.1.100:3000`

## Security Notes

- QR codes expire after 15 seconds to prevent reuse
- Each QR token can only be used once
- Face verification compares live photo with registered ID photo
- All access events are logged to blockchain for audit

## File Structure

```
├── server.js          # Express server entry point
├── routes/
│   ├── admin.js       # Admin API endpoints
│   ├── gate.js        # Gate station API
│   ├── mobile.js      # Student mobile API
│   └── chain.js       # Blockchain API
├── server/
│   ├── db.js          # SQLite database
│   └── blockchain.js  # Blockchain logic
├── middleware/
│   └── auth.js        # JWT authentication
├── public/
│   ├── chaingate-index.html    # Hub page
│   ├── chaingate-admin.html    # Admin panel
│   ├── chaingate-gate.html     # Gate station
│   ├── chaingate-mobile.html   # Mobile app
│   └── chaingate-chain.html    # Blockchain viewer
└── data/
    └── chaingate.db   # SQLite database
```

## License

MIT License
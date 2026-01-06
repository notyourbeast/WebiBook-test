# WebiBook - Live Learning Events Platform

## Quick Start

### Start Development Server
```bash
npm run dev
```

This will automatically:
- ✅ Kill any process using port 3000
- ✅ Start the server on port 3000
- ✅ Serve your frontend and API

### Access Your App
- **Frontend**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000?admin=webiBook2024
- **API Health**: http://localhost:3000/api/health

## Troubleshooting

### Port 3000 Already in Use?
```bash
# Option 1: Use the helper script
npm run kill-port

# Option 2: Manual kill
lsof -ti:3000 | xargs kill -9

# Option 3: Use different port
PORT=3001 npm run dev
```

### Server Not Starting?
1. Check if port is free: `lsof -i:3000`
2. Kill any processes: `npm run kill-port`
3. Try again: `npm run dev`

## Features

- ✅ Global Analytics Dashboard (tracks all users across devices)
- ✅ Email Signup Tracking
- ✅ Event Save/Unsave Tracking
- ✅ Event Click Tracking
- ✅ Visit Statistics (First-time vs Returning)
- ✅ Real-time Data Aggregation

## Deployment

See `DEPLOYMENT_READY.md` for deployment instructions.


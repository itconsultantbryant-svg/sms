# sms — SVL School Management System

Canonical repository: https://github.com/itconsultantbryant-svg/sms

See [PRODUCT_REQUIREMENTS_DOCUMENT.md](PRODUCT_REQUIREMENTS_DOCUMENT.md) for the reviewed product baseline and [HOSTED_DEPLOYMENT.md](HOSTED_DEPLOYMENT.md) for the Vercel + Neon setup.

A comprehensive web-based School Management System built for Softwarevala Liberia.

## Repository Structure

```
svl_sms/
├── src/              # Backend source code (at root for Render)
│   ├── routes/       # API routes
│   ├── database/     # Database schema & initialization
│   ├── middleware/   # Auth & tenant middleware
│   └── utils/        # Helper functions
├── data/             # SQLite database
├── frontend/         # React frontend (separate Vercel deployment)
├── package.json      # Backend dependencies (root)
├── tsconfig.json     # TypeScript config (root)
└── render.yaml       # Render deployment config
```

## Backend Deployment (Render)

The backend is at the root level for easy Render deployment:

```bash
# Render will run:
npm install
npm run build
npm start
```

## Frontend Deployment (Vercel)

The frontend is in the `frontend/` directory and deploys separately to Vercel.

See DEPLOYMENT.md for detailed instructions.

## Technology Stack

### Backend (Root Level)
- Node.js 18+
- Express.js
- SQLite (better-sqlite3)
- JWT Authentication
- TypeScript

### Frontend (frontend/ directory)
- React 18
- Vite
- Tailwind CSS
- TypeScript

## Development

### Backend
```bash
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Backend (.env):
```
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000
```

Frontend (frontend/.env):
```
VITE_API_URL=http://localhost:3001/api
```

## Deployment

1. **Backend to Render**: Push to GitHub, Render auto-deploys from root
2. **Frontend to Vercel**: Deploy from `frontend/` directory

See DEPLOYMENT.md for complete guide.

# TailorDesk

Tailor shop utility with:
- `frontend/`: React + Tailwind CSS
- `backend/`: Node.js + Express + SQLite + JWT auth
- `front/`: reserved directory (as requested)

## Features
- Customer management
- Measurement records
- Orders and payment history
- JWT authentication
- Role-based access
  - `admin`: create/update/delete
  - `user`: read-only

## Quick Start
1. Backend
   - `cd backend`
   - `npm install`
   - `copy .env.example .env`
   - `npm run dev`

2. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev`

## Default Admin
On first backend start, a default admin is auto-created from `.env` values.
Defaults:
- email: `admin@tailordesk.local`
- password: `Admin@123`

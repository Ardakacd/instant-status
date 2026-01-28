# Instant Status

A mobile app that allows users to share their availability status (FREE / BUSY / DND / SLEEP) with trusted contacts instantly.

## Project Structure

```
instant-status/
├── backend/          # NestJS backend API
└── mobile/           # React Native + Expo mobile app
```

## Quick Start

### Backend

1. Navigate to backend directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables (see `backend/.env.example`)

4. Set up PostgreSQL and Redis

5. Start the server:

```bash
npm run start:dev
```

### Mobile App

1. Navigate to mobile directory:

```bash
cd mobile
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables (see `mobile/README.md`)

4. Set up Firebase project

5. Start the app:

```bash
npm start
```

## Tech Stack

### Backend

- NestJS (TypeScript)
- PostgreSQL + TypeORM
- Firebase Admin SDK
- Postmark (Email service)
- Zod validation

### Mobile

- React Native + Expo
- TypeScript
- Firebase Auth (Email/Password, Google, Apple Sign-In)
- Firebase Cloud Messaging
- React Navigation
- iOS Widgets

## Features

✅ Email/password, Google, and Apple authentication  
✅ Email verification  
✅ Password reset  
✅ Status management (AVAILABLE, BUSY, DND, FOCUS, SOCIAL, COMMUTE)  
✅ Friend connections via invite codes and shareable links  
✅ Real-time status updates via push notifications  
✅ Status expiration support  
✅ iOS home screen widgets  
✅ Welcome emails and security alerts  
✅ Clean, minimal UI

## API Documentation

See `backend/README.md` for detailed API endpoint documentation.

## License

MIT

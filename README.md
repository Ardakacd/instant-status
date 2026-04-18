# Instant Status

Real-time status sharing app. Friends see each other's current status via mobile app and home screen widgets.

## Project Structure

```
instant-status/
├── backend/          # NestJS API (deployed on Railway)
├── mobile/           # React Native (Expo) mobile app
│   └── public/       # Firebase Hosting (website, privacy, terms)
```

## Quick Start

### Backend

```bash
cd backend
npm install
# Set up .env.development with DB and Firebase credentials
npm run start:dev
```

Requires PostgreSQL running locally.

### Mobile

```bash
cd mobile
npm install
# Set up Firebase project and environment variables
npm start
```

See `mobile/README.md` for environment variable details.

## Tech Stack

### Backend

- NestJS (TypeScript)
- PostgreSQL + TypeORM
- Firebase Admin SDK
- Zod validation

### Mobile

- React Native + Expo
- TypeScript
- Firebase Auth (Email/Password, Google, Apple Sign-In)
- Firebase Cloud Messaging
- RevenueCat (subscriptions)
- React Navigation
- Android widgets (`react-native-android-widget`)
- iOS widgets (SwiftUI via `@bacons/apple-targets`)

### Hosting

- Backend: Railway
- Website: Firebase Hosting
- Mobile builds: EAS Build

## Features

- Email/password, Google, and Apple authentication
- Custom status options with emoji, label, and color
- Friend connections via invite codes and shareable links
- Real-time status updates via push notifications
- Status expiration and notes
- Android and iOS home screen widgets
- Premium subscriptions via RevenueCat
- Landing page, privacy policy, and terms of service

## License

MIT

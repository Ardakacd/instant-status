# Instant Status Mobile App

React Native + Expo mobile app for Instant Status.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env` file in the mobile directory:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

3. Set up Firebase:
   - Create a Firebase project
   - Enable Phone Authentication
   - Enable Cloud Messaging
   - Add your iOS/Android apps to Firebase
   - Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)

4. Run the app:
```bash
npm start
# Then press 'i' for iOS or 'a' for Android
```

## Features

- Phone number authentication via Firebase
- Status management (FREE, BUSY, DND, SLEEP, OFFLINE)
- Friend connections via invite codes
- Real-time status updates via push notifications
- Clean, minimal UI

## Project Structure

```
src/
  config/          # Firebase and API configuration
  contexts/        # React contexts (Auth)
  screens/         # App screens
  services/        # API service layers
  types/           # TypeScript type definitions
```

## Notes

- Firebase Phone Auth requires additional setup for production
- Push notifications require proper Firebase Cloud Messaging configuration
- For testing, you may need to use Firebase's test phone numbers


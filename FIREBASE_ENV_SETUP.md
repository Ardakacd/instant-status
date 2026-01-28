# Firebase Environment Variables Setup

## Overview

You need to set **different** Firebase environment variables for the **mobile app** and the **backend** because they use different Firebase SDKs:

- **Mobile App**: Uses Firebase Client SDK (needs public config)
- **Backend**: Uses Firebase Admin SDK (needs service account credentials)

---

## 📱 Mobile App Environment Variables

**Location:** `mobile/.env`

These are the `EXPO_PUBLIC_*` variables you listed. They're used by the Firebase Client SDK in your React Native app.

```bash
# Mobile App Firebase Config (from Firebase Console > Project Settings > General)
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Optional: For Google Sign-In
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com

# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:3000
```

**Where to find these:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon)
4. Scroll down to **Your apps** section
5. Click on your web app or add a new web app
6. Copy the config values

---

## 🔧 Backend Environment Variables

**Location:** `backend/.env`

These are used by Firebase Admin SDK to verify tokens and send push notifications.

### Firebase Admin Configuration

The backend uses individual environment variables extracted from the service account JSON:

```bash
# Backend Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=instant_status

# Firebase Admin - Individual Variables (extracted from service account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Postmark Email Service (for sending transactional emails)
POSTMARK_API_KEY=your-postmark-api-key

# Server
PORT=3000
NODE_ENV=development
```

**Where to get these values:**
1. Go to Firebase Console → **Project Settings** → **Service Accounts**
2. Click **Generate New Private Key**
3. Download the JSON file
4. Extract these values from the JSON:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the BEGIN/END markers and newlines)
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

**⚠️ Important:** 
- `FIREBASE_PRIVATE_KEY` must include the full key with `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Keep the `\n` newline characters in the private key (they will be converted automatically)
- You can wrap the private key in quotes: `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`

**Postmark Setup:**
1. Sign up at [Postmark](https://postmarkapp.com/)
2. Create a server and get your API key
3. Add `POSTMARK_API_KEY` to your `.env` file
4. Verify your sender email domain in Postmark dashboard

---

## 🔑 Key Points

1. **Mobile App** (`EXPO_PUBLIC_*`):
   - Public configuration values
   - Safe to expose in client-side code
   - Used for user authentication (sign in/sign up)

2. **Backend** (`FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `POSTMARK_API_KEY`):
   - **Private** service account credentials
   - **Never** expose in client-side code
   - Used to verify tokens, send push notifications, and send emails
   - Contains admin-level permissions

3. **Project ID Must Match:**
   - The `project_id` in your service account JSON
   - The `EXPO_PUBLIC_FIREBASE_PROJECT_ID` in your mobile app
   - Must be the same Firebase project!

---

## 📋 Quick Setup Checklist

### Mobile App Setup:
- [ ] Create `mobile/.env` file
- [ ] Add all `EXPO_PUBLIC_FIREBASE_*` variables
- [ ] Add `EXPO_PUBLIC_API_URL`
- [ ] (Optional) Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for Google Sign-In

### Backend Setup:
- [ ] Create `backend/.env` file
- [ ] Download service account JSON from Firebase Console
- [ ] Extract `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_CLIENT_EMAIL` from the JSON
- [ ] Add database configuration (PostgreSQL)
- [ ] Add `POSTMARK_API_KEY` for email service
- [ ] Verify the `FIREBASE_PROJECT_ID` matches your mobile app's project ID

---

## 🧪 Testing

After setting up:

1. **Mobile App**: Should be able to sign in/sign up with Firebase (email/password, Google, or Apple)
2. **Backend**: Should log `✅ Firebase Admin initialized successfully for project: your-project-id` on startup
3. **Token Verification**: Mobile app tokens should be successfully verified by backend
4. **Email Service**: Should be able to send verification emails, password reset emails, and welcome emails


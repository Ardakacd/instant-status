import * as admin from "firebase-admin";

let firebaseAdmin: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  // Check if Firebase Admin is already initialized
  if (admin.apps.length > 0) {
    firebaseAdmin = admin.app();
    return firebaseAdmin;
  }

  // Initialize Firebase Admin using individual environment variables
  firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
  console.log(
    `✅ Firebase Admin initialized successfully`
  );
  return firebaseAdmin;
}

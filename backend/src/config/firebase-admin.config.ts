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

  // Validate required environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");

    throw new Error(
      `Firebase Admin SDK configuration is missing required environment variables: ${missing.join(", ")}\n` +
        `Please set these in your .env file. See backend/README.md for setup instructions.`
    );
  }

  // Initialize Firebase Admin using individual environment variables
  try {
    firebaseAdmin = admin.initializeApp({
      projectId: projectId,
      credential: admin.credential.cert({
        projectId,
        privateKey: privateKey.replace(/\\n/g, "\n"),
        clientEmail,
      }),
    });

    console.log("Firebase Admin initialized successfully");

    return firebaseAdmin;
  } catch (error: any) {
    console.error("❌ Firebase Admin initialization failed:", error.message);
    throw new Error(
      `Failed to initialize Firebase Admin SDK: ${error.message}\n` +
        `Please verify your FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables are correct.\n` +
        `Make sure FIREBASE_PRIVATE_KEY includes the full key with BEGIN/END markers and proper newlines.`
    );
  }
}

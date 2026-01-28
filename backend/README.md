# Instant Status Backend

NestJS backend API for the Instant Status mobile app.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up PostgreSQL database:

```bash
createdb instant_status
```

4. Configure Firebase Admin:

   **How Firebase Admin identifies your project:**

   Firebase Admin SDK identifies which Firebase project to use through the **service account JSON file**. The service account JSON contains a `project_id` field that tells Firebase Admin which project to connect to.

   **Firebase Admin Setup:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key" to download the service account JSON
   - Extract these values from the JSON and add to your `.env` file:
     ```bash
     FIREBASE_PROJECT_ID=your-project-id
     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
     ```
   - The `project_id` in the JSON tells Firebase Admin which project to use
   - Make sure `FIREBASE_PRIVATE_KEY` includes the BEGIN/END markers and newlines

5. Configure Postmark (Email Service):

   ```bash
   # Sign up at https://postmarkapp.com/
   # Create a server and get your API key
   POSTMARK_API_KEY=your-postmark-api-key
   ```

   **Important:** The project ID must match between:
   - Your Firebase mobile app configuration
   - Your Firebase Admin SDK configuration
   - This ensures tokens from the mobile app can be verified by the backend

6. Start the server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Auth

- `POST /auth/firebase-token-verify` - Verify Firebase token and get/create user
- `POST /auth/refresh-token` - Refresh user token
- `POST /auth/send-email-verification` - Send email verification link
- `POST /auth/forgot-password` - Send password reset email

### User

- `GET /user/me` - Get current user
- `PATCH /user/me` - Update current user

### Connections

- `GET /connections` - Get all connections
- `DELETE /connections/:friend_id` - Delete connection
- `PATCH /connections/:friend_id/block` - Block connection
- `PATCH /connections/:friend_id/unblock` - Unblock connection
- `PATCH /connections/:friend_id/visibility` - Update visibility
- `POST /connections/from-invite` - Create connection from invite

### Status

- `PATCH /status` - Update status
- `GET /status/friends` - Get friends' statuses

### Invite Code

- `POST /invite-code` - Generate invite code
- `POST /invite-code/redeem` - Redeem invite code

### Device Token

- `POST /device-token` - Register device token
- `DELETE /device-token/:id` - Delete device token

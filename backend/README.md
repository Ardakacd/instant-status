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

4. Set up Redis:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
brew install redis  # macOS
redis-server
```

5. Configure Firebase Admin:

   **How Firebase Admin identifies your project:**

   Firebase Admin SDK identifies which Firebase project to use through the **service account JSON file**. The service account JSON contains a `project_id` field that tells Firebase Admin which project to connect to.

   **Option 1: Service Account JSON (Recommended)**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key" to download the service account JSON
   - Set `FIREBASE_SERVICE_ACCOUNT` environment variable to the entire JSON content as a string:
     ```bash
     FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id",...}'
     ```
   - The `project_id` in the JSON tells Firebase Admin which project to use

   **Option 2: Service Account File Path**
   - Download the service account JSON file
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the file path:
     ```bash
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
     ```
   - Optionally set `FIREBASE_PROJECT_ID` explicitly:
     ```bash
     FIREBASE_PROJECT_ID=your-project-id
     ```

   **Option 3: Default Credentials (Local Development)**
   - If using Google Cloud SDK (`gcloud auth application-default login`)
   - Set `FIREBASE_PROJECT_ID` environment variable:
     ```bash
     FIREBASE_PROJECT_ID=your-project-id
     ```

   **Important:** The project ID must match between:
   - Your Firebase mobile app configuration
   - Your Firebase Admin SDK configuration
   - This ensures tokens from the mobile app can be verified by the backend

6. Run migrations (if using migrations):

```bash
npm run migration:run
```

7. Start the server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Auth

- `POST /auth/firebase-token-verify` - Verify Firebase token and get/create user
- `POST /auth/refresh-token` - Refresh user token

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

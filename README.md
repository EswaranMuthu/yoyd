# yoyd - You Own Your Data

**yoyd** (you own your data) is a multi-tenant web application that lets users browse and manage their cloud storage through a clean, simple interface. Each user gets isolated storage under `users/{username}/` in AWS S3, but sees clean paths without the prefix. Users can browse files, upload content (including large files and entire folders), create folders, and organize their cloud storage — all secured with JWT-based authentication.

**Tagline:** "You Own It. We Just Help You See It."
**Mission:** Where Data Belongs to Its Owner.

---

## High-Level System Design

```
+---------------------------------------------+
|              Client (Browser)                |
|  React 18 + TypeScript + Tailwind CSS        |
|  Vite Dev Server / Static Build              |
+----------------------+-----------------------+
                       |
                       | REST API (JSON)
                       | JWT Bearer Token Auth
                       |
+----------------------+-----------------------+
|          Backend (Express.js)                |
|  Node.js + TypeScript (ESM)                  |
|                                              |
|  +----------+  +-----------+  +----------+   |
|  | Auth     |  | S3 Object |  | Storage  |   |
|  | Service  |  | Service   |  | Layer    |   |
|  +----+-----+  +-----+-----+  +----+-----+   |
|       |              |             |          |
+-------+--------------+-------------+---------+
        |              |             |
   +----+----+    +----+----+   +----+--------+
   | JWT     |    | AWS S3  |   | PostgreSQL  |
   | Tokens  |    | Bucket  |   | Database    |
   +---------+    +---------+   +-------------+
```

---

## Features

### Multi-Tenant Storage
- Each user's files are isolated under `users/{username}/` in S3
- Users see clean paths (e.g., `/photos/` instead of `users/john/photos/`)
- All S3 operations enforce user ownership — no cross-tenant access
- User folder auto-created in S3 on first sync

### Authentication
- **Username/Password** registration and login with bcrypt password hashing
- **Google OAuth** via Google Identity Services (GIS) on frontend, `google-auth-library` on backend for ID token verification
- JWT access tokens (5 min expiry, auto-refresh) + refresh tokens (7 days, auto-rotate)
- Google-only accounts are blocked from password login

### Upload System
- **Small files (<=100MB)**: Uploaded through server via multer with XHR progress tracking
- **Large files (>100MB)**: S3 multipart upload with 10MB parts, presigned URLs, up to 3 concurrent parts
- **Folder uploads**: Uses `webkitdirectory` API and drag-and-drop with `FileSystemEntry` traversal
- **Bulk uploads**: Queue-based upload manager with per-file progress bars, cancel/retry support
- **Drag & drop**: Supports both files and folders via DataTransfer API
- **Upload panel**: Fixed bottom-right panel showing per-file status, progress, and overall progress

### File Management
- Browse files and folders with breadcrumb navigation
- Create folders, delete files/folders, download files via presigned URLs
- Sync S3 bucket contents with database metadata for fast browsing
- Image preview with keyboard navigation

### Secrets Vault
- All service credentials (AWS, Google) stored in a `secrets_vault` database table — not environment variables
- In-memory cache with 5-minute TTL for performance
- Credentials loaded lazily on first API call

### Landing Page
- Bold gradient hero with "You Own It. We Just Help You See It." tagline
- Feature cards: Multi-cloud support, bank-level security, full file control
- Registration/login popup dialog

---

## Services

### 1. Frontend Service (React SPA)

| Detail        | Value                                           |
|---------------|--------------------------------------------------|
| Framework     | React 18 with TypeScript                         |
| Router        | Wouter (lightweight client-side routing)         |
| State         | TanStack React Query v5 (server state caching)  |
| UI Library    | shadcn/ui (Radix UI primitives)                  |
| Styling       | Tailwind CSS with custom theme                   |
| Build Tool    | Vite                                             |

**Pages:**
- **Landing Page** (`/`) — Hero section with registration/login popup dialog
- **Dashboard** (`/dashboard`) — S3 file browser with upload, download, folder creation, delete, and image preview
- **404 Page** — Not found fallback

**Key Frontend Modules:**

| Module                              | Purpose                                                    |
|-------------------------------------|------------------------------------------------------------|
| `hooks/use-auth.ts`                | Authentication state, login/register/logout                |
| `hooks/use-s3.ts`                  | S3 operations (list, sync, upload, download, delete)       |
| `hooks/use-upload-manager.ts`      | Upload queue, multipart logic, progress tracking           |
| `lib/auth.ts`                      | JWT token management and authenticated fetch               |
| `lib/queryClient.ts`              | API request helper with token injection                    |

### 2. Backend Service (Express API)

| Detail        | Value                                     |
|---------------|-------------------------------------------|
| Runtime       | Node.js with Express.js                   |
| Language      | TypeScript (ESM modules)                  |
| ORM           | Drizzle ORM                               |
| Build         | esbuild (production bundling)             |

**Key Backend Modules:**

| Module                  | Purpose                                                  |
|-------------------------|----------------------------------------------------------|
| `auth/routes.ts`        | Registration, login (password + Google OAuth), token refresh, logout |
| `auth/jwt.ts`           | JWT generation, password hashing (bcrypt)                |
| `auth/middleware.ts`    | Bearer token verification middleware                     |
| `auth/storage.ts`       | User and refresh token database operations               |
| `routes.ts`             | S3 object API endpoints (including multipart upload)     |
| `s3.ts`                 | AWS S3 SDK interactions (list, upload, download, multipart) |
| `storage.ts`            | S3 object metadata database operations                   |
| `vault.ts`              | Secrets vault — loads credentials from database           |
| `helpers.ts`            | Shared utility functions (sanitization, path helpers, multipart math) |

---

## Shared Helpers (`server/helpers.ts`)

Reusable functions extracted for testability, used by both server routes and client-side tests:

| Function                  | Purpose                                            |
|---------------------------|----------------------------------------------------|
| `getUserPrefix()`         | Returns `users/{username}/` prefix                 |
| `addUserPrefix()`         | Prepends user prefix to S3 key                     |
| `stripUserPrefix()`       | Removes user prefix from S3 key                    |
| `stripPrefixFromObject()` | Strips prefix from full S3Object for client display |
| `sanitizeFileName()`      | Extracts filename from path, replaces `..` with `_` |
| `isValidFileName()`       | Rejects empty or dot-prefixed filenames            |
| `hasPathTraversal()`      | Detects `..` in paths                              |
| `computeParentKey()`      | Resolves parent folder key from relative path       |
| `calculateTotalParts()`   | Computes number of parts for multipart upload       |
| `calculatePartRange()`    | Returns byte range for a specific part number       |
| `batchPartNumbers()`      | Groups part numbers into concurrent batches         |
| `calculateOverallProgress()` | Averages progress across all uploads             |
| `cleanETag()`             | Strips surrounding quotes from S3 ETags             |

---

## Integration Between Services

```
Frontend (React)                         Backend (Express)
+-------------------+                   +-------------------+
|                   |                   |                   |
| Landing Page      |  POST /api/auth/  | Auth Service      |
|  - Register form  | ----------------> |  - Create user    |
|  - Login form     |  JWT tokens       |  - Issue JWT      |
|  - Google OAuth   | <---------------- |  - Verify Google  |
|                   |                   |    ID tokens      |
|                   |                   |                   |
| Dashboard         |  GET/POST/DELETE  | S3 Object Service |
|  - File browser   | ----------------> |  - List objects   |
|  - Upload files   |  Bearer token     |  - Presigned URLs |
|  - Folder upload  |  in header        |  - Multipart mgmt |
|  - Create folders |                   |  - Sync with S3   |
|  - Delete items   | <---------------- |  - CRUD metadata  |
|                   |   JSON responses  |                   |
+-------------------+                   +-------------------+
         |                                       |
         |                              +--------+--------+
         |                              |        |        |
         |                          +---+--+ +---+--+ +---+------+
         +-- localStorage           | JWT  | | AWS  | | Postgres |
             (tokens)               | Keys | | S3   | | Database |
                                    +------+ +------+ +----------+
```

### Authentication Flow

1. User registers or logs in via popup dialog on the landing page (password or Google OAuth)
2. Backend validates credentials (or verifies Google ID token), creates JWT access token (5 min) and refresh token (7 days)
3. Tokens stored in browser localStorage
4. Every API request includes JWT in `Authorization: Bearer <token>` header
5. Access tokens auto-refresh in background before expiry
6. Refresh tokens rotate on each use for security

### S3 Operations Flow

1. User navigates folders in the Dashboard UI
2. Frontend calls backend API with JWT authentication
3. Backend validates user ownership via `users/{username}/` prefix
4. Presigned URLs used for uploads and downloads (no files pass through server for large uploads)
5. File metadata cached in PostgreSQL for fast browsing
6. Manual sync option pulls latest state from S3 into database

### Upload Flow

1. User selects files (or drops files/folders) in Dashboard
2. Files queued in upload manager with status tracking
3. Files <=100MB: uploaded through server via multer with XHR progress
4. Files >100MB: multipart upload initiated, parts uploaded in parallel (3 concurrent) via presigned URLs
5. Per-file and overall progress displayed in upload panel
6. Users can cancel or retry individual uploads

---

## API Endpoints

### Authentication

| Method | Endpoint                    | Description                     | Auth Required |
|--------|----------------------------|---------------------------------|---------------|
| POST   | `/api/auth/register`       | Register new user                | No            |
| POST   | `/api/auth/login`          | Login with username and password | No            |
| POST   | `/api/auth/google`         | Google OAuth login               | No            |
| GET    | `/api/auth/google-client-id` | Returns Google client ID       | No            |
| POST   | `/api/auth/refresh`        | Refresh access token             | No            |
| POST   | `/api/auth/logout`         | Logout and revoke tokens         | Yes           |
| GET    | `/api/auth/user`           | Get current user info            | Yes           |

### S3 Object Management

| Method | Endpoint                            | Description                         | Auth Required |
|--------|-------------------------------------|-------------------------------------|---------------|
| GET    | `/api/objects`                      | List objects (with optional prefix)  | Yes           |
| POST   | `/api/objects/sync`                 | Sync S3 bucket with database         | Yes           |
| POST   | `/api/objects/folder`               | Create a new folder                  | Yes           |
| POST   | `/api/objects/upload`               | Upload file (server-side, <=100MB)   | Yes           |
| POST   | `/api/objects/upload-url`           | Get presigned upload URL             | Yes           |
| POST   | `/api/objects/confirm-upload`       | Confirm upload and save metadata     | Yes           |
| GET    | `/api/objects/:id/download`         | Get presigned download URL           | Yes           |
| DELETE | `/api/objects`                      | Delete one or more objects           | Yes           |

### Multipart Upload (files >100MB)

| Method | Endpoint                             | Description                           | Auth Required |
|--------|--------------------------------------|---------------------------------------|---------------|
| POST   | `/api/objects/multipart/initiate`    | Initiate S3 multipart upload          | Yes           |
| POST   | `/api/objects/multipart/presign-part`| Get presigned URL for a single part   | Yes           |
| POST   | `/api/objects/multipart/complete`    | Complete multipart upload             | Yes           |
| POST   | `/api/objects/multipart/abort`       | Abort multipart upload                | Yes           |

---

## Database Schema

### `users`
| Column           | Type      | Description                 |
|------------------|-----------|-----------------------------|
| id               | varchar   | UUID primary key            |
| username         | varchar   | Unique username (3-30 chars)|
| email            | varchar   | Unique email address        |
| password         | varchar   | Bcrypt hashed password (nullable for Google-only accounts) |
| google_id        | varchar   | Google account ID (nullable)|
| first_name       | varchar   | Optional first name         |
| last_name        | varchar   | Optional last name          |
| profile_image_url| varchar   | Optional profile image      |
| created_at       | timestamp | Account creation date       |
| updated_at       | timestamp | Last update date            |

### `refresh_tokens`
| Column     | Type      | Description                       |
|------------|-----------|-----------------------------------|
| id         | varchar   | UUID primary key                  |
| user_id    | varchar   | Foreign key to users (cascade)    |
| token      | varchar   | Unique refresh token string       |
| expires_at | timestamp | Token expiration date             |
| created_at | timestamp | Token creation date               |

### `s3_objects`
| Column        | Type      | Description                    |
|---------------|-----------|--------------------------------|
| id            | serial    | Auto-increment primary key     |
| key           | text      | Unique S3 object key           |
| name          | text      | Display name                   |
| parent_key    | text      | Parent folder key (nullable)   |
| is_folder     | boolean   | Whether this is a folder       |
| size          | bigint    | File size in bytes             |
| mime_type     | text      | MIME type of the file          |
| etag          | text      | S3 ETag for versioning         |
| last_modified | timestamp | Last modification date in S3   |
| created_at    | timestamp | Record creation date           |
| updated_at    | timestamp | Record update date             |

### `secrets_vault`
| Column     | Type      | Description                       |
|------------|-----------|-----------------------------------|
| id         | serial    | Auto-increment primary key        |
| key        | varchar   | Unique secret key name            |
| value      | text      | Encrypted secret value            |
| created_at | timestamp | Record creation date              |
| updated_at | timestamp | Record update date                |

---

## Testing

- **Framework**: Vitest
- **Test Suites**: 10
- **Total Tests**: 173
- **Run**: `npx vitest run`

| Test File                                        | Tests | Coverage Area                                      |
|--------------------------------------------------|-------|----------------------------------------------------|
| `server/auth/jwt.test.ts`                        | 15    | Token generation, password hashing                 |
| `server/auth/middleware.test.ts`                 | 6     | Auth middleware (token verification)               |
| `server/s3.test.ts`                              | 10    | S3 helper functions                                |
| `server/routes.test.ts`                          | 34    | Route validation, user prefix helpers, multipart security |
| `server/vault.test.ts`                           | 5     | Secrets vault loading and caching                  |
| `shared/routes.test.ts`                          | 19    | API route schema validation (including multipart)  |
| `client/src/lib/auth.test.ts`                    | 13    | Frontend auth utilities                            |
| `client/src/lib/auth-utils.test.ts`              | 4     | Auth utility functions                             |
| `client/src/pages/Dashboard.test.ts`             | 12    | Dashboard file utilities                           |
| `client/src/hooks/use-upload-manager.test.ts`    | 55    | Upload manager utilities, multipart logic, progress tracking |

Tests import and exercise actual production code from `server/helpers.ts` and `use-upload-manager.ts` — no duplicated logic. Coverage includes:
- Path traversal detection and filename sanitization
- Multipart part calculation, batching, and progress
- User prefix enforcement for multi-tenancy
- JWT token generation and password hashing
- API schema validation with Zod

---

## Project Structure

```
yoyd/
+-- client/                        # Frontend (React SPA)
|   +-- src/
|       +-- components/ui/         # shadcn/ui reusable components
|       +-- hooks/                 # Custom React hooks
|       |   +-- use-auth.ts        # Authentication state
|       |   +-- use-s3.ts          # S3 operations
|       |   +-- use-upload-manager.ts  # Upload queue + multipart logic
|       |   +-- use-upload-manager.test.ts  # Upload manager tests (55)
|       +-- lib/                   # Utilities (auth, API client)
|       +-- pages/                 # Page components
|       |   +-- Landing.tsx        # Landing page with hero
|       |   +-- Dashboard.tsx      # S3 file browser
|       |   +-- Dashboard.test.ts  # Dashboard tests
|       +-- App.tsx                # Root component with routing
|       +-- main.tsx               # Entry point
+-- server/                        # Backend (Express API)
|   +-- auth/                      # Authentication module
|   |   +-- jwt.ts                 # JWT and password utilities
|   |   +-- jwt.test.ts            # JWT tests
|   |   +-- middleware.ts          # Auth middleware
|   |   +-- middleware.test.ts     # Middleware tests
|   |   +-- routes.ts              # Auth API endpoints
|   |   +-- storage.ts             # User/token DB operations
|   +-- db.ts                      # Database connection (Drizzle)
|   +-- helpers.ts                 # Shared utility functions (sanitization, math, prefixes)
|   +-- index.ts                   # Express server entry point
|   +-- routes.ts                  # S3 API endpoints (including multipart)
|   +-- routes.test.ts             # Route + helper tests (34)
|   +-- s3.ts                      # AWS S3 SDK operations (including multipart)
|   +-- s3.test.ts                 # S3 helper tests
|   +-- storage.ts                 # S3 metadata DB operations
|   +-- vault.ts                   # Secrets vault (DB-backed credential store)
|   +-- vault.test.ts              # Vault tests
+-- shared/                        # Shared types and schemas
|   +-- models/auth.ts             # Drizzle schema (users, tokens, secrets_vault)
|   +-- routes.ts                  # API route type definitions (Zod)
|   +-- routes.test.ts             # Schema validation tests (19)
|   +-- schema.ts                  # Combined schema exports
+-- script/
|   +-- build.ts                   # Production build script
+-- Dockerfile                     # Multi-stage production build
+-- .github/workflows/deploy.yml   # CI/CD pipeline (GitHub Actions -> ECR -> ECS)
```

---

## Environment Variables

| Variable              | Description                          | Required |
|-----------------------|--------------------------------------|----------|
| `DATABASE_URL`        | PostgreSQL connection string          | Yes      |
| `SESSION_SECRET`      | Secret key for JWT signing            | Yes      |

Service credentials (AWS, Google) are stored in the `secrets_vault` database table, not as environment variables:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

---

## Container / ECS Deployment

| Detail        | Value                                                  |
|---------------|--------------------------------------------------------|
| Dockerfile    | Multi-stage build (deps -> builder -> prod-deps -> runner) |
| Base Image    | `node:20-slim`                                          |
| Build Output  | `dist/index.cjs` (server) + `dist/public/` (frontend)  |
| Start Command | `node dist/index.cjs`                                   |
| Port          | 5000 (configurable via `PORT` env var)                  |

### CI/CD — GitHub Actions

- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: PR merged to `main` branch
- **ECR Repository**: `pos/yoyd`
- **Pipeline**: Checkout -> Configure AWS -> Login ECR -> Build Docker image (tagged commit SHA + `latest`) -> Push to ECR -> Update ECS task definition -> Force new ECS deployment

**Required GitHub Secrets:**
- `AWS_ACCESS_KEY_ID` — IAM credentials with ECR + ECS permissions
- `AWS_SECRET_ACCESS_KEY` — IAM secret key
- `AWS_REGION` — AWS region
- `ECS_CLUSTER_NAME` — ECS cluster name
- `ECS_SERVICE_NAME` — ECS service name

**Pre-deploy**: Run `npx drizzle-kit push` against production DB before first deploy.

---

## Getting Started

1. Set `DATABASE_URL` and `SESSION_SECRET` environment variables
2. Install dependencies: `npm install`
3. Push database schema: `npm run db:push`
4. Add service credentials to `secrets_vault` table (AWS and Google keys)
5. Start development server: `npm run dev`
6. Open the app at `http://localhost:5000`
7. Run tests: `npx vitest run`

---

## Tech Stack Summary

| Layer      | Technology                                         |
|------------|-----------------------------------------------------|
| Frontend   | React 18, TypeScript, Tailwind CSS, Vite            |
| UI         | shadcn/ui, Radix UI, Lucide Icons                   |
| State      | TanStack React Query v5                             |
| Backend    | Node.js, Express.js, TypeScript (ESM)               |
| Database   | PostgreSQL, Drizzle ORM                             |
| Auth       | JWT (access + refresh tokens), bcrypt, Google OAuth  |
| Storage    | AWS S3 (presigned URLs, multipart upload)            |
| Validation | Zod schemas                                         |
| Testing    | Vitest (173 tests across 10 suites)                 |
| Deployment | Docker, AWS ECR, AWS ECS, GitHub Actions            |

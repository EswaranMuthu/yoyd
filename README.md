# yoyd - S3 Storage Browser for Photographers

**yoyd** (you own your data) is a full-stack web application that provides an elegant, colorful interface for browsing and managing AWS S3 bucket contents. Designed with photographers in mind, it lets users browse files, upload content, create folders, and organize cloud storage with a vibrant, modern UI.

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

## Services

This application runs as a **single full-stack service** with two logical layers:

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
- **Landing Page** (`/`) - Bold gradient hero with registration/login popup dialog
- **Dashboard** (`/dashboard`) - S3 file browser with upload, download, folder creation, and delete
- **404 Page** - Not found fallback

**Key Frontend Modules:**
| Module                          | Purpose                                      |
|---------------------------------|----------------------------------------------|
| `hooks/use-auth.ts`            | Authentication state, login/register/logout  |
| `hooks/use-s3.ts`              | S3 operations (list, upload, download, etc.) |
| `lib/auth.ts`                  | JWT token management and authenticated fetch |
| `lib/queryClient.ts`           | API request helper with token injection      |

### 2. Backend Service (Express API)

| Detail        | Value                                     |
|---------------|-------------------------------------------|
| Runtime       | Node.js with Express.js                   |
| Language      | TypeScript (ESM modules)                  |
| ORM           | Drizzle ORM                               |
| Build         | esbuild (production bundling)             |

**Key Backend Modules:**
| Module                  | Purpose                                          |
|-------------------------|--------------------------------------------------|
| `auth/routes.ts`        | Registration, login, token refresh, logout        |
| `auth/jwt.ts`           | JWT generation, password hashing (bcrypt)         |
| `auth/middleware.ts`    | Bearer token verification middleware              |
| `auth/storage.ts`       | User and refresh token database operations        |
| `routes.ts`             | S3 object API endpoints                           |
| `s3.ts`                 | AWS S3 SDK interactions (list, upload, download)  |
| `storage.ts`            | S3 object metadata database operations            |

---

## Integration Between Services

```
Frontend (React)                         Backend (Express)
+-------------------+                   +-------------------+
|                   |                   |                   |
| Landing Page      |  POST /api/auth/  | Auth Service      |
|  - Register form  | ----------------> |  - Create user    |
|  - Login form     |  JWT tokens       |  - Issue JWT      |
|                   | <---------------- |  - Verify tokens  |
|                   |                   |                   |
| Dashboard         |  GET/POST/DELETE  | S3 Object Service |
|  - File browser   | ----------------> |  - List objects   |
|  - Upload files   |  Bearer token     |  - Presigned URLs |
|  - Create folders |  in header        |  - Sync with S3   |
|  - Delete items   | <---------------- |  - CRUD metadata  |
|                   |   JSON responses  |                   |
+-------------------+                   +-------------------+
         |                                       |
         |                              +--------+--------+
         |                              |        |        |
         |                          +---+--+ +---+--+ +---+------+
         |                          | JWT  | | AWS  | | Postgres |
         +-- localStorage           | Keys | | S3   | | Database |
             (tokens)               +------+ +------+ +----------+
```

### Authentication Flow

1. User registers or logs in via the popup dialog on the landing page
2. Backend validates credentials, creates a JWT access token (5 min) and refresh token (7 days)
3. Tokens are stored in the browser's localStorage
4. Every API request includes the JWT in the `Authorization: Bearer <token>` header
5. Access tokens auto-refresh in the background before expiry

### S3 Operations Flow

1. User navigates folders in the Dashboard UI
2. Frontend calls backend API with JWT authentication
3. Backend communicates with AWS S3 using presigned URLs for uploads/downloads
4. File metadata is cached in PostgreSQL for fast browsing
5. Manual sync option pulls latest state from S3 into the database

---

## API Endpoints

### Authentication

| Method | Endpoint              | Description                     | Auth Required |
|--------|----------------------|----------------------------------|---------------|
| POST   | `/api/auth/register` | Register new user                | No            |
| POST   | `/api/auth/login`    | Login with email and password    | No            |
| POST   | `/api/auth/refresh`  | Refresh access token             | No            |
| POST   | `/api/auth/logout`   | Logout and revoke tokens         | Yes           |
| GET    | `/api/auth/user`     | Get current user info            | Yes           |

### S3 Object Management

| Method | Endpoint                     | Description                        | Auth Required |
|--------|-----------------------------|------------------------------------|---------------|
| GET    | `/api/objects`              | List objects (with optional prefix) | Yes           |
| POST   | `/api/objects/sync`         | Sync S3 bucket with database        | Yes           |
| POST   | `/api/objects/folder`       | Create a new folder                 | Yes           |
| POST   | `/api/objects/upload-url`   | Get presigned upload URL            | Yes           |
| POST   | `/api/objects/confirm-upload`| Confirm upload and save metadata   | Yes           |
| GET    | `/api/objects/:id/download` | Get presigned download URL          | Yes           |
| DELETE | `/api/objects`              | Delete one or more objects          | Yes           |

---

## Database Schema

### `users`
| Column           | Type      | Description              |
|------------------|-----------|--------------------------|
| id               | varchar   | UUID primary key         |
| username         | varchar   | Unique username (3-30 chars) |
| email            | varchar   | Unique email address     |
| password         | varchar   | Bcrypt hashed password   |
| first_name       | varchar   | Optional first name      |
| last_name        | varchar   | Optional last name       |
| profile_image_url| varchar   | Optional profile image   |
| created_at       | timestamp | Account creation date    |
| updated_at       | timestamp | Last update date         |

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

---

## Project Structure

```
yoyd/
+-- client/                     # Frontend (React SPA)
|   +-- src/
|       +-- components/ui/      # shadcn/ui reusable components
|       +-- hooks/              # Custom React hooks (auth, s3, toast)
|       +-- lib/                # Utilities (auth, API client)
|       +-- pages/              # Page components (Landing, Dashboard)
|       +-- App.tsx             # Root component with routing
|       +-- main.tsx            # Entry point
+-- server/                     # Backend (Express API)
|   +-- auth/                   # Authentication module
|   |   +-- jwt.ts              # JWT and password utilities
|   |   +-- middleware.ts       # Auth middleware
|   |   +-- routes.ts           # Auth API endpoints
|   |   +-- storage.ts          # User/token DB operations
|   +-- db.ts                   # Database connection (Drizzle)
|   +-- index.ts                # Express server entry point
|   +-- routes.ts               # S3 API endpoints
|   +-- s3.ts                   # AWS S3 SDK operations
|   +-- storage.ts              # S3 metadata DB operations
+-- shared/                     # Shared types and schemas
|   +-- models/auth.ts          # Drizzle schema (users, tokens)
|   +-- routes.ts               # API route type definitions (Zod)
|   +-- schema.ts               # Combined schema exports
+-- script/
|   +-- build.ts                # Production build script
```

---

## Environment Variables

| Variable              | Description                          |
|-----------------------|--------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string          |
| `SESSION_SECRET`      | Secret key for JWT signing (required) |
| `AWS_REGION`          | AWS region for S3                     |
| `AWS_ACCESS_KEY_ID`   | AWS access key                        |
| `AWS_SECRET_ACCESS_KEY`| AWS secret key                       |
| `AWS_S3_BUCKET`       | S3 bucket name                        |

---

## Getting Started

1. Set up the required environment variables listed above
2. Install dependencies: `npm install`
3. Push database schema: `npm run db:push`
4. Start development server: `npm run dev`
5. Open the app at `http://localhost:5000`

---

## Tech Stack Summary

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | React 18, TypeScript, Tailwind CSS, Vite      |
| UI         | shadcn/ui, Radix UI, Lucide Icons             |
| State      | TanStack React Query v5                       |
| Backend    | Node.js, Express.js, TypeScript               |
| Database   | PostgreSQL, Drizzle ORM                       |
| Auth       | JWT (access + refresh tokens), bcrypt          |
| Storage    | AWS S3 (presigned URLs)                       |
| Validation | Zod schemas                                   |

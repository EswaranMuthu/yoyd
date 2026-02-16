# yoyd - You Own Your Data

## Overview

yoyd (you own your data) is a multi-tenant web application that lets users browse and manage their cloud storage through a clean, simple interface. Each user has isolated storage under `users/{username}/` in S3 but sees clean paths without the prefix. Users can browse files, upload content, create folders, and organize their cloud storage with JWT-based authentication (username/password and Google OAuth).

**Tagline:** "You Own It. We Just Help You See It."
**Mission:** Where Data Belongs to Its Owner.

## User Preferences

Preferred communication style: Simple, everyday language.
Non-technical, user-friendly copy preferred for all public-facing text.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration
- **Build Tool**: Vite with React plugin

The frontend follows a page-based architecture with reusable components in `client/src/components/ui/`. Custom hooks in `client/src/hooks/` handle authentication state (`use-auth.ts`) and S3 operations (`use-s3.ts`).

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts`
- **Build**: esbuild for production bundling with selective dependency bundling

The server handles API requests through Express middleware, with routes registered in `server/routes.ts`. Authentication middleware protects API endpoints, and the S3 module (`server/s3.ts`) provides direct AWS S3 SDK interactions.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`, `shared/models/auth.ts`
- **Migrations**: Drizzle Kit with `db:push` command
- **Tables**:
  - `users`: User accounts (supports password and Google OAuth)
  - `refresh_tokens`: JWT refresh tokens with expiry and rotation
  - `s3_objects`: Cached metadata about S3 objects for efficient browsing

The storage layer (`server/storage.ts`) provides database abstraction with CRUD operations for S3 object metadata. Auth storage (`server/auth/storage.ts`) handles user and token operations.

### Authentication
- **Method**: JWT (JSON Web Tokens) with username/password and Google OAuth
- **Token Storage**: LocalStorage (client-side)
- **Access Token Expiry**: 5 minutes (auto-refreshes)
- **Refresh Token Expiry**: 7 days (auto-rotates on use)
- **Implementation**: Located in `server/auth/`
- **Google OAuth**: Uses Google Identity Services (GIS) on frontend, google-auth-library on backend for ID token verification
- **Key Endpoints**:
  - `POST /api/auth/register` - User registration
  - `POST /api/auth/login` - User login (blocked for Google-only accounts)
  - `POST /api/auth/google` - Google OAuth login (verifies ID token, creates/links user)
  - `GET /api/auth/google-client-id` - Returns Google client ID for frontend
  - `POST /api/auth/refresh` - Refresh access token
  - `POST /api/auth/logout` - Ends session
  - `GET /api/auth/user` - Returns current user info (requires Bearer token)

### API Structure
Routes are type-defined in `shared/routes.ts` using Zod schemas for validation. Key endpoints:
- `GET /api/objects` - List S3 objects
- `POST /api/objects/sync` - Sync S3 bucket with database
- `POST /api/objects/folder` - Create folder
- `POST /api/objects/upload-url` - Get presigned upload URL
- `POST /api/objects/download-url` - Get presigned download URL
- `DELETE /api/objects` - Delete objects

### Testing
- **Framework**: Vitest
- **Test Files**: 9 test suites, 94 tests
- **Coverage**: JWT utilities, S3 helpers, auth middleware, frontend auth/file utilities, API route validation, secrets vault
- **Run**: `npx vitest run`
- **Key Test Files**:
  - `server/auth/jwt.test.ts` - Token generation, password hashing
  - `server/auth/middleware.test.ts` - Auth middleware
  - `server/s3.test.ts` - S3 helper functions
  - `server/routes.test.ts` - Route validation and user prefix helpers
  - `server/vault.test.ts` - Secrets vault loading and caching
  - `client/src/lib/auth.test.ts` - Frontend auth utilities
  - `client/src/lib/auth-utils.test.ts` - Auth utility functions
  - `client/src/pages/Dashboard.test.ts` - Dashboard file utilities
  - `shared/routes.test.ts` - Shared route schema validation

## External Dependencies

### Secrets Vault
- **Location**: `server/vault.ts`
- **Storage**: `secrets_vault` database table (defined in `shared/models/auth.ts`)
- **Caching**: In-memory cache with 5-minute TTL, cleared via `clearVaultCache()`
- **Usage**: All service credentials (AWS, Google) are loaded from the vault at runtime, not from environment variables
- **Keys stored**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### AWS S3
- **SDK**: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
- **Credentials**: Loaded from secrets_vault database table (not environment variables)
- **Initialization**: Lazy — S3 client is created on first API call using vault secrets

### Database
- **Provider**: PostgreSQL (Neon, Supabase, or similar)
- **Required Environment Variable**: `DATABASE_URL`

### Multi-Tenancy
- All S3 operations scoped to `users/{username}/` prefix per user
- Helper functions `addUserPrefix()`, `stripUserPrefix()`, `stripPrefixFromObject()` in `server/routes.ts`
- Users see clean paths (e.g., `/photos/` instead of `users/john/photos/`)
- Download and delete operations validate user ownership before proceeding
- User folder auto-created in S3 on first sync

### Authentication
- **Provider**: JWT (username/password + Google OAuth)
- **Google Credentials**: Loaded from secrets_vault database table (not environment variables)
- **Required Environment Variables**:
  - `SESSION_SECRET`

### Container / ECS Deployment
- **Dockerfile**: Multi-stage build (deps -> builder -> prod-deps -> runner)
- **Base Image**: `node:20-slim`
- **Build**: `npm run build` produces `dist/index.cjs` (server) + `dist/public/` (frontend)
- **Start**: `node dist/index.cjs` (serves both API and static frontend on port 5000)
- **Runtime Env Vars**: `DATABASE_URL`, `SESSION_SECRET`, `PORT` (defaults to 5000)
- **Service Credentials**: Stored in `secrets_vault` database table (not env vars)
- **DB Migration**: Run `npx drizzle-kit push` against production DB before first deploy

### Landing Page
- **Tagline**: "You Own It. We Just Help You See It."
- **Subtitle**: "Where Data Belongs to Its Owner."
- **Feature Cards**:
  - "Works With Your Cloud" - Multi-cloud support (Amazon, Google, Microsoft)
  - "Your Files, Locked Down" - Bank-level security messaging
  - "Full Control" - Upload, download, create folders, delete files

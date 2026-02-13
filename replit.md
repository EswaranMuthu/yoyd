# yoyd - S3 Storage Browser

## Overview

yoyd (you own your data) is a multi-tenant web application that provides a beautiful interface for browsing and managing AWS S3 bucket contents. Each user has isolated storage under `users/{username}/` in S3 but sees clean paths without the prefix. Users can browse files, upload content, create folders, and organize cloud storage with JWT-based username/password authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Drizzle Kit with `db:push` command
- **Tables**:
  - `sessions`: Stores user session data (required for Replit Auth)
  - `users`: User profile information from Replit Auth
  - `s3_objects`: Cached metadata about S3 objects for efficient browsing

The storage layer (`server/storage.ts`) provides database abstraction with CRUD operations for S3 object metadata.

### Authentication
- **Method**: JWT (JSON Web Tokens) with username/password
- **Token Storage**: LocalStorage (client-side)
- **Access Token Expiry**: 5 minutes (auto-refreshes)
- **Refresh Token Expiry**: 7 days
- **Implementation**: Located in `server/auth/`
- **Key Endpoints**:
  - `POST /api/auth/register` - User registration
  - `POST /api/auth/login` - User login
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

## External Dependencies

### AWS S3
- **SDK**: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
- **Required Environment Variables**:
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_S3_BUCKET`

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
- **Provider**: JWT (username/password)
- **Required Environment Variables**:
  - `SESSION_SECRET`
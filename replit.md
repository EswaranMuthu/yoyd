# yoyd - You Own Your Data

## Overview

yoyd (you own your data) is a multi-tenant web application that lets users browse and manage their cloud storage through a clean, simple interface. Each user has isolated storage under `users/{username}/` in S3 but sees clean paths without the prefix. Users can browse files, upload content, create folders, share files via secure links, and organize their cloud storage with JWT-based authentication (username/password and Google OAuth). The app is fully responsive across mobile, tablet, and desktop devices.

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
  - `users`: User accounts (supports password and Google OAuth), includes `total_storage_bytes` (bigint) for current storage and `monthly_consumed_bytes` (bigint) for cumulative upload tracking per billing cycle
  - `billing_records`: Monthly billing history per user (year, month, consumed_bytes, free_bytes, billable_bytes, cost_cents); unique constraint on (user_id, year, month)
  - `refresh_tokens`: JWT refresh tokens with expiry and rotation
  - `s3_objects`: Cached metadata about S3 objects for efficient browsing
  - `file_shares`: File sharing records (shareId, userId, s3ObjectId, expiresAt, isRevoked)

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
- `POST /api/objects/upload` - Upload file (server-side, up to 100MB via multer)
- `POST /api/objects/upload-url` - Get presigned upload URL
- `POST /api/objects/confirm-upload` - Confirm upload and upsert DB metadata
- `GET /api/objects/:id/download` - Get presigned download URL
- `DELETE /api/objects` - Delete objects
- `POST /api/objects/multipart/initiate` - Initiate S3 multipart upload (for files >100MB)
- `POST /api/objects/multipart/presign-part` - Get presigned URL for a multipart part
- `POST /api/objects/multipart/complete` - Complete multipart upload
- `POST /api/objects/multipart/abort` - Abort multipart upload

### File Sharing
- **Create share**: `POST /api/shares` - Generate a shareable link for a file (with optional expiration)
- **List shares**: `GET /api/shares` - List all shares created by the current user ("Shared by Me")
- **Revoke share**: `DELETE /api/shares/:shareId` - Revoke a shared link
- **Public download**: `GET /api/shares/:shareId/download` - Public endpoint for downloading shared files (no auth required)
- **Frontend**: Share dialog in Dashboard, "Shared by Me" section, public download page at `/share/:shareId`
- **Database Table**: `file_shares` (shareId, userId, s3ObjectId, expiresAt, isRevoked, createdAt)

### Upload System
- **Small files (<=100MB)**: Uploaded through server via multer with XHR progress tracking
- **Large files (>100MB)**: S3 multipart upload with 10MB parts, presigned URLs, up to 3 concurrent parts
- **Folder uploads**: Uses webkitdirectory API and drag-and-drop with FileSystemEntry traversal
- **Bulk uploads**: Queue-based upload manager with per-file progress bars, cancel/retry support
- **Drag & drop**: Supports both files and folders via DataTransfer API
- **Upload panel**: Fixed bottom-right panel showing per-file status, progress, and overall progress
- **Key files**: `client/src/hooks/use-upload-manager.ts` (queue + multipart logic), `server/s3.ts` (S3 multipart helpers)

### Testing
- **Framework**: Vitest
- **Test Files**: 13 test suites, 217 tests
- **Coverage**: JWT utilities, S3 helpers, auth middleware, frontend auth/file utilities, API route validation, secrets vault, multipart upload schemas, upload manager utilities, billing cost calculation, Stripe vault integration, database schema validation
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
  - `client/src/hooks/use-upload-manager.test.ts` - Upload manager utilities, multipart logic, progress tracking
  - `server/billing.test.ts` - Billing cost calculation, free tier, overage pricing
  - `server/stripe.test.ts` - Stripe vault integration, API call validation, error paths
  - `shared/models/auth.test.ts` - Database schema validation for all tables

### Usage-Based Billing (Stripe)
- **Model**: Cumulative consumption — tracks total bytes uploaded per month (uploads + re-uploads, not reduced by deletions)
- **Free Tier**: 5 GB/month free
- **Overage**: $0.10/GB (rounded up) billed at end of month
- **Stripe Integration**: `server/stripe.ts` — lazy-initialized Stripe client using `STRIPE_SECRET_KEY` from secrets vault
- **Billing Job**: `server/billing.ts` — `runMonthlyBilling(year, month)` processes all users, creates billing records, charges via Stripe invoices, resets counters; fully idempotent
- **Payment Flow**: Dashboard shows banner when user exceeds free tier without a card → Stripe Checkout (setup mode) → card saved → invoices auto-charged
- **API Endpoints**:
  - `POST /api/stripe/checkout-session` — Creates Stripe Checkout session for adding payment method
  - `GET /api/stripe/payment-status` — Returns billing status (hasCard, exceededFreeTier, monthlyConsumedBytes, needsPaymentMethod)
  - `POST /api/stripe/webhook` — Handles Stripe webhook events (checkout.session.completed, invoice.paid, invoice.payment_failed)
- **Database Tables**: `billing_records` (year, month, freeBytes, billableBytes, costCents, stripeInvoiceId); `users.stripeCustomerId`, `users.monthlyConsumedBytes`
- **Frontend**: Dashboard billing banner in `client/src/pages/Dashboard.tsx` — shows warning when payment needed, confirmation when card on file

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

### CI/CD - GitHub Actions
- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: PR merged to `main` branch
- **ECR Repository**: `pos/yoyd`
- **Pipeline Steps**:
  1. Checkout code
  2. Configure AWS credentials
  3. Log in to Amazon ECR
  4. Build Docker image (tagged with commit SHA + `latest`)
  5. Push image to ECR
  6. Update ECS task definition with new image
  7. Force new deployment on ECS service
- **Required GitHub Secrets**:
  - `AWS_ACCESS_KEY_ID` - IAM credentials with ECR + ECS permissions
  - `AWS_SECRET_ACCESS_KEY` - IAM secret key
  - `AWS_REGION` - AWS region (e.g. `us-east-1`)
  - `ECS_CLUSTER_NAME` - ECS cluster name
  - `ECS_SERVICE_NAME` - ECS service name
- **Required IAM Permissions**:
  - ECR: `GetAuthorizationToken`, `BatchCheckLayerAvailability`, `PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`
  - ECS: `DescribeServices`, `DescribeTaskDefinition`, `RegisterTaskDefinition`, `UpdateService`
  - IAM: `PassRole` (to pass task execution role to ECS)

### Responsive Design
- **Breakpoints**: Tailwind CSS — sm (640px), md (768px), lg (1024px)
- **Mobile**: Sidebar hidden (`hidden md:flex`), mobile header shown (`md:hidden`) with menu toggle & profile icon
- **Tablet**: 2-column grid for feature/pricing cards
- **Desktop**: Full sidebar, 4-column feature cards, side-by-side pricing cards
- **Upload panel**: Full-width on mobile, 384px fixed on sm+
- **Image preview**: Compact controls with icon-only download on mobile

### Landing Page
- **Tagline**: "You Own It. We Just Help You See It."
- **Subtitle**: "Where Data Belongs to Its Owner."
- **Nav Bar**: Logo, Pricing (smooth-scroll link), Sign In, Get Started
- **Hero Pricing Teaser**: "5 GB free every month · then just $0.10/GB" — clickable, scrolls to pricing section
- **Feature Cards** (4-column on desktop, 2x2 on tablet, stacked on mobile):
  - "Works With Your Cloud" - Multi-cloud support (Amazon, Google, Microsoft)
  - "Your Files, Locked Down" - Bank-level security messaging
  - "Full Control" - Upload, download, create folders, delete files
  - "Share Securely" - Share files via secure links with expiration and revoke
- **Pricing Section** (id="pricing"):
  - Free Tier card: 5 GB at $0/month with feature list
  - Pay As You Go card: $0.10/GB beyond 5 GB, highlighted with amber badge

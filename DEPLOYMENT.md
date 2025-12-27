# Deployment Guide

## Railway Deployment

This application is configured to deploy to Railway using Docker.

### Prerequisites

1. Railway account
2. Railway CLI (optional): `npm i -g @railway/cli`

### Deployment Steps

#### Option 1: Deploy via Railway Dashboard

1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Railway will automatically detect the Dockerfile and build

#### Option 2: Deploy via Railway CLI

```bash
# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

### Required Environment Variables

Set these in your Railway project settings:

```bash
# VAX Credentials
VAX_USERNAME=your_username
VAX_PASSWORD=your_password
VAX_ARC_NUMBER=your_arc_number

# Pricing Configuration
PRICING_MARKUP_PERCENTAGE=15

# Session Configuration
SESSION_TTL_HOURS=24

# Playwright Configuration (optional)
PLAYWRIGHT_HEADLESS=true

# Port (Railway sets this automatically)
PORT=3000
```

### Database Setup

The application uses SQLite with Prisma. The database file will be created automatically on first run using `prisma db push`.

**Note:** SQLite data will be ephemeral on Railway unless you use a persistent volume. For production, consider:
- Using Railway's persistent volumes
- Migrating to PostgreSQL (Railway provides PostgreSQL databases)
- Using an external database service

### Post-Deployment

1. Check logs: `railway logs` or view in Railway dashboard
2. Visit your deployed URL (provided by Railway)
3. The application will:
   - Generate Prisma Client
   - Create the database schema
   - Start the Bun server on the configured PORT

### Troubleshooting

**Build fails:**
- Check that all environment variables are set
- Review build logs in Railway dashboard

**Database issues:**
- Ensure Prisma is generating the client correctly
- Check that the database schema is being created

**Port issues:**
- Railway automatically sets the PORT environment variable
- The app reads from `process.env.PORT` (defaults to 3000)

### Dockerfile Overview

The Dockerfile uses a multi-stage build:
1. **base** - Sets up Bun runtime
2. **install** - Installs dependencies (dev and production separately)
3. **prerelease** - Builds the TypeScript code and generates Prisma Client
4. **release** - Final minimal image with only production dependencies and built code

### Performance Considerations

- The app runs on Bun for optimal performance
- TypeScript is compiled to JavaScript during build
- Production image only includes necessary files
- Static assets (CSS, HTML) are included in the final image

### Scaling

Railway supports:
- Horizontal scaling (multiple instances)
- Vertical scaling (more CPU/memory)
- Auto-scaling based on load

Configure in Railway dashboard under Settings → Resources.

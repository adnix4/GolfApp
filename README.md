# Multiservice Application

Complete multi-service project structure with:
- **Backend**: ASP.NET Core Web API (port 5000)
- **Database**: PostgreSQL (port 5432)
- **Frontend**: Next.js webpage (port 3000)
- **Mobile**: React Native Expo app

## Quick Start

### Prerequisites
- Docker & Docker Compose
- .NET SDK 8.0 (for local development)
- Node.js 20+ (for frontend development)

### Running with Docker Compose

```bash
cd multiservice-app
docker compose up --build
```

Access:
- API Swagger: http://localhost:5000/swagger
- Frontend: http://localhost:3000
- API Health: http://localhost:5000/api/health

### Running in Development Mode

For hot reload on file changes:

```bash
docker compose up --develop
```

### Development Setup

#### Backend (ASP.NET Core)
```bash
cd backend
dotnet restore
dotnet run
```

#### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

#### Mobile (React Native Expo)
```bash
cd mobile
npm install
npm start
```

## Project Structure

```
multiservice-app/
├── backend/           # ASP.NET Core Web API
│   ├── Dockerfile
│   ├── Program.cs
│   ├── WebAPI.csproj
│   └── Controllers/
├── frontend/          # Next.js web application
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   └── pages/
├── mobile/            # React Native Expo mobile app
│   ├── App.js
│   ├── app.json
│   └── package.json
├── docker-compose.yml # Orchestration
└── .env              # Environment variables
```

## Services

### PostgreSQL
- Default credentials: appuser / apppassword
- Database: appdb
- Port: 5432
- Data persists via named volume: postgres_data

### API (ASP.NET Core)
- Health check endpoint: GET /api/health
- Sample endpoint: GET /api/sample
- CORS enabled for all origins
- Swagger/OpenAPI documentation

### Frontend (Next.js)
- Server-side rendering support
- Environment variable: NEXT_PUBLIC_API_URL
- Connected to API on startup

### Mobile (React Native Expo)
- Can run with: npm start
- Supports Android, iOS, and Web
- Environment variable: EXPO_PUBLIC_API_URL

## Useful Commands

```bash
# Build all services
docker compose build

# Start services in background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Clean up volumes
docker compose down -v
```

## Notes

- The database connection string is configured for PostgreSQL integration
- API is configured with CORS for cross-origin requests
- Environment variables are centralized in .env
- Hot reload is configured with docker compose watch
- All services are on the same network for internal communication

# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# apps/api/Dockerfile — Golf Fundraiser Pro API
# ─────────────────────────────────────────────────────────────────────────────
#
# MULTI-STAGE BUILD STRATEGY:
#   Stage 1 (build)    — uses the full .NET 10 SDK image (large, ~700MB)
#                         to restore packages and compile the application.
#   Stage 2 (runtime)  — uses the minimal ASP.NET runtime image (~200MB)
#                         to run the compiled binary.
#
#   The final Docker image is ~200MB instead of ~700MB because the build
#   tools (dotnet CLI, MSBuild, etc.) are NOT included in the runtime stage.
#   A smaller image means faster deploys and a smaller attack surface.
#
# BUILD CONTEXT:
#   Docker is run from the repo root: `docker build -f apps/api/Dockerfile .`
#   The build context is the monorepo root so the Dockerfile can COPY
#   from both apps/api/ and packages/ if needed.
#
# USED BY:
#   • .github/workflows/deploy-api.yml — builds this image for production deploy
#   • Local: `docker build -f apps/api/Dockerfile -t gfp-api .`
#            `docker run -p 5000:5000 --env-file .env.local gfp-api`
#
# SIX LABORS LICENSE (ImageSharp >= 3.2):
#   The Release publish below fails without a license key. It arrives as a
#   BuildKit SECRET, never a build-arg: build-args are recorded in the image
#   history, and the image is pushed from a public repo. The secret is visible
#   only to the one RUN that mounts it and is not written to any layer.
#     CI:    deploy-api.yml passes secrets.SIXLABORS_LICENSE_KEY
#     Local: SixLaborsLicenseKey=<key> docker build --secret \
#              id=sixlabors_license_key,env=SixLaborsLicenseKey \
#              -f apps/api/Dockerfile -t gfp-api .
#            (or keep apps/api/sixlabors.lic — gitignored — which COPY picks
#             up in the build stage only; the runtime stage never sees it)
# ─────────────────────────────────────────────────────────────────────────────

# ── STAGE 1: BUILD ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

# Copy only the project file first and restore dependencies.
# Docker caches this layer — if only .cs files change (not .csproj),
# the restore step is skipped on the next build, saving 30-60 seconds.
COPY apps/api/WebAPI.csproj ./apps/api/
RUN dotnet restore apps/api/WebAPI.csproj

# Now copy all source files and publish
COPY apps/api/ ./apps/api/

WORKDIR /src/apps/api

# dotnet publish:
#   -c Release       → optimized build (no debug symbols, no dev tools)
#   -o /app/publish  → output directory
#   --no-restore     → skip restore (already done above)
#   secret mount     → exposes the license as $SixLaborsLicenseKey for this
#                      RUN only (see SIX LABORS LICENSE above)
RUN --mount=type=secret,id=sixlabors_license_key,env=SixLaborsLicenseKey \
    dotnet publish -c Release -o /app/publish --no-restore

# ── STAGE 2: RUNTIME ──────────────────────────────────────────────────────────
# Use the ASP.NET runtime image (not SDK) — much smaller, no build tools.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

# Copy the published output from the build stage.
# Only the compiled DLLs and static assets — not source code.
COPY --from=build /app/publish .

# ── ENVIRONMENT ───────────────────────────────────────────────────────────────
# Set the environment to Production by default.
# Railway/Render will override this with their own environment variables.
ENV ASPNETCORE_ENVIRONMENT=Production

# Listen on port 5000 on all interfaces (0.0.0.0) inside the container.
# Railway/Render map their external port to this internal port.
ENV ASPNETCORE_URLS=http://+:5000

EXPOSE 5000

# ── HEALTH CHECK ──────────────────────────────────────────────────────────────
# No Docker HEALTHCHECK on purpose. The aspnet runtime image ships without
# curl/wget, so the old `CMD curl -f …/api/health` could never succeed and the
# container would only ever report "unhealthy". Railway ignores Dockerfile
# HEALTHCHECKs anyway: set the service's Healthcheck Path to /api/health in
# Railway → Service → Settings for zero-downtime deploys.

# ── ENTRYPOINT ────────────────────────────────────────────────────────────────
# Run the compiled API binary. The assembly name matches AssemblyName in .csproj.
ENTRYPOINT ["dotnet", "GolfFundraiserPro.Api.dll"]

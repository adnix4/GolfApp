-- ─────────────────────────────────────────────────────────────────────────────
-- 01-enable-postgis.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHEN THIS RUNS:
--   Docker executes every file in /docker-entrypoint-initdb.d/ exactly ONCE,
--   when the container is first created with a FRESH (empty) data volume.
--   Files are executed in alphabetical order, hence the "01-" prefix.
--
-- WHY THIS FILE EXISTS:
--   The EF Core Phase1_InitialSchema migration also runs:
--     migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS postgis;")
--   This init script is a BELT-AND-SUSPENDERS safety net.  If a developer
--   connects to the database before running migrations (e.g. to inspect the
--   empty schema), PostGIS is already enabled so nothing breaks.
--
-- WHY "IF NOT EXISTS":
--   Safe to run multiple times — won't error if PostGIS is already enabled.
--   This matters if the volume is shared or the script is run manually.
--
-- WHAT PostGIS ENABLES:
--   The GEOGRAPHY data type used in:
--     courses.location            GEOGRAPHY(Point,4326)       — course location
--     course_holes.cup_location   GEOGRAPHY(PointZ,4326)      — pin GPS (Phase 6)
--     scores.drive_location       GEOGRAPHY(Point,4326)       — drive GPS (Phase 6)
--     scores.ball_location        GEOGRAPHY(Point,4326)       — ball GPS (Phase 6)
--
--   SRID 4326 = WGS-84 coordinate system (standard GPS lat/lon).
--   Without PostGIS, CREATE TABLE with GEOGRAPHY columns fails entirely.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable the PostGIS extension in the golf_fundraiser database.
-- This provides GEOGRAPHY, GEOMETRY types and spatial functions like ST_Distance.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable the PostGIS topology extension (needed for advanced spatial operations).
-- Not strictly required for Phase 1-5 but enables Phase 6 GPS features without
-- a database restart.
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify the installation by selecting the PostGIS version.
-- This will appear in the Docker container startup logs, confirming success.
-- If PostGIS is not installed, this query would fail with "function not found".
DO $$
BEGIN
  RAISE NOTICE 'PostGIS version: %', PostGIS_Version();
  RAISE NOTICE 'Golf Fundraiser Pro database initialized successfully.';
END
$$;

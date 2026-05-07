CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name character varying(200) NOT NULL,
  format text NOT NULL,
  handicap_system text NOT NULL,
  handicap_formula jsonb NOT NULL DEFAULT '{"type":"BestNofM","n":5,"m":10}',
  handicap_cap double precision NOT NULL DEFAULT 36.0,
  max_flights smallint NOT NULL DEFAULT 1,
  dues_cents integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "IX_leagues_org_id" ON leagues(org_id);

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY,
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name character varying(200) NOT NULL,
  total_rounds smallint NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status character varying(50) NOT NULL DEFAULT 'Draft',
  rounds_counted smallint NOT NULL DEFAULT 0,
  standing_method character varying(50) NOT NULL DEFAULT 'TotalNet',
  created_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "IX_seasons_league_id" ON seasons(league_id);

CREATE TABLE IF NOT EXISTS flights (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name character varying(100) NOT NULL,
  min_handicap double precision,
  max_handicap double precision
);
CREATE INDEX IF NOT EXISTS "IX_flights_season_id" ON flights(season_id);

CREATE TABLE IF NOT EXISTS league_rounds (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  round_date date NOT NULL,
  status text NOT NULL,
  notes character varying(500)
);
CREATE INDEX IF NOT EXISTS "IX_league_rounds_season_id" ON league_rounds(season_id);

CREATE TABLE IF NOT EXISTS league_members (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id uuid,
  flight_id uuid REFERENCES flights(id) ON DELETE SET NULL,
  first_name character varying(100) NOT NULL,
  last_name character varying(100) NOT NULL,
  email character varying(254) NOT NULL,
  handicap_index double precision NOT NULL,
  dues_paid boolean NOT NULL DEFAULT false,
  rounds_played smallint NOT NULL DEFAULT 0,
  absences smallint NOT NULL DEFAULT 0,
  status text NOT NULL,
  joined_at timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_league_members_season_id_email_unique" ON league_members(season_id, email);

CREATE TABLE IF NOT EXISTS league_pairings (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES league_rounds(id) ON DELETE CASCADE,
  group_number smallint NOT NULL,
  member_ids jsonb NOT NULL DEFAULT '[]',
  tee_time time without time zone,
  starting_hole smallint,
  is_locked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "IX_league_pairings_round_id" ON league_pairings(round_id);

CREATE TABLE IF NOT EXISTS league_scores (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES league_rounds(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES league_members(id) ON DELETE RESTRICT,
  hole_number smallint NOT NULL,
  gross_score smallint NOT NULL,
  net_score smallint NOT NULL,
  stableford_points smallint NOT NULL
);
CREATE INDEX IF NOT EXISTS "IX_league_scores_round_member" ON league_scores(round_id, member_id);

CREATE TABLE IF NOT EXISTS handicap_history (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  round_id uuid REFERENCES league_rounds(id) ON DELETE SET NULL,
  old_index double precision NOT NULL,
  new_index double precision NOT NULL,
  differential double precision NOT NULL,
  admin_override boolean NOT NULL DEFAULT false,
  reason character varying(500),
  created_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "IX_handicap_history_member_id" ON handicap_history(member_id);

CREATE TABLE IF NOT EXISTS standings (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  flight_id uuid REFERENCES flights(id) ON DELETE SET NULL,
  member_id uuid NOT NULL REFERENCES league_members(id) ON DELETE RESTRICT,
  total_points integer NOT NULL DEFAULT 0,
  net_strokes integer NOT NULL DEFAULT 0,
  season_avg_net double precision NOT NULL DEFAULT 0.0,
  rounds_played smallint NOT NULL DEFAULT 0,
  rank smallint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_standings_season_member_unique" ON standings(season_id, member_id);

CREATE TABLE IF NOT EXISTS skins (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES league_rounds(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL,
  winner_member_id uuid REFERENCES league_members(id) ON DELETE SET NULL,
  pot_cents integer NOT NULL DEFAULT 0,
  carried_over_from_hole smallint
);
CREATE INDEX IF NOT EXISTS "IX_skins_round_id" ON skins(round_id);

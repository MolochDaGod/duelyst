-- Grudge card registry (Duelyst Codex SSOT for duelyst.grudge-studio.com).
-- Not a player bag: ownership stays in Railway user_cards. This is the card
-- definition + art index every game/tool joins against by Grudge UUID.

CREATE TABLE IF NOT EXISTS grudge_cards (
  uuid          TEXT PRIMARY KEY,                 -- CARD-<epoch>-<seqHex>-<md5:8>
  source_key    TEXT NOT NULL UNIQUE,             -- stable mint key, e.g. duelyst:boss_andromeda
  source        TEXT NOT NULL,                    -- duelyst | season-1 | grudawars
  slug          TEXT NOT NULL,                    -- original catalog id
  name          TEXT NOT NULL,
  faction       TEXT,
  role          TEXT,
  kind          TEXT,                             -- troop | building | hero
  rarity        TEXT,
  cost          INTEGER,
  attack        INTEGER,
  health        INTEGER,
  range_text    TEXT,                             -- "Melee" or a numeric range
  speed         TEXT,
  effect        TEXT,
  keywords      TEXT DEFAULT '[]',                -- JSON array
  ability_names TEXT DEFAULT '[]',                -- JSON array
  passive       TEXT,
  play_styles   TEXT DEFAULT '[]',                -- JSON array of {key,on}
  anims         TEXT DEFAULT '[]',                -- JSON array of clip names
  clip_count    INTEGER DEFAULT 0,                -- animations backed by real frames
  frame_total   INTEGER DEFAULT 0,                -- sum of frames across clips
  kits          TEXT DEFAULT '[]',                -- JSON array (core/caster/projectile)
  vfx           TEXT DEFAULT '{}',                -- JSON object
  art_window    TEXT DEFAULT '{}',                -- {x,y,w,h} frame art hole
  card_json     TEXT NOT NULL,                    -- full denormalised row
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grudge_cards_source  ON grudge_cards(source);
CREATE INDEX IF NOT EXISTS idx_grudge_cards_faction ON grudge_cards(faction);
CREATE INDEX IF NOT EXISTS idx_grudge_cards_role    ON grudge_cards(role);
CREATE INDEX IF NOT EXISTS idx_grudge_cards_slug    ON grudge_cards(slug);
CREATE INDEX IF NOT EXISTS idx_grudge_cards_name    ON grudge_cards(name);

-- Every image/sheet/plist/chrome asset a card needs, keyed by Grudge UUID.
CREATE TABLE IF NOT EXISTS grudge_card_art (
  card_uuid TEXT NOT NULL REFERENCES grudge_cards(uuid),
  slot      INTEGER NOT NULL,                     -- draw order within the card
  role      TEXT NOT NULL,                        -- sheet | plist | portrait | mint | clip:<name> | fx | frame | background
  url       TEXT NOT NULL,                        -- absolute CDN URL
  PRIMARY KEY (card_uuid, slot)
);

CREATE INDEX IF NOT EXISTS idx_grudge_card_art_uuid ON grudge_card_art(card_uuid);
CREATE INDEX IF NOT EXISTS idx_grudge_card_art_role ON grudge_card_art(role);

-- Every animation clip a card can play, with the frame data needed to slice the
-- packed sheet: counts come from the source TexturePacker plists, not guesses.
CREATE TABLE IF NOT EXISTS grudge_card_clips (
  card_uuid TEXT NOT NULL REFERENCES grudge_cards(uuid),
  slot      INTEGER NOT NULL,                     -- play order within the card
  name      TEXT NOT NULL,                        -- idle | run | attack | projectile | cast* | ...
  label     TEXT,                                 -- display label ("Cast start")
  frames    INTEGER,                              -- frame count (NULL when unknown)
  loop      INTEGER DEFAULT 0,                    -- 1 when the clip loops
  w         INTEGER,                              -- max frame width
  h         INTEGER,                              -- max frame height
  first_x   INTEGER,                              -- first frame rect on the sheet
  first_y   INTEGER,
  first_w   INTEGER,
  first_h   INTEGER,
  PRIMARY KEY (card_uuid, slot)
);

CREATE INDEX IF NOT EXISTS idx_grudge_card_clips_uuid ON grudge_card_clips(card_uuid);
CREATE INDEX IF NOT EXISTS idx_grudge_card_clips_name ON grudge_card_clips(name);

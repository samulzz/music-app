-- Execute manually in MySQL (spring.jpa.hibernate.ddl-auto=none)

CREATE TABLE IF NOT EXISTS playlists (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(1200) NULL,
    icon_url VARCHAR(500) NULL,
    global_playlist BIT(1) NOT NULL DEFAULT b'1',
    PRIMARY KEY (id)
);

-- If playlists table already existed from an older version, ensure required columns are present.
ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS description VARCHAR(1200) NULL;

ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500) NULL;

ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS global_playlist BIT(1) NOT NULL DEFAULT b'1';

-- Backfill null flags for legacy rows.
UPDATE playlists
SET global_playlist = b'1'
WHERE global_playlist IS NULL;

CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id BIGINT NOT NULL,
    song_id BIGINT NOT NULL,
    PRIMARY KEY (playlist_id, song_id),
    CONSTRAINT fk_playlist_songs_playlist
        FOREIGN KEY (playlist_id) REFERENCES playlists (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_playlist_songs_song
        FOREIGN KEY (song_id) REFERENCES songs (id)
        ON DELETE CASCADE
);
ALTER TABLE playlists
    ADD COLUMN owner_id BIGINT NULL;

CREATE INDEX idx_playlists_owner_id ON playlists(owner_id);

ALTER TABLE playlists
    ADD CONSTRAINT fk_playlists_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE;

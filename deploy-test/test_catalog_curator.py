import unittest

from catalog_curator import matching_song, merge_tracks, normalized, primary_artist


class CatalogCuratorTests(unittest.TestCase):
    def test_accent_insensitive(self):
        self.assertEqual(normalized("Forró e Piseiro"), "forro e piseiro")

    def test_match_title_and_primary_artist(self):
        songs = [{"id": 1, "title": "Coração", "artist": "MC Ana, MC Bia"},
                 {"id": 2, "title": "Coração", "artist": "Outra Pessoa"}]
        self.assertEqual(matching_song({"title": "Coração", "artist": "MC Ana"}, songs)["id"], 1)
        self.assertEqual(primary_artist("MC Ana, MC Bia"), "MC Ana")

    def test_never_match_different_title_or_ambiguous_version(self):
        songs = [{"id": 1, "title": "Canção Ao Vivo", "artist": "Ana"},
                 {"id": 2, "title": "Canção", "artist": "Ana"}]
        self.assertEqual(matching_song({"title": "Canção", "artist": "Ana"}, songs)["id"], 2)
        self.assertIsNone(matching_song({"title": "Canção", "artist": "Ana"}, songs[1:] * 2))

    def test_artist_name_needs_word_boundaries(self):
        self.assertIsNone(matching_song({"title": "Canção", "artist": "Ana"},
                                        [{"title": "Canção", "artist": "Anabelle"}]))

    def test_old_chart_tracks_remain_pending(self):
        old = [{"spotifyId": "old", "title": "Antiga", "artist": "Ana"}]
        current = [{"spotifyId": "new", "title": "Nova", "artist": "Ana"}]
        self.assertEqual([track["spotifyId"] for track in merge_tracks(old, current)], ["new", "old"])


if __name__ == "__main__":
    unittest.main()

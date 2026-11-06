import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("precache_audio_candidates", ROOT / "deploy-test/precache_spotify_playlist.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class AudioCandidateTests(unittest.TestCase):
    def test_rejects_reported_wrong_versions(self):
        for title, source in [
            ("Sumi", '[ FREE ] Alee x Lywie "Sumi pra ficar" [Prod.NC]'),
            ("Beatriz", "2ZDinizz Beatriz Ao Vivo Alma Festival"),
            ("Invisível pt.2", "VEIGH Invisível Pt.2 8D AUDIO"),
            ("EXAGERADO", "EXAGERADO Áudio Oficial COYOTE PRÉVIAS"),
        ]:
            with self.subTest(source=source):
                self.assertTrue(module.mismatched_version(module.normalize(title), module.normalize(source)))

    def test_respects_explicit_requested_versions(self):
        for title in ["Beatriz Ao Vivo", "Song Instrumental", "Free Beat", "Song 8D", "Song Remix"]:
            self.assertFalse(module.mismatched_version(module.normalize(title), module.normalize(title)))

    def test_official_artist_audio_is_not_rejected(self):
        self.assertFalse(module.mismatched_version("sumi", "lywie kizuato sumi official visualizer"))
        self.assertFalse(module.mismatched_version("invisivel pt 2", "veigh invisivel pt 2"))

    def test_marker_does_not_match_inside_other_words(self):
        self.assertFalse(module.mismatched_version("believer", "believer official audio"))

if __name__ == "__main__":
    unittest.main()

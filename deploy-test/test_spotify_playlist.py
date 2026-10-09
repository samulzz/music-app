import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class SpotifyPlaylistLimitTests(unittest.TestCase):
    def test_import_limit_does_not_silently_drop_to_200(self):
        spec = importlib.util.spec_from_file_location(
            'spotify_playlist_test_module', Path(__file__).with_name('spotify_playlist.py'))
        module = importlib.util.module_from_spec(spec)
        stub = types.ModuleType('spotify_scraper')
        stub.SpotifyClient = object
        with patch.dict(sys.modules, {'spotify_scraper': stub}):
            spec.loader.exec_module(module)
        self.assertEqual(249, module.read_limit('249'))
        self.assertEqual(1000, module.read_limit('1000'))
        self.assertEqual(200, module.read_limit())
        self.assertEqual(1, module.read_limit('0'))
        self.assertEqual(1000, module.read_limit('1001'))


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import patch

from app import check_python


class PythonVersionTests(unittest.TestCase):
    def test_runtime_range_matches_patched_image_dependencies(self):
        for version in [(3, 9), (3, 10), (3, 13)]:
            with self.subTest(version=version), patch('app.sys.version_info', version):
                self.assertIn('3.11 - 3.12', check_python())
        for version in [(3, 11), (3, 12)]:
            with self.subTest(version=version), patch('app.sys.version_info', version):
                self.assertIsNone(check_python())

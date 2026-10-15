import os
import tempfile
import unittest
from pathlib import Path

# Use an isolated database location for tests that need DB access.
tmp = tempfile.TemporaryDirectory()
os.environ['DATABASE_PATH'] = str(Path(tmp.name) / 'test.sqlite3')
os.environ['QUARANTINE_DIR'] = str(Path(tmp.name) / 'quarantine')

from app.main import normalize_url, local_heuristics, init_db, check_url

def tearDownModule():
    tmp.cleanup()


class UrlValidationTests(unittest.TestCase):
    def test_add_https_scheme(self):
        url, error = normalize_url('example.com/path')
        self.assertIsNone(error)
        self.assertEqual(url, 'https://example.com/path')

    def test_tracking_parameters_removed(self):
        url, error = normalize_url('https://example.com/?utm_source=x&keep=1&fbclid=y')
        self.assertIsNone(error)
        self.assertIn('keep=1', url)
        self.assertNotIn('utm_source', url)
        self.assertNotIn('fbclid', url)

    def test_javascript_scheme_rejected(self):
        url, error = normalize_url('javascript:alert(1)')
        self.assertIsNone(url)
        self.assertIsNotNone(error)

    def test_embedded_credentials_rejected(self):
        url, error = normalize_url('https://user:password@example.com/login')
        self.assertIsNone(url)
        self.assertEqual(error, 'embedded_credentials')

    def test_private_address_is_dangerous(self):
        result = local_heuristics('http://127.0.0.1:8080')
        self.assertEqual(result['verdict'], 'dangerous')

    def test_suspicious_words_raise_review(self):
        result = local_heuristics('https://example.com/secure-login/verify-account')
        self.assertEqual(result['verdict'], 'suspicious')

    def test_clean_heuristic_does_not_claim_safe(self):
        result = local_heuristics('https://example.com/docs')
        self.assertEqual(result['verdict'], 'unverified')

    def test_reserved_local_host_not_public(self):
        result = local_heuristics('https://intranet.local')
        self.assertEqual(result['verdict'], 'dangerous')


if __name__ == '__main__':
    unittest.main()

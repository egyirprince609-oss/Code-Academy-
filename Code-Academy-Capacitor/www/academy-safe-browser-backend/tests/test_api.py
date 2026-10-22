"""API smoke tests that do not require live search, Google Web Risk, or ClamAV services."""
import os
import tempfile
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ['DATABASE_PATH'] = str(Path(_TMP.name) / 'academy-test.sqlite3')
os.environ['QUARANTINE_DIR'] = str(Path(_TMP.name) / 'quarantine')
os.environ['SEARXNG_URL'] = 'http://127.0.0.1:1'
os.environ['SEARCH_TIMEOUT_SECONDS'] = '0.2'
os.environ['CLAMAV_HOST'] = '127.0.0.1'
os.environ['CLAMAV_PORT'] = '1'
os.environ['ADMIN_TOKEN'] = 'test-admin-token'
os.environ.pop('WEBRISK_API_KEY', None)
os.environ.pop('BRAVE_SEARCH_API_KEY', None)

from fastapi.testclient import TestClient
from app.main import app, get_db


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        _TMP.cleanup()

    def test_health_has_no_secret_values(self):
        r = self.client.get('/api/health')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body['ok'])
        self.assertNotIn('WEBRISK_API_KEY', str(body))

    def test_non_match_without_webrisk_is_unverified(self):
        r = self.client.post('/api/url-check', json={'url': 'https://example.com/docs'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['verdict'], 'unverified')
        self.assertEqual(r.json()['live_check'], 'unavailable')

    def test_loopback_url_is_dangerous(self):
        r = self.client.post('/api/url-check', json={'url': 'http://127.0.0.1:8080'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['verdict'], 'dangerous')

    def test_report_drops_query_string_before_storage(self):
        r = self.client.post('/api/reports', json={
            'url': 'https://example.com/login?token=private-value',
            'category': 'phishing', 'details': 'test report'
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'pending_review')
        with get_db() as conn:
            row = conn.execute('SELECT url FROM reports WHERE id=?', (r.json()['report_id'],)).fetchone()
        self.assertIsNotNone(row)
        self.assertNotIn('token=', row['url'])
        self.assertNotIn('private-value', row['url'])

    def test_custom_dns_only_validates_format_and_does_not_fetch(self):
        good = self.client.post('/api/dns/test', json={
            'provider': 'custom', 'custom_endpoint': 'https://dns.example.net/dns-query'
        })
        self.assertEqual(good.status_code, 200)
        self.assertTrue(good.json()['format_valid'])
        self.assertIsNone(good.json()['reachable'])
        bad = self.client.post('/api/dns/test', json={
            'provider': 'custom', 'custom_endpoint': 'http://127.0.0.1:8080/dns-query'
        })
        self.assertEqual(bad.status_code, 422)

    def test_admin_can_review_and_manually_block_reported_domain(self):
        report = self.client.post('/api/reports', json={
            'url': 'https://fake-login.example.net/path', 'category': 'phishing', 'details': 'test'
        })
        report_id = report.json()['report_id']
        r = self.client.post('/api/admin/reports/' + report_id + '/review',
            headers={'X-Admin-Token': 'test-admin-token'},
            json={'status': 'reviewed', 'add_domain_to_blocklist': True, 'admin_note': 'confirmed in test'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['domain_blocked'])
        blocked = self.client.post('/api/url-check', json={'url': 'https://fake-login.example.net/path'})
        self.assertEqual(blocked.json()['verdict'], 'dangerous')

    def test_search_returns_graceful_fallback_when_provider_offline(self):
        r = self.client.post('/api/search', json={
            'query': 'Python documentation', 'mode': 'web', 'page': 1,
            'safe_search': True, 'language': 'en'
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['fallback'])
        self.assertEqual(r.json()['results'], [])

    def test_executable_upload_is_quarantined_by_default(self):
        r = self.client.post('/api/downloads/scan', files={
            'file': ('sample.apk', b'not-a-real-apk-test-content', 'application/octet-stream')
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['verdict'], 'blocked')
        self.assertTrue(r.json()['quarantined'])


if __name__ == '__main__':
    unittest.main()

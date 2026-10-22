# Security reporting

Do not send passwords, one-time codes, account recovery codes, API keys, or private browsing data in a link report.

For a suspected vulnerability in Academy Safe Browser, contact the project maintainer through a verified Academy support channel. Provide the affected endpoint, impact, and minimal reproduction steps; do not upload real personal data or active malware samples to a public issue.

The API is intended to be deployed behind HTTPS and a host firewall. Keep `.env`, the SQLite database, the quarantine volume, and administrator tokens private. Never expose the ClamAV port or SearXNG container directly to the public internet.

# Tenant email integration

The mail workspace is tenant-scoped. Each tenant owns its mailbox configuration, stored messages, sync settings, and SMTP credentials. Credentials are encrypted at rest with AES-256-GCM using a dedicated environment key.

## Supported capabilities

- SMTP sending with SMTP AUTH PLAIN, implicit TLS (typically 465), and STARTTLS on port 587 when implicit TLS is disabled.
- Incoming mail retrieval using IMAP or POP3, with recent-message sync capped at 50 per run.
- IMAP uses the selected folder (default INBOX); POP3 retrieval does not delete messages from the remote server.
- Tenant mailbox create/edit/remove, SMTP test email, manual sync, automatic sync, inbox/sent views, local search, message read status, starred status, and local deletion.
- Role enforcement on server endpoints: owner/admin manage mailboxes and send; manager reads and sends; member read-only.
- Mail records are tenant-scoped; account credentials are never included in API account responses.
- Message deduplication uses the remote Message-ID, falling back to a stable content hash, scoped by tenant and account.

## Common connection settings

| Service | Connection mode | Common port |
| --- | --- | ---:|
| IMAP | Implicit TLS | 993 |
| POP3 | Implicit TLS | 995 |
| POP3 | Plain mode | 110 |
| SMTP | Implicit TLS | 465 |
| SMTP | STARTTLS | 587 |

Incoming IMAP and POP3 currently use implicit TLS only (IMAP 993, POP3 995); incoming STARTTLS on 143/110 is not implemented. SMTP STARTTLS is attempted on port 587 when the SMTP secure checkbox is disabled. The secure checkbox selects implicit TLS. Plaintext connections are rejected.

## Dashboard

Dashboard → Mail. Configure each mailbox with incoming IMAP/POP3 details and outgoing SMTP details. Editing keeps the mailbox address immutable and permits replacing passwords without returning existing secrets. The automatic sync toggle is per mailbox. Message deletion is local to Bee-Core; it does not delete the original remote email. POP3 does not remove remote messages.

## API

All endpoints require an authenticated dashboard session and derive tenant identity from the validated persisted session:


- GET /mail/accounts
- POST /mail/accounts
- PATCH /mail/accounts/:id
- DELETE /mail/accounts/:id
- POST /mail/accounts/:id/test (sends a test message to the mailbox's own address)
- POST /mail/accounts/:id/sync
- GET /mail/messages?accountId=&folder=&limit=&skip=&unread=
- GET /mail/messages/:id
- PATCH /mail/messages/:id (read/starred)
- DELETE /mail/messages/:id
- POST /mail/send

## Environment

Set BEE_MAIL_ENCRYPTION_KEY to a dedicated random secret at least 32 characters long (64 hexadecimal characters recommended). Do not reuse JWT or MFA keys. Generate a key with:


```sh
openssl rand -hex 32
```

BEE_MAIL_SYNC_INTERVAL_SECONDS defaults to 300 and is clamped to a minimum of 60. Production Compose requires the encryption key. Keep a secure backup of this key: without it, saved mailbox passwords cannot be decrypted.

## Known limitations and release gate

This is a basic mail client integration, not a full Outlook/Gmail replacement. MIME decoding is rudimentary: HTML message rendering, attachment extraction/upload, inline images, charset decoding, threading, remote folder discovery, IMAP UID cursor tracking, remote sent-folder reconciliation, OAuth2 (Google/Microsoft), queue/retry/dead-letter handling, bounce and spam management are not implemented. IMAP/POP3 parsing uses lightweight protocol handling and must be validated against actual providers. The branch has not been built or tested against live mail providers or undergone a security review. Do not expose the service publicly or use it for production mail until those checks pass.

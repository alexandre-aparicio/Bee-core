# Tenant email integration

This feature branch adds a first implementation of mailbox connectivity in Bee-Core. Mailbox configuration, messages and permissions are tenant-scoped.

## Protocol support

- **SMTP outgoing:** authenticated SMTP AUTH PLAIN; implicit TLS (usually port 465) and STARTTLS on port 587.
- **IMAP incoming:** secure or plaintext IMAP, account-configured folder (default INBOX), fetches recent messages.
- **POP3 incoming:** secure or plaintext POP3, retrieves the latest 50 messages. POP3 messages are not deleted from the source mailbox.

Common ports:
| Protocol | TLS | Typical port |
| --- | --- | ---:|
| IMAP | implicit TLS | 993 |
| POP3 | implicit TLS | 995 |
| SMTP | implicit TLS | 465 |
| SMTP | STARTTLS | 587 |

SMTP STARTTLS is used only when SMTP TLS is unchecked and the SMTP port is set to 587. SMTP secure enabled uses implicit TLS. Other plaintext port choices send credentials over the unencrypted connection and should not be used outside controlled test environments.

## Dashboard

A new Dashboard > Notifications > Mail page supports:
- mailbox account creation for IMAP/POP3 + SMTP credentials
- account selection, inbox and sent-folder view
- refresh and manual sync
- search over locally stored message headers/text
- message reading, mark-as-read and delete from Bee-Core local storage
- compose, recipient/CC, subject and send through the selected SMTP mailbox

Account management is available to tenant owner/admin; managers can read and send; members are read-only. These are server-enforced role permissions, not only UI controls.

## API

All routes require a valid dashboard bearer session. Tenant identity is resolved from the persisted session; route queries are tenant-filtered.

- `GET /mail/accounts`
- `POST /mail/accounts`
- `PATCH /mail/accounts/:id`
- `DELETE /mail/accounts/:id`
- `POST /mail/accounts/:id/test` (sends a test email to the account's own address)
- `POST /mail/accounts/:id/sync`
- `GET /mail/messages?accountId=&folder=&limit=&skip=&unread=`
- `GET /mail/messages/:id`
- `PATCH /mail/messages/:id` (read/starred)
- `DELETE /mail/messages/:id`
- `POST /mail/send`

## Environment

Set a dedicated `BEE_MAIL_ENCRYPTION_KEY` (at least 32 characters; 64 hex characters recommended) to encrypt stored incoming/outgoing account passwords using AES-256-GCM. Do not reuse JWT or MFA secrets. Configure `BEE_MAIL_SYNC_INTERVAL_SECONDS`; it is clamped to at least 60 seconds and defaults to 300 seconds. Production Compose requires the encryption key.

Generate a key, for example:

```sh
openssl rand -hex 32
```

## Important limitations / pre-release status

The implementation is an initial integration and has not yet been compiled, tested against real providers, or security-reviewed. MIME parsing is basic (no proper MIME multipart/charset decoding, attachment extraction, inline images, HTML rendering, or thread grouping). IMAP command parsing is minimal and folder synchronization is not complete. The dashboard currently exposes account creation, but not full account editing/deletion UI. OAuth2 flows for Google and Microsoft, send queue/retries, bounce handling, spam controls, attachment upload, sent-folder reconciliation, sync cursors/UID tracking, folder discovery, and provider-specific app-password setup are not implemented. Use test accounts only until the protocol implementation is validated and hardened.

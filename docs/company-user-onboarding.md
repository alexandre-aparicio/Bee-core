# Company user onboarding (future implementation)

This document specifies the future user-creation experience for a company (tenant), such as **Torasemida**. It is a design reference only: the two onboarding flows described here are **not being integrated in this change**. No credentials, invitation emails, registration forms, or token lifecycle are implemented by this documentation commit.

## Who can create company users?

- **Company Owner**: manages the company and can create, invite, suspend, and manage its members.
- **Company Admin**: may be allowed the same user-management operations through permissions granted by the owner.
- **Manager**: manages their assigned team only if a specific permission is granted; no default company-wide user creation.
- **Employee**: regular company account; cannot create company users by default.
- **Guest / External**: limited account for explicitly granted access; no user administration by default.
- **Platform Superadmin**: platform-level identity. It is not a company member type and must not appear as an option in a company's Add User form.

User type and team membership are separate from custom role assignment. User type supplies a sensible starting role/permission profile; the owner can assign an available custom role separately, subject to the authorization model.

## Organization → Users screen

When the authenticated owner opens the company context (e.g. Torasemida) and selects **Organization → Users → Add user**, the form should provide two creation methods:

1. **Create account** — the company administrator enters the user's name, email, user type, optional team and optional custom role, and sets a temporary password.
2. **Send invitation** — the company administrator enters the user's email, optionally selects the intended user type/team/custom role, and sends a time-limited invitation. The invited person completes registration themselves.

The initial UI should clearly label the method and display a short explanation before proceeding. The company context must remain visible so the user understands which tenant is receiving the new member.

## Flow A — Add a user with a temporary password

1. The owner/admin enters the required identity details (at minimum email; display name/name fields as supported), chooses a company user type, and optionally assigns a team/custom role.
2. They set a temporary password and confirm it.
3. The account is created as a member of the currently active company only; no membership or company access is inferred from email.
4. The administrator can deliver the credentials to the new user through a secure channel. Avoid exposing the password in logs or audit events.
5. The new user can sign in using the temporary credentials.

**Deferred requirement:** a future first-login password-change gate should force the user to replace the temporary password before accessing the normal dashboard. This first-login reset behavior is explicitly out of scope for the initial implementation of these onboarding flows.

## Flow B — Invitation with expiring token and self-registration

1. The owner/admin enters the email address and optionally selects the target user type, team and custom role.
2. Bee-Core creates a pending invitation associated with the company and the inviter, with a cryptographically random, high-entropy token. Persist only a hash of the token, not the raw secret.
3. Send a registration link by email containing the token. The link opens a dedicated invitation-registration page, not the regular login screen.
4. The invited person validates the invitation, provides the required registration details, and chooses their own password.
5. The server verifies that the invitation exists, is pending, has not expired, has not been used or revoked, and that the company remains eligible/active. Consume the invitation atomically to prevent concurrent/replay registration.
6. On successful registration, create/activate the account and its company membership with the invitation's approved user type/team/role; then mark the invitation accepted. The person can sign in using their chosen password.

### Invitation states and controls

Recommended lifecycle:
- **Pending** — issued, not yet accepted, still within expiry.
- **Accepted** — successfully redeemed; no longer usable.
- **Expired** — expiry timestamp has passed.
- **Revoked** — owner/admin canceled the invitation.

The Users UI should show invitation state, sent-to email, inviter, created/expiry dates, and allow authorized admins to resend (issuing a new token and invalidating the previous one) or revoke. Resend throttling and duplicate-pending-invitation behavior should be defined during implementation.

### Token and registration security requirements

- Tokens must be generated with a cryptographically secure random source, be single-use, and have configurable expiry (suggested initial default: 72 hours; final value to be selected during implementation).
- Store only a token hash; never log or display the token after issuance except within the registration link at send time.
- Validate token expiry, status, company state and membership/role assignment server-side.
- Consume the token atomically and reject replay, revoked, expired, malformed, or already accepted tokens.
- Apply rate limiting to invitation creation, resend and registration attempts; prevent email enumeration on the public registration endpoint.
- Do not allow the invitee to change company, user type or role beyond the options authorized by the inviter/invitation.
- Audit invitation create/resend/revoke/accept events without recording raw tokens, passwords or secrets.

## Shared form and membership behavior

Both methods should create a user membership within the currently selected company, not a platform identity. Common fields/choices may include user type, team and custom role. Account status and invitation state should be represented distinctly: a pending invite is not an active user session. A company owner must not be able to create a platform superadministrator through this screen.

## Explicitly not implemented in this documentation change

- Temporary-password account creation and credential delivery.
- Forced password change on first login.
- Email delivery/provider configuration for invitations.
- Invitation token generation, storage, expiration, revocation, resend or redemption.
- Public invitation registration form and validation endpoint.
- Activation and membership creation driven by invitation redemption.
- UI wiring, backend APIs, database models, tests and security review.

These are future implementation tasks. This specification does not change current authentication or organization functionality.

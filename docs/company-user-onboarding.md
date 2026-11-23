# Company user onboarding

This specification is reconciled against the current `main` branch. Company membership management and token-based invitations already exist in the backend/UI; a new Superadmin-only **Admin → Users** overview has now been added to the Glass, Midnight and Paper dashboard shells. It documents onboarding methods but does not create users or send emails. Manual account creation with a temporary password and email delivery of invitations remain future work. This document separates implemented behavior from deferred requirements so it does not imply features that are not present.

## Who can create company users?

- **Company Owner**: manages the company and can create, invite, suspend, and manage its members.
- **Company Admin**: may be allowed the same user-management operations through permissions granted by the owner.
- **Manager**: manages their assigned team only if a specific permission is granted; no default company-wide user creation.
- **Employee**: regular company account; cannot create company users by default.
- **Guest / External**: limited account for explicitly granted access; no user administration by default.
- **Platform Superadmin**: platform-level identity. It is not a company member type and must not appear as an option in a company's Add User form.

User type and team membership are separate from custom role assignment. User type supplies a sensible starting role/permission profile; the owner can assign an available custom role separately, subject to the authorization model.

## Organization → Users: current baseline

The shared Organization → Users screen now renders the existing membership component in Glass, Midnight and Paper. It supports listing company memberships, updating membership roles (including Guest), suspending memberships, creating custom roles (owner), creating/copying invitation tokens, accepting an invitation token and cancelling pending invitations. Invitation creation currently returns a one-time token for the administrator to copy and share manually; the UI says it expires after seven days. This is not email-based delivery and does not provide an invitation-email registration experience.

Current company membership roles in the implementation include `owner`, `admin`, `manager`, `member`, and custom roles. `guest` is now a built-in membership role. It receives only `plugins.read` by default, cannot administer members or invitations, and is available in invitation and membership role assignment. Platform `superadmin` remains a platform-level identity and must not be offered as a company user type.

### Planned Add User entry point

When the owner opens the company context (e.g. Torasemida) and selects **Organization → Users → Add user**, future UI work should present two distinct choices:

1. **Create account with temporary password** — administrator enters the user's identity, selects company membership role/type, optional team and custom role, and sets a temporary password.
2. **Invite by email** — administrator enters email and optional membership role/type, team/custom role; Bee-Core sends an invitation email containing a time-limited registration link. The invitee sets their own password.

The active company must be visibly identified; both methods must create membership in that tenant only. The email-based invitation flow extends the existing token invitation baseline rather than replacing it.

## Flow A — Add a user with a temporary password

1. The owner/admin enters the required identity details (at minimum email; display name/name fields as supported), chooses a company user type, and optionally assigns a team/custom role.
2. They set a temporary password and confirm it.
3. The account is created as a member of the currently active company only; no membership or company access is inferred from email.
4. The administrator can deliver the credentials to the new user through a secure channel. Avoid exposing the password in logs or audit events.
5. The new user can sign in using the temporary credentials.

**Deferred requirement:** a future first-login password-change gate should force the user to replace the temporary password before accessing the normal dashboard. This first-login reset behavior is explicitly out of scope for the initial implementation of these onboarding flows.

## Flow B — Invitation token (partially implemented; email delivery is future work)

Current behavior: the owner/admin creates an invitation from the company Users screen, receives a one-time acceptance token, and must copy/share it manually. The current UI states a seven-day expiry. A recipient uses the existing invitation acceptance endpoint with the token to join the company; the UI instructs them to select the company in the workspace switcher afterward.

Future email-based flow requirements:
1. The owner/admin enters the email and chooses the allowed membership role/type and optional team/custom role.
2. Bee-Core sends a registration/invitation email with a registration link carrying the token (or a securely handled token reference).
3. The invitee opens a dedicated registration flow and sets their own password.
4. The server validates pending status, expiry, usage/revocation and company eligibility, then atomically consumes the invitation.
5. Successful redemption activates the invited account/membership using the invitation's approved company and role assignments.

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

## Future work / deferred features

- Add a manual **Create user** form and backend path that creates a company membership with a temporary password.
- Deliver temporary credentials securely; never log secrets. A mandatory password-change-on-first-login is explicitly deferred for now.
- Configure email delivery and implement invitation email/link delivery. Existing token creation, acceptance and cancellation remain the baseline; verify the current token-storage and expiry implementation before modifying it.
- Add the self-service invitation registration page and password creation only if the current accept-token endpoint does not already cover the intended UX.
- Align the platform Superadmin identity with a first-class Super Organization membership. The current platformRole/superadmin bootstrap remains platform-scoped and is not yet enrolled as an organization membership; this is required before the Super Organization can use the same organization member-management model.
- Add end-to-end UI/backend tests for both onboarding paths, tenant isolation, token replay/expiry and secret redaction.

These are future implementation tasks. This specification does not change current authentication or organization functionality.

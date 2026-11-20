# Platform Superadministrator

Bee-Core distinguishes platform administration from tenant/company administration.

## Bootstrap identity
The configured `AUTH_ADMIN_EMAIL` bootstrap account is marked with the persisted `platformRole: "superadmin"` during auth-plugin initialization. Existing account password and other account fields are not overwritten by the bootstrap upsert. Login and refresh responses expose the platform role, and JWTs carry it.

## Global endpoints
- `GET /platform/me`: verify platform superadministrator access.
- `GET /platform/companies`: list companies with active member counts.
- `POST /platform/companies`: create a company and assign an existing user as owner, or create an owner account when an initial password is provided.
- `PATCH /platform/companies/:companyId`: set company status to `active` or `suspended`.

All endpoints require a dashboard JWT with a session id and validate the session against MongoDB, plus an enabled user whose persisted platform role is superadmin. Company membership/role permissions do not grant platform access.

## Dashboard
Platform administration panel is displayed to the authenticated account when login response includes `platformRole: superadmin`. It supports listing companies, creation, and activation/suspension.

## Verification
Automated integration tests cover bootstrap login, platform identity, company create/list/status, and tenant-user denial. GitHub Actions CI must pass before merging.

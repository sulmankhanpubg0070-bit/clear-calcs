# Roadmap

- [x] Add and deploy secure MongoDB data function, storage adapter, serialized saves and matching summary password/data access; isolation tests pass and original tree remains visible
- [x] Connect using the owner-approved existing credential to Familyloveable and copy original saved data/password without overwriting existing records; live MongoDB readback and wrong-password rejection verified
- [ ] Verify a new admin edit saves and reads back through the UI — requires the owner's existing admin password session; migration write succeeded, but no admin credentials are available for this check

- [x] Add working About, Contact and Stats buttons, with the owner's contact number
- [x] Verify public dialogs, contact links and live family statistics

- [x] Enable email/password auth on Cloud backend
- [x] Migration: profiles + user_roles (admin) + has_role + first-user-admin bootstrap
- [x] Admin login button in header right corner (email/password dialog)
- [x] Admin panel after admin login (member management)
- [x] Restyle "All members" menu button as round icon button
- [x] Home/End keyboard shortcuts: jump to first/last member of current tree level
- [x] Password-only secure admin login
- [x] Full website management panel for members, relationships, and website settings
- [x] Shared website data with public viewing and admin-only changes
- [ ] Verify signed-in admin panel flow — requires the website owner's admin password session
- [x] Add admin-only AI Gateway family summary with generation, refresh, and errors
- [x] Verify real AI Gateway output from saved tree and unauthorized endpoint rejection
- [ ] Verify summary generation through signed-in admin panel — requires the website owner's admin password session

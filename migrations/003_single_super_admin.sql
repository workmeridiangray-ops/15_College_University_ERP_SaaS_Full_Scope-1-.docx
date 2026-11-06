-- At most one platform super admin; also closes the race between two simultaneous first-run setups.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_super_admin ON users (role) WHERE role = 'super_admin';

-- Initialization script: idempotent role & privilege setup
-- Note: databases are created by the postgres image using POSTGRES_DB env; do not recreate here.

-- Create user 'postgres' if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH LOGIN PASSWORD 'password';
    END IF;
    RAISE NOTICE 'Role setup done';
END
$$;

-- Grant privileges on databases if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'orders_db') THEN
        EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', 'orders_db', 'postgres');
    END IF;
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'products_db') THEN
        EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', 'products_db', 'postgres');
    END IF;
END
$$;

-- Make role superuser if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        ALTER ROLE postgres SUPERUSER;
    END IF;
END
$$;


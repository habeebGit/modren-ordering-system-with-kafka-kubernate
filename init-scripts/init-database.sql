-- Create databases
CREATE DATABASE orders_db;
CREATE DATABASE products_db;

-- Create users if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH LOGIN PASSWORD 'password';
    END IF;
        -- Log successful initialization
    RAISE NOTICE 'Database initialized successfully';
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE orders_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE products_db TO postgres;
ALTER ROLE postgres SUPERUSER;


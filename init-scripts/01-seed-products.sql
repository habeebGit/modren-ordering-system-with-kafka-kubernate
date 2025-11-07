-- Create products table if it doesn't exist
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    category VARCHAR(255),
    description TEXT,
    "reservedStock" INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample products
INSERT INTO products (name, price, stock, category, description) VALUES
('MacBook Pro 16"', 2499.99, 15, 'Electronics', 'Apple MacBook Pro with M2 Max chip'),
('iPhone 15 Pro', 999.99, 25, 'Electronics', 'Latest iPhone with titanium design'),
('AirPods Pro', 249.99, 50, 'Electronics', 'Active noise cancellation wireless earbuds'),
('iPad Air', 599.99, 30, 'Electronics', '10.9-inch iPad with M1 chip'),
('Apple Watch Series 9', 399.99, 40, 'Electronics', 'Advanced health and fitness tracking'),
('Magic Keyboard', 179.99, 20, 'Accessories', 'Wireless keyboard for Mac and iPad'),
('Studio Display', 1599.99, 8, 'Electronics', '27-inch 5K Retina display'),
('Mac Mini', 699.99, 12, 'Electronics', 'Compact desktop computer with M2 chip')
ON CONFLICT DO NOTHING;
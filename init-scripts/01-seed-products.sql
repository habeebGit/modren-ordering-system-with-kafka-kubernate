-- Create products table if it doesn't exist
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample products
INSERT INTO products (name, price, stock, description) VALUES
('MacBook Pro 16"', 2499.99, 15, 'Apple MacBook Pro with M2 Max chip'),
('iPhone 15 Pro', 999.99, 25, 'Latest iPhone with titanium design'),
('AirPods Pro', 249.99, 50, 'Active noise cancellation wireless earbuds'),
('iPad Air', 599.99, 30, '10.9-inch iPad with M1 chip'),
('Apple Watch Series 9', 399.99, 40, 'Advanced health and fitness tracking'),
('Magic Keyboard', 179.99, 20, 'Wireless keyboard for Mac and iPad'),
('Studio Display', 1599.99, 8, '27-inch 5K Retina display'),
('Mac Mini', 699.99, 12, 'Compact desktop computer with M2 chip')
ON CONFLICT DO NOTHING;
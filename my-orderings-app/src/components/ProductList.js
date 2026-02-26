import React from 'react';
import ProductCard from './ProductCard';

const ProductList = ({ products, onAddToCart }) => {
  return (
    <div className="product-list">
      <h2>🛍️ Available Products</h2>
      <div className="products-grid">
        {products.length === 0 ? (
          <div className="empty-state">
            <p>No products available</p>
          </div>
        ) : (
          products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={onAddToCart}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ProductList;
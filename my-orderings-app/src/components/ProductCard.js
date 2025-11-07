import React from 'react';

const ProductCard = ({ product, onAddToCart }) => {
  const isOutOfStock = !product.stock || product.stock <= 0;

  return (
    <div className="product-card">
      <div className="product-info">
        <h3>{product.name}</h3>
        <p className="price">${product.price?.toFixed(2)}</p>
        <p className={`stock ${isOutOfStock ? 'out-of-stock' : ''}`}>
          {isOutOfStock ? '❌ Out of Stock' : `✅ In Stock: ${product.stock}`}
        </p>
      </div>
      <button
        className={`add-to-cart-btn ${isOutOfStock ? 'disabled' : ''}`}
        onClick={() => onAddToCart(product)}
        disabled={isOutOfStock}
      >
        {isOutOfStock ? 'Out of Stock' : '🛒 Add to Cart'}
      </button>
    </div>
  );
};

export default ProductCard;
import React from 'react';

const ProductCard = ({ product, onAddToCart }) => {
  // Use availableStock if available, fallback to totalStock, then stock
  const stockAmount = product.availableStock ?? product.totalStock ?? product.stock ?? 0;
  const isOutOfStock = stockAmount <= 0;
  
  // Convert price to number and format it
  const formatPrice = (price) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return isNaN(numPrice) ? '0.00' : numPrice.toFixed(2);
  };

  return (
    <div className="product-card">
      <div className="product-info">
        <h3>{product.name}</h3>
        {product.description && (
          <p className="description">{product.description}</p>
        )}
        <p className="price">${formatPrice(product.price)}</p>
        <p className={`stock ${isOutOfStock ? 'out-of-stock' : ''}`}>
          {isOutOfStock ? '❌ Out of Stock' : `✅ In Stock: ${stockAmount}`}
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
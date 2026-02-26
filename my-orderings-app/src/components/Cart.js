import React from 'react';

const Cart = ({ cart, onUpdateQuantity, onRemoveItem, onPlaceOrder, loading }) => {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (cart.length === 0) {
    return (
      <div className="cart">
        <h2>🛒 Shopping Cart</h2>
        <div className="empty-cart">
          <p>Your cart is empty</p>
          <p>Add some products to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cart">
      <h2>🛒 Shopping Cart</h2>
      <div className="cart-items">
        {cart.map(item => (
          <div key={item.id} className="cart-item">
            <div className="item-info">
              <h4>{item.name}</h4>
              <p className="item-price">${item.price?.toFixed(2)}</p>
            </div>
            <div className="quantity-controls">
              <button 
                className="quantity-btn"
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
              >
                ➖
              </button>
              <span className="quantity">{item.quantity}</span>
              <button 
                className="quantity-btn"
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              >
                ➕
              </button>
            </div>
            <div className="item-total">
              ${(item.price * item.quantity).toFixed(2)}
            </div>
            <button
              className="remove-btn"
              onClick={() => onRemoveItem(item.id)}
            >
              🗑️ Remove
            </button>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <div className="total">
          <strong>Total: ${total.toFixed(2)}</strong>
        </div>
        <button 
          className="place-order-btn" 
          onClick={onPlaceOrder}
          disabled={loading}
        >
          {loading ? '⏳ Placing Order...' : '🚀 Place Order'}
        </button>
      </div>
    </div>
  );
};

export default Cart;
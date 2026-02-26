import React from 'react';

const Header = ({ currentView, onViewChange, cartItemCount }) => {
  return (
    <header className="header">
      <div className="container">
        <h1 className="logo">🛒 Modern Ordering System</h1>
        <nav className="nav">
          <button
            className={`nav-button ${currentView === 'products' ? 'active' : ''}`}
            onClick={() => onViewChange('products')}
          >
            📦 Products
          </button>
          <button
            className={`nav-button ${currentView === 'cart' ? 'active' : ''}`}
            onClick={() => onViewChange('cart')}
          >
            🛒 Cart ({cartItemCount})
          </button>
          <button
            className={`nav-button ${currentView === 'orders' ? 'active' : ''}`}
            onClick={() => onViewChange('orders')}
          >
            📋 Orders
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
import React, { useEffect } from 'react';

const OrderHistory = ({ orders, onRefresh }) => {
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  if (orders.length === 0) {
    return (
      <div className="order-history">
        <h2>📋 Order History</h2>
        <div className="empty-orders">
          <p>No orders found</p>
          <button onClick={onRefresh} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>
    );
  }

  const getStatusEmoji = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return '⏳';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      case 'processing': return '⚙️';
      default: return '📦';
    }
  };

  return (
    <div className="order-history">
      <div className="orders-header">
        <h2>📋 Order History</h2>
        <button onClick={onRefresh} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>
      <div className="orders-list">
        {orders.map(order => (
          <div key={order.id} className="order-card">
            <div className="order-header">
              <h4>Order #{order.id}</h4>
              <span className={`status ${order.status}`}>
                {getStatusEmoji(order.status)} {order.status}
              </span>
            </div>
            <div className="order-items">
              {order.items?.map((item, index) => (
                <div key={index} className="order-item">
                  <span>Product #{item.productId}</span>
                  <span>Qty: {item.quantity}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="order-total">
              <strong>
                Total: ${order.totalAmount?.toFixed(2) || '0.00'}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderHistory;
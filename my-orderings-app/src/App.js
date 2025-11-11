import React, { useState, useEffect } from 'react';
import './App.css';

// Components
import Header from './components/Header';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import OrderHistory from './components/OrderHistory';

function App() {
  const [currentView, setCurrentView] = useState('products');
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch products on component mount
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // Use API gateway instead of direct service calls
      const urls = [
        'http://api-gateway:3003/api/products',  // Container network
        'http://localhost:3003/api/products'    // Host network
      ];
      
      let response;
      for (const url of urls) {
        try {
          response = await fetch(url);
          if (response.ok) break;
        } catch (err) {
          console.log(`Failed to fetch from ${url}:`, err.message);
        }
      }
      
      if (response && response.ok) {
        const data = await response.json();
        console.log('Products fetched:', data);
        // Extract products from the API response structure
        if (data.success && data.data && data.data.products) {
          setProducts(data.data.products);
        } else {
          // Handle old response format or direct products array
          setProducts(Array.isArray(data) ? data : []);
        }
      } else {
        throw new Error('All API endpoints failed');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      // Mock data fallback
      setProducts([
        { id: 1, name: 'Sample Product 1', price: 19.99, stock: 50 },
        { id: 2, name: 'Sample Product 2', price: 29.99, stock: 30 },
        { id: 3, name: 'Sample Product 3', price: 39.99, stock: 25 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    // Ensure price is a number
    const productWithNumericPrice = {
      ...product,
      price: typeof product.price === 'string' ? parseFloat(product.price) : product.price
    };
    
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...productWithNumericPrice, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.id === productId ? { ...item, quantity } : item
      ));
    }
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;

    setLoading(true);
    try {
      const orderData = {
        userId: 1, // Hardcoded for demo
        items: cart.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        }))
      };

      const response = await fetch('http://localhost:3001/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        setCart([]);
        setCurrentView('orders');
        fetchOrders();
        alert('Order placed successfully!');
      } else {
        alert('Failed to place order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      // Mock success for demo
      setCart([]);
      setCurrentView('orders');
      alert('Order placed successfully! (Demo mode)');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:3001/orders/user/1');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        // Mock data
        setOrders([
          {
            id: 1,
            userId: 1,
            status: 'pending',
            totalAmount: 59.98,
            items: [
              { productId: 1, quantity: 2, price: 19.99 },
              { productId: 2, quantity: 1, price: 29.99 }
            ]
          }
        ]);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      setOrders([]);
    }
  };

  const renderCurrentView = () => {
    if (loading) {
      return <div className="loading">Loading...</div>;
    }

    switch (currentView) {
      case 'products':
        return <ProductList products={products} onAddToCart={addToCart} />;
      case 'cart':
        return (
          <Cart
            cart={cart}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
            onPlaceOrder={placeOrder}
            loading={loading}
          />
        );
      case 'orders':
        return <OrderHistory orders={orders} onRefresh={fetchOrders} />;
      default:
        return <ProductList products={products} onAddToCart={addToCart} />;
    }
  };

  return (
    <div className="App">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        cartItemCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
      />
      <main className="main-content">
        {renderCurrentView()}
      </main>
    </div>
  );
}

export default App;

const { EventEmitter } = require('events');
const logger = require('winston');

class OrderSaga extends EventEmitter {
  constructor(kafkaProducer, services) {
    super();
    this.producer = kafkaProducer;
    this.services = services;
    this.sagaSteps = new Map();
    this.compensations = new Map();
  }

  async executeOrderSaga(orderData) {
    const sagaId = `saga_${orderData.orderId}_${Date.now()}`;
    
    try {
      logger.info(`Starting order saga: ${sagaId}`, { orderId: orderData.orderId });

      // Step 1: Reserve Inventory
      const inventoryResult = await this.reserveInventory(sagaId, orderData);
      if (!inventoryResult.success) {
        throw new Error('Inventory reservation failed');
      }

      // Step 2: Process Payment
      const paymentResult = await this.processPayment(sagaId, orderData);
      if (!paymentResult.success) {
        await this.compensateInventory(sagaId, orderData);
        throw new Error('Payment processing failed');
      }

      // Step 3: Confirm Order
      const orderResult = await this.confirmOrder(sagaId, orderData);
      if (!orderResult.success) {
        await this.compensatePayment(sagaId, orderData);
        await this.compensateInventory(sagaId, orderData);
        throw new Error('Order confirmation failed');
      }

      // Step 4: Update Shipping
      await this.scheduleShipping(sagaId, orderData);

      logger.info(`Order saga completed successfully: ${sagaId}`, { orderId: orderData.orderId });
      
      return {
        success: true,
        sagaId,
        message: 'Order processed successfully'
      };

    } catch (error) {
      logger.error(`Order saga failed: ${sagaId}`, { 
        error: error.message, 
        orderId: orderData.orderId 
      });

      // Publish saga failed event
      await this.publishSagaEvent('saga.failed', {
        sagaId,
        orderId: orderData.orderId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        sagaId,
        error: error.message
      };
    }
  }

  async reserveInventory(sagaId, orderData) {
    try {
      // Call product service to reserve inventory
      const axios = require('axios');
      
      for (const item of orderData.items) {
        const response = await axios.post(`${this.services.productService}/products/${item.productId}/reserve`, {
          quantity: item.quantity,
          sagaId,
          orderId: orderData.orderId
        }, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.data.success) {
          throw new Error(`Failed to reserve ${item.quantity} units of product ${item.productId}`);
        }
      }

      // Store compensation data
      this.sagaSteps.set(`${sagaId}_inventory`, {
        step: 'inventory_reserved',
        data: orderData.items,
        timestamp: new Date().toISOString()
      });

      await this.publishSagaEvent('inventory.reserved', {
        sagaId,
        orderId: orderData.orderId,
        items: orderData.items
      });

      return { success: true };

    } catch (error) {
      logger.error(`Inventory reservation failed for saga ${sagaId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async processPayment(sagaId, orderData) {
    try {
      // Simulate payment processing
      // In real implementation, this would call a payment service
      
      // Mock payment processing logic
      const paymentData = {
        amount: orderData.totalAmount,
        currency: 'USD',
        orderId: orderData.orderId,
        userId: orderData.userId
      };

      // Simulate potential payment failure for testing
      if (Math.random() < 0.05) { // 5% failure rate for testing
        throw new Error('Payment gateway timeout');
      }

      // Store payment transaction data
      this.sagaSteps.set(`${sagaId}_payment`, {
        step: 'payment_processed',
        transactionId: `txn_${sagaId}_${Date.now()}`,
        amount: orderData.totalAmount,
        timestamp: new Date().toISOString()
      });

      await this.publishSagaEvent('payment.processed', {
        sagaId,
        orderId: orderData.orderId,
        amount: orderData.totalAmount,
        transactionId: this.sagaSteps.get(`${sagaId}_payment`).transactionId
      });

      return { success: true };

    } catch (error) {
      logger.error(`Payment processing failed for saga ${sagaId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async confirmOrder(sagaId, orderData) {
    try {
      // Call order service to confirm the order
      const axios = require('axios');
      
      const response = await axios.put(`${this.services.orderService}/orders/${orderData.orderId}/confirm`, {
        sagaId,
        status: 'confirmed'
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.data.success) {
        throw new Error('Order confirmation failed in order service');
      }

      this.sagaSteps.set(`${sagaId}_order`, {
        step: 'order_confirmed',
        orderId: orderData.orderId,
        timestamp: new Date().toISOString()
      });

      await this.publishSagaEvent('order.confirmed', {
        sagaId,
        orderId: orderData.orderId,
        status: 'confirmed'
      });

      return { success: true };

    } catch (error) {
      logger.error(`Order confirmation failed for saga ${sagaId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async scheduleShipping(sagaId, orderData) {
    try {
      // Schedule shipping (mock implementation)
      const shippingData = {
        orderId: orderData.orderId,
        address: orderData.shippingAddress,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        trackingNumber: `TRK_${Date.now()}`
      };

      await this.publishSagaEvent('shipping.scheduled', {
        sagaId,
        orderId: orderData.orderId,
        shippingData
      });

      logger.info(`Shipping scheduled for order ${orderData.orderId}`);

    } catch (error) {
      logger.error(`Shipping scheduling failed for saga ${sagaId}:`, error);
      // Non-critical error, don't fail the saga
    }
  }

  // Compensation methods
  async compensateInventory(sagaId, orderData) {
    try {
      const inventoryStep = this.sagaSteps.get(`${sagaId}_inventory`);
      if (!inventoryStep) return;

      const axios = require('axios');
      
      for (const item of inventoryStep.data) {
        await axios.post(`${this.services.productService}/products/${item.productId}/release`, {
          quantity: item.quantity,
          sagaId,
          orderId: orderData.orderId
        }, { timeout: 10000 });
      }

      await this.publishSagaEvent('inventory.released', {
        sagaId,
        orderId: orderData.orderId,
        items: inventoryStep.data
      });

      logger.info(`Inventory compensation completed for saga ${sagaId}`);

    } catch (error) {
      logger.error(`Inventory compensation failed for saga ${sagaId}:`, error);
    }
  }

  async compensatePayment(sagaId, orderData) {
    try {
      const paymentStep = this.sagaSteps.get(`${sagaId}_payment`);
      if (!paymentStep) return;

      // Refund payment (mock implementation)
      await this.publishSagaEvent('payment.refunded', {
        sagaId,
        orderId: orderData.orderId,
        amount: paymentStep.amount,
        transactionId: paymentStep.transactionId
      });

      logger.info(`Payment compensation completed for saga ${sagaId}`);

    } catch (error) {
      logger.error(`Payment compensation failed for saga ${sagaId}:`, error);
    }
  }

  async publishSagaEvent(eventType, data) {
    try {
      await this.producer.send({
        topic: 'saga-events',
        messages: [
          {
            key: data.orderId.toString(),
            value: JSON.stringify({
              eventType,
              data,
              timestamp: new Date().toISOString()
            }),
            headers: {
              'event-type': eventType,
              'saga-id': data.sagaId
            }
          }
        ]
      });

      logger.debug('Saga event published:', { eventType, sagaId: data.sagaId });

    } catch (error) {
      logger.error('Failed to publish saga event:', error);
    }
  }
}

module.exports = OrderSaga;
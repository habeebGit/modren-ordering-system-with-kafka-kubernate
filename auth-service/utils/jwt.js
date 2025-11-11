const jwt = require('jsonwebtoken');
const logger = require('./logger');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

class JWTUtil {
  static generateAccessToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    return jwt.sign(payload, JWT_ACCESS_SECRET, {
      expiresIn: JWT_ACCESS_EXPIRES_IN,
      issuer: 'modern-ordering-system',
      audience: 'ordering-app'
    });
  }

  static generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      tokenVersion: user.refreshTokenVersion,
      type: 'refresh'
    };

    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'modern-ordering-system',
      audience: 'ordering-app'
    });
  }

  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, JWT_ACCESS_SECRET);
    } catch (error) {
      logger.error('Access token verification failed:', error.message);
      throw new Error('Invalid access token');
    }
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (error) {
      logger.error('Refresh token verification failed:', error.message);
      throw new Error('Invalid refresh token');
    }
  }

  static generateTokenPair(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
      expiresIn: JWT_ACCESS_EXPIRES_IN
    };
  }
}

module.exports = JWTUtil;
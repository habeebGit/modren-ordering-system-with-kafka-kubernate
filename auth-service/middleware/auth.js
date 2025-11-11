const JWTUtil = require('../utils/jwt');
const { User } = require('../models');
const logger = require('../utils/logger');

class AuthMiddleware {
  static async authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Access token required',
          code: 'TOKEN_MISSING'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      const decoded = JWTUtil.verifyAccessToken(token);
      
      // Verify user still exists and is active
      const user = await User.findOne({
        where: { 
          id: decoded.userId,
          isActive: true 
        },
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive',
          code: 'USER_NOT_FOUND'
        });
      }

      // Add user info to request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      };

      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      
      if (error.message === 'Invalid access token') {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token',
          code: 'TOKEN_INVALID'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  }

  static authorize(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required_roles: roles,
          user_role: req.user.role
        });
      }

      next();
    };
  }

  static optional(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    // Try to authenticate, but don't fail if token is invalid
    AuthMiddleware.authenticate(req, res, (err) => {
      if (err) {
        req.user = null;
      }
      next();
    });
  }
}

module.exports = AuthMiddleware;
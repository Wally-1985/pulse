const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
], auth.login);

router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
  validate,
], auth.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  validate,
], auth.resetPassword);

router.get('/sessions', authenticate, auth.getSessions);
router.delete('/sessions/:sessionId', authenticate, auth.revokeSession);

router.post('/mfa/setup', authenticate, auth.setupMfa);
router.post('/mfa/verify', authenticate, [body('code').notEmpty(), validate], auth.verifyMfa);
router.post('/mfa/disable', authenticate, [body('code').notEmpty(), validate], auth.disableMfa);

router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  validate,
], auth.changePassword);

module.exports = router;

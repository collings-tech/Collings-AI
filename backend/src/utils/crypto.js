'use strict';

const crypto = require('crypto');
const { AES_ENCRYPTION_KEY } = require('../config/env');

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(AES_ENCRYPTION_KEY, 'utf8').slice(0, 32);
const IV_LENGTH = 16;

/**
 * Encrypts plain text using AES-256-CBC.
 * The random IV is prepended to the ciphertext, both hex-encoded.
 * @param {string} text - Plain text to encrypt.
 * @returns {string} - Hex-encoded "iv:ciphertext".
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts an AES-256-CBC encrypted string.
 * Expects hex-encoded "iv:ciphertext" format produced by encrypt().
 * @param {string} encryptedText - Hex-encoded "iv:ciphertext".
 * @returns {string} - Decrypted plain text.
 */
function decrypt(encryptedText) {
  const [ivHex, encryptedHex] = encryptedText.split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted text format.');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };

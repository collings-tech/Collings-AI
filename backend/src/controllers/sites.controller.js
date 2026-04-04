'use strict';

const Site = require('../models/Site');
const { encrypt, decrypt } = require('../utils/crypto');

function serializeSite(site) {
  const obj = site.toObject();
  try {
    obj.wpAppPassword = decrypt(obj.wpAppPassword);
  } catch {
    obj.wpAppPassword = '';
  }
  return obj;
}

async function getAll(req, res, next) {
  try {
    const sites = await Site.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(sites.map(serializeSite));
  } catch (err) {
    next(err);
  }
}

async function add(req, res, next) {
  try {
    const { label, siteUrl, wpUsername, wpAppPassword } = req.body;

    if (!label || !siteUrl || !wpUsername || !wpAppPassword) {
      return res.status(400).json({
        error: 'label, siteUrl, wpUsername, and wpAppPassword are required.',
      });
    }

    // Check if this site URL is already registered by another user
    const existing = await Site.findOne({ siteUrl });
    if (existing) {
      const isOwn = String(existing.userId) === String(req.user.id);
      if (isOwn) {
        return res.status(409).json({
          error: 'You have already added this site to your account.',
        });
      }
      return res.status(409).json({
        error: 'This site is already being managed by another user. Each WordPress site can only be connected to one Collings AI account.',
      });
    }

    const site = await Site.create({
      userId: req.user.id,
      label,
      siteUrl,
      wpUsername,
      wpAppPassword: encrypt(wpAppPassword),
    });

    return res.status(201).json(serializeSite(site));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'This site is already being managed by another user. Each WordPress site can only be connected to one Collings AI account.',
      });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { label, siteUrl, wpUsername, wpAppPassword, lastUsedAt } = req.body;

    const site = await Site.findOne({ _id: id, userId: req.user.id });
    if (!site) {
      return res.status(404).json({ error: 'Site not found.' });
    }

    if (label !== undefined) site.label = label;
    if (siteUrl !== undefined) site.siteUrl = siteUrl;
    if (wpUsername !== undefined) site.wpUsername = wpUsername;
    if (wpAppPassword !== undefined) site.wpAppPassword = encrypt(wpAppPassword);
    if (lastUsedAt !== undefined) site.lastUsedAt = lastUsedAt;

    await site.save();

    return res.json(serializeSite(site));
  } catch (err) {
    next(err);
  }
}

async function deleteSite(req, res, next) {
  try {
    const { id } = req.params;

    const site = await Site.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!site) {
      return res.status(404).json({ error: 'Site not found.' });
    }

    return res.status(200).json({ message: 'Site deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, add, update, delete: deleteSite };

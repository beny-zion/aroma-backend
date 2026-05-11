const { ROLES, CAPABILITIES, ROLE_CAPABILITIES } = require('../config/permissions');

// @desc    Return the role/capability matrix for the UI
// @route   GET /api/permissions
const getPermissions = async (req, res) => {
  res.json({
    roles: ROLES,
    capabilities: CAPABILITIES,
    matrix: ROLE_CAPABILITIES
  });
};

module.exports = { getPermissions };

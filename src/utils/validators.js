const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isStrongPassword = (password) => typeof password === 'string' && password.length >= 8;

const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

module.exports = { isValidEmail, isStrongPassword, isValidObjectId };

const express = require('express');
const router = express.Router();
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch
} = require('../controllers/branchController');

router.route('/')
  .get(getBranches)
  .post(createBranch);

router.route('/:id')
  .get(getBranch)
  .put(updateBranch)
  .delete(deleteBranch);

module.exports = router;

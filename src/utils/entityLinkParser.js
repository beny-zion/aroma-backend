/**
 * Parse entity links from AI response text.
 * Format: [[type:id:displayName]]
 * Example: [[branch:507f1f77bcf86cd799439011:סניף דיזנגוף]]
 */

const ENTITY_LINK_REGEX = /\[\[(customer|branch|device|work-order|scent):([a-f0-9]{24}):([^\]]+)\]\]/g;

function extractEntityLinks(text) {
  const links = [];
  let match;
  const regex = new RegExp(ENTITY_LINK_REGEX.source, ENTITY_LINK_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    links.push({
      type: match[1],
      entityId: match[2],
      displayName: match[3]
    });
  }
  return links;
}

module.exports = { extractEntityLinks };

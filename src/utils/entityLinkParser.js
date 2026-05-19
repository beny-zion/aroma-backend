/**
 * Parse entity links from AI response text.
 * Two formats supported:
 *   Entity link: [[type:objectId:displayName]] — type ∈ entity types, id = 24-char hex
 *     Example: [[branch:507f1f77bcf86cd799439011:סניף דיזנגוף]]
 *   Page link:   [[page:/path:displayName]] — path = internal app route
 *     Example: [[page:/schedule:לוח שבועי]]
 */

const ENTITY_LINK_REGEX = /\[\[(customer|branch|device|work-order|scent|technician|user|service-request):([a-f0-9]{24}):([^\]]+)\]\]/g;
const PAGE_LINK_REGEX = /\[\[page:(\/[a-zA-Z0-9\/_\-]*):([^\]]+)\]\]/g;

function extractEntityLinks(text) {
  const links = [];

  // Entity links: groups 1=type, 2=id, 3=displayName
  const entityRe = new RegExp(ENTITY_LINK_REGEX.source, ENTITY_LINK_REGEX.flags);
  let m;
  while ((m = entityRe.exec(text)) !== null) {
    links.push({ type: m[1], entityId: m[2], displayName: m[3] });
  }

  // Page links: groups 1=path, 2=displayName (type is the literal "page" in the pattern)
  const pageRe = new RegExp(PAGE_LINK_REGEX.source, PAGE_LINK_REGEX.flags);
  while ((m = pageRe.exec(text)) !== null) {
    links.push({ type: 'page', entityId: m[1], displayName: m[2] });
  }

  return links;
}

module.exports = { extractEntityLinks, ENTITY_LINK_REGEX, PAGE_LINK_REGEX };

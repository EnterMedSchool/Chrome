/**
 * HTML Sanitizer for EnterMedSchool Glossary
 * Prevents XSS attacks when rendering term content.
 * 
 * @module sanitizer
 */

// Allowed tags for term content
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 
  'ul', 'ol', 'li', 
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre',
  'a', 'span', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption',
  'sup', 'sub',
];

// Allowed attributes per tag
const ALLOWED_ATTRS = {
  'a': ['href', 'target', 'rel', 'title'],
  'img': ['src', 'alt', 'width', 'height', 'loading'],
  'span': ['class', 'data-term-id'],
  'div': ['class'],
  'code': ['class'],
  'pre': ['class'],
  'td': ['colspan', 'rowspan'],
  'th': ['colspan', 'rowspan', 'scope'],
};

// URL schemes allowed in href/src
const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * Sanitize HTML string to prevent XSS
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML
 */
export function sanitize(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Create a temporary container
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Process all elements
  sanitizeNode(temp);

  return temp.innerHTML;
}

/**
 * Recursively sanitize a DOM node
 * @param {Node} node 
 */
function sanitizeNode(node) {
  const childNodes = Array.from(node.childNodes);

  for (const child of childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tagName = child.tagName.toLowerCase();

      // Check if tag is allowed
      if (!ALLOWED_TAGS.includes(tagName)) {
        // Replace with text content
        const text = document.createTextNode(child.textContent);
        node.replaceChild(text, child);
        continue;
      }

      // Remove disallowed attributes
      const allowedAttrs = ALLOWED_ATTRS[tagName] || [];
      const attrsToRemove = [];

      for (const attr of child.attributes) {
        if (!allowedAttrs.includes(attr.name)) {
          attrsToRemove.push(attr.name);
        } else {
          // Validate URL attributes
          if (attr.name === 'href' || attr.name === 'src') {
            if (!isValidUrl(attr.value)) {
              attrsToRemove.push(attr.name);
            }
          }
        }
      }

      for (const attrName of attrsToRemove) {
        child.removeAttribute(attrName);
      }

      // Add security attributes to links
      if (tagName === 'a') {
        child.setAttribute('rel', 'noopener noreferrer');
        if (child.getAttribute('target') === '_blank') {
          // Keep target
        } else {
          child.setAttribute('target', '_blank');
        }
      }

      // Recursively sanitize children
      sanitizeNode(child);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Remove HTML comments
      node.removeChild(child);
    }
  }
}

/**
 * Check if URL is valid and safe
 * @param {string} url 
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (!url) return false;

  try {
    // Check for javascript: protocol (XSS vector)
    if (url.toLowerCase().trim().startsWith('javascript:')) {
      return false;
    }
    if (url.toLowerCase().trim().startsWith('data:')) {
      return false;
    }
    if (url.toLowerCase().trim().startsWith('vbscript:')) {
      return false;
    }

    // Try to parse as URL
    const parsed = new URL(url, window.location.href);
    
    // Only allow safe schemes
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
      return false;
    }

    return true;
  } catch (e) {
    // Relative URLs are okay
    return !url.includes(':');
  }
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHTML(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return str.replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * Convert simple markdown to HTML
 * @param {string} text - Markdown text
 * @returns {string} HTML string
 */
export function markdownToHTML(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return escapeHTML(text)
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

export default {
  sanitize,
  escapeHTML,
  markdownToHTML,
};

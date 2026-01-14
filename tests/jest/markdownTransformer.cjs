const fs = require('fs');

/**
 * Jest transformer for `.md` files.
 *
 * Exports the raw markdown contents as a string.
 * We emit CommonJS so Jest can execute it without ESM parsing issues,
 * and we set both `module.exports` and `module.exports.default` so
 * default-imports work reliably under SWC interop.
 */
module.exports = {
  process(_src, filename) {
    const content = fs.readFileSync(filename, 'utf8');
    const json = JSON.stringify(content);
    return {
      code: `module.exports = ${json}; module.exports.default = ${json};`,
    };
  },
};


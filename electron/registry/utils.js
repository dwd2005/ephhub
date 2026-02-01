const { exec } = require('child_process');
const iconv = require('iconv-lite');

// Execute reg.exe and decode output (prefer CP936, fallback UTF-8)
function execReg(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true, encoding: 'buffer' }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const decoded = iconv.decode(stdout, 'cp936');
        return resolve(decoded || '');
      } catch (e) {
        return resolve(stdout.toString('utf8'));
      }
    });
  });
}

// Parse the first REG_* value on a reg query line
function parseDefaultValue(output) {
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/REG_[A-Z_]+\s+([^\r\n]+)/);
    if (match) return match[1].trim();
  }
  return '';
}

module.exports = { execReg, parseDefaultValue };

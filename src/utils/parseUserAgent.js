function parseUserAgent(ua) {
  if (!ua) return { deviceType: 'unknown', browser: 'unknown', os: 'unknown' };

  // Device type
  let deviceType = 'desktop';
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) deviceType = 'mobile';
  else if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) deviceType = 'tablet';

  // Browser
  let browser = 'other';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  // OS
  let os = 'other';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { deviceType, browser, os };
}

module.exports = { parseUserAgent };

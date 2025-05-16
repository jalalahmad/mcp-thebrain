# TheBrain MCP Server Security Guide

## Overview

The TheBrain MCP Server implements comprehensive security measures to protect your TheBrain data and ensure secure communication between clients and the server. This guide covers authentication methods, security features, and best practices for deployment.

## Authentication Methods

### 1. OAuth 2.1

OAuth 2.1 is the recommended authentication method for third-party clients and public-facing deployments.

**Features:**
- PKCE (Proof Key for Code Exchange) required for all clients
- Token-based authentication with refresh tokens
- Configurable scopes for fine-grained permissions
- Secure authorization flow

**Configuration:**
```bash
# Enable OAuth authentication
export AUTH_TYPE=oauth

# OAuth provider settings
export OAUTH_CLIENT_ID=your-client-id
export OAUTH_CLIENT_SECRET=your-client-secret
export OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
export OAUTH_AUTH_ENDPOINT=/oauth/authorize
export OAUTH_TOKEN_ENDPOINT=/oauth/token
export OAUTH_SCOPE=read write
export OAUTH_ALLOWED_CLIENTS=client1,client2
```

**Usage:**
```javascript
// Client-side OAuth flow
const pkce = generatePKCE();
const authUrl = `/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&code_challenge=${pkce.codeChallenge}&code_challenge_method=S256`;

// After authorization, exchange code for token
const tokenResponse = await fetch('/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    code_verifier: pkce.codeVerifier,
    client_id: clientId,
    redirect_uri: redirectUri
  })
});
```

### 2. API Key Authentication

API keys are suitable for trusted first-party integrations and server-to-server communication.

**Features:**
- Simple header-based authentication
- Permission-based access control
- Key rotation and revocation
- Secure key generation and storage

**Configuration:**
```bash
# Enable API key authentication
export AUTH_TYPE=api-key

# Primary API key (full access)
export THEBRAIN_API_KEY=your-secure-api-key

# Additional API keys with specific permissions
export API_KEY_1=read-service:key123:read,search
export API_KEY_2=write-service:key456:read,write,admin
```

**Usage:**
```javascript
// Client-side API key usage
const response = await fetch('/api/v1/resources', {
  headers: {
    'X-API-Key': 'tbrain_your-api-key'
  }
});
```

### 3. Combined Authentication

You can enable both OAuth and API key authentication simultaneously for maximum flexibility.

```bash
export AUTH_TYPE=both
```

## Security Features

### 1. Rate Limiting

Protect your server from abuse with configurable rate limiting.

**Configuration:**
```bash
# Enable rate limiting (default: true)
export ENABLE_RATE_LIMIT=true

# Rate limit settings
export RATE_LIMIT_WINDOW_MS=60000  # 1 minute
export RATE_LIMIT_MAX_REQUESTS=100  # 100 requests per window
export RATE_LIMIT_SKIP_SUCCESSFUL=false
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-01T00:00:00.000Z
```

### 2. CSRF Protection

Cross-Site Request Forgery protection for web-based clients.

**Configuration:**
```bash
# Enable CSRF protection (default: true)
export ENABLE_CSRF=true

# CSRF settings
export CSRF_COOKIE_NAME=csrf-token
export CSRF_HEADER_NAME=X-CSRF-Token
```

**Usage:**
```javascript
// Client-side CSRF token handling
const csrfToken = getCookie('csrf-token');

const response = await fetch('/api/v1/tools/create_thought', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```

### 3. Security Headers

Automatic security headers to prevent common web vulnerabilities.

**Configuration:**
```bash
# Enable security headers (default: true)
export ENABLE_SECURITY_HEADERS=true
```

**Headers Applied:**
- `X-Frame-Options: DENY` - Prevent clickjacking
- `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
- `X-XSS-Protection: 1; mode=block` - Enable XSS protection
- `Content-Security-Policy: default-src 'self'` - Restrict resource loading
- `Referrer-Policy: strict-origin-when-cross-origin` - Control referrer information
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` - Disable unnecessary features

## Best Practices

### 1. Environment Configuration

```bash
# Production settings
export NODE_ENV=production
export TRANSPORT_TYPE=http
export AUTH_TYPE=oauth
export ENABLE_RATE_LIMIT=true
export ENABLE_CSRF=true
export ENABLE_SECURITY_HEADERS=true

# Use strong secrets
export OAUTH_CLIENT_SECRET=$(openssl rand -base64 32)
export ADMIN_API_KEY=$(openssl rand -base64 32)
```

### 2. HTTPS Configuration

Always use HTTPS in production:

```bash
# Enable HTTPS (example with reverse proxy)
export HTTP_HOST=127.0.0.1
export HTTP_PORT=3000

# Configure reverse proxy (nginx example)
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. API Key Management

```bash
# Generate secure API keys
export API_KEY=$(node -e "console.log('tbrain_' + require('crypto').randomBytes(32).toString('base64url'))")

# Rotate keys regularly
export API_KEY_ROTATION_DAYS=90

# Use environment-specific keys
export API_KEY_PRODUCTION=tbrain_prod_key
export API_KEY_STAGING=tbrain_staging_key
export API_KEY_DEVELOPMENT=tbrain_dev_key
```

### 4. Monitoring and Alerts

```javascript
// Monitor authentication failures
logger.warn('Authentication failed', {
  method: req.method,
  path: req.path,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});

// Monitor rate limit violations
logger.warn('Rate limit exceeded', {
  key: rateLimitKey,
  requests: requestCount,
  window: windowMs
});
```

### 5. Error Handling

The server implements secure error handling that:
- Never exposes sensitive information in error messages
- Logs detailed errors internally while returning generic messages to clients
- Handles authentication errors with appropriate HTTP status codes

```javascript
// Example error response
{
  "error": "unauthorized",
  "error_description": "Invalid authentication credentials"
}
```

## Security Checklist

- [ ] Enable appropriate authentication method(s)
- [ ] Configure strong secrets and API keys
- [ ] Enable rate limiting
- [ ] Enable CSRF protection for web clients
- [ ] Enable security headers
- [ ] Use HTTPS in production
- [ ] Configure proper CORS settings
- [ ] Monitor authentication failures
- [ ] Implement regular security audits
- [ ] Keep dependencies updated
- [ ] Use environment variables for sensitive configuration
- [ ] Implement proper logging without exposing secrets
- [ ] Set up intrusion detection/monitoring
- [ ] Regular backup of authentication data
- [ ] Document security procedures for your team

## Troubleshooting

### Common Issues

1. **Rate limit errors**: Adjust `RATE_LIMIT_MAX_REQUESTS` or implement client-side request queuing
2. **CSRF token mismatch**: Ensure cookies are enabled and tokens are properly transmitted
3. **OAuth redirect issues**: Verify `OAUTH_REDIRECT_URI` matches your client configuration
4. **API key not working**: Check key format (must start with `tbrain_`) and permissions

### Debug Mode

Enable debug logging for security issues:

```bash
export LOG_LEVEL=debug
export DEBUG=thebrain:auth,thebrain:security
```

## Updates and Maintenance

Stay informed about security updates:
- Monitor the project's security advisories
- Subscribe to dependency security alerts
- Review and update security configurations regularly
- Test authentication flows after updates

## Contact

For security concerns or vulnerability reports, please contact the security team through the appropriate channels. Do not disclose security issues publicly.
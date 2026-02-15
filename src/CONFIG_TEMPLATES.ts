// @ts-nocheck
/**
 * Configuration Templates for Different Deployment Scenarios
 * 
 * Copy the appropriate section for your setup
 */

// ============================================
// DEVELOPMENT (Local Testing)
// ============================================

/**
 * Development Configuration
 * - Backend and frontend on same machine
 * - No HTTPS required
 * - Easy debugging
 */
const DevConfig = {
  backend: {
    port: 3001,
    host: 'localhost',
    corsOrigins: [
      'http://localhost:3000',      // Live Server
      'http://localhost:5500',      // Live Server (alt port)
      'http://localhost:8000',      // Python http.server
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:8000'
    ],
    jwtSecret: 'dev-secret-key-change-in-production',
    tokenExpiry: '7d',
    environment: 'development'
  },
  frontend: {
    apiUrl: 'http://localhost:3001',
    navidromeUrl: 'https://music.youtubemusicdownloader.life',
    debug: true,
    logRequests: true
  }
};

// ============================================
// DOCKER (Containerized Deployment)
// ============================================

/**
 * Docker Configuration
 * - Backend in container
 * - Frontend on host
 * - Port mapping in docker-compose
 */
const DockerConfig = {
  backend: {
    port: 3001,
    host: '0.0.0.0',  // Listen on all interfaces in container
    corsOrigins: [
      'http://localhost:3000',
      'http://localhost:5500',
      'http://host.docker.internal:3000',  // From container to host
      'http://docker.host:3000'
    ],
    jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
    tokenExpiry: '7d',
    environment: process.env.NODE_ENV || 'production'
  },
  frontend: {
    apiUrl: 'http://localhost:3001',  // From host perspective
    navidromeUrl: 'https://music.youtubemusicdownloader.life'
  }
};

/**
 * Example docker-compose.yml:
 * 
 * version: '3.8'
 * services:
 *   auth-server:
 *     build: .
 *     ports:
 *       - "3001:3001"
 *     environment:
 *       - PORT=3001
 *       - JWT_SECRET=your-secret-key
 *       - NODE_ENV=production
 *     volumes:
 *       - ./users.db:/app/users.db
 */

// ============================================
// HEROKU DEPLOYMENT
// ============================================

/**
 * Heroku Configuration
 * - Dynamic PORT from Heroku
 * - Heroku PostgreSQL (optional upgrade from SQLite)
 * - SSL/TLS auto-enabled
 */
const HerokuConfig = {
  backend: {
    port: process.env.PORT || 3001,  // Heroku assigns PORT
    host: '0.0.0.0',
    corsOrigins: [
      'https://your-app.herokuapp.com',
      'https://yourdomin.com'
    ],
    jwtSecret: process.env.JWT_SECRET,  // Set via Heroku config vars
    tokenExpiry: '7d',
    environment: 'production',
    database: {
      // Could use Heroku's add-on: heroku addons:create heroku-postgresql
      // For now using SQLite with file persistence
      type: 'sqlite',
      file: 'users.db'
    }
  },
  frontend: {
    apiUrl: 'https://your-app.herokuapp.com',
    navidromeUrl: 'https://music.youtubemusicdownloader.life'
  }
};

/**
 * Heroku Deployment Steps:
 * 
 * 1. Create Procfile:
 *    echo "web: npm start" > Procfile
 * 
 * 2. Install Heroku CLI and login:
 *    heroku login
 * 
 * 3. Create app:
 *    heroku create your-app-name
 * 
 * 4. Set environment variables:
 *    heroku config:set JWT_SECRET="your-secret-key"
 *    heroku config:set NODE_ENV=production
 * 
 * 5. Deploy:
 *    git push heroku main
 * 
 * 6. View logs:
 *    heroku logs --tail
 */

// ============================================
// RAILWAY DEPLOYMENT
// ============================================

/**
 * Railway Configuration
 * - Simple git-push deployment
 * - Auto-detects Node apps
 * - Built-in environment variables
 */
const RailwayConfig = {
  backend: {
    port: process.env.PORT || 3001,
    host: '0.0.0.0',
    corsOrigins: [
      'https://your-project-name.up.railway.app',
      'https://yourdomain.com'
    ],
    jwtSecret: process.env.JWT_SECRET,
    tokenExpiry: '7d',
    environment: 'production'
  }
};

/**
 * Railway Deployment Steps:
 * 
 * 1. Create Procfile:
 *    echo "web: npm start" > Procfile
 * 
 * 2. Connect GitHub repo to Railway
 * 
 * 3. Set environment variables in Dashboard:
 *    JWT_SECRET = your-secret-key
 *    NODE_ENV = production
 * 
 * 4. Railway auto-deploys on git push
 * 
 * 5. View logs in Railway Dashboard
 */

// ============================================
// SELF-HOSTED (VPS/Dedicated Server)
// ============================================

/**
 * Self-Hosted Configuration
 * - Full control over server
 * - Custom domain with SSL
 * - PM2 for process management
 */
const SelfHostedConfig = {
  backend: {
    port: 3001,
    host: '0.0.0.0',
    corsOrigins: [
      'https://music-player.yourdomain.com',
      'https://api.yourdomain.com'
    ],
    jwtSecret: process.env.JWT_SECRET,
    tokenExpiry: '7d',
    environment: 'production',
    ssl: {
      enabled: true,
      certPath: '/etc/letsencrypt/live/yourdomain.com/fullchain.pem',
      keyPath: '/etc/letsencrypt/live/yourdomain.com/privkey.pem'
    }
  }
};

/**
 * Nginx Reverse Proxy Config Example:
 * 
 * upstream auth_server {
 *   server localhost:3001;
 * }
 * 
 * server {
 *   listen 443 ssl;
 *   server_name api.yourdomain.com;
 *   
 *   ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
 *   ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
 *   
 *   location / {
 *     proxy_pass http://auth_server;
 *     proxy_set_header Host $host;
 *     proxy_set_header X-Real-IP $remote_addr;
 *     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *     proxy_set_header X-Forwarded-Proto $scheme;
 *   }
 * }
 * 
 * PM2 Ecosystem Config (ecosystem.config.ts):
 * 
 * module.exports = {
 *   apps: [{
 *     name: 'z-beta-auth',
 *     script: './server.ts',
 *     instances: 'max',
 *     exec_mode: 'cluster',
 *     env: {
 *       NODE_ENV: 'production',
 *       PORT: 3001,
 *       JWT_SECRET: process.env.JWT_SECRET
 *     }
 *   }]
 * };
 * 
 * Start with PM2:
 *   pm2 start ecosystem.config.ts
 *   pm2 save
 */

// ============================================
// AWS DEPLOYMENT
// ============================================

/**
 * AWS Configuration
 * - Elastic Beanstalk or EC2
 * - RDS for PostgreSQL (optional)
 * - API Gateway for routing
 * - CloudFront for CDN
 */
const AWSConfig = {
  backend: {
    port: 8080,  // Elastic Beanstalk default
    host: '0.0.0.0',
    corsOrigins: [
      'https://d1234567890.cloudfront.net',  // CloudFront
      'https://yourdomain.com'
    ],
    jwtSecret: process.env.JWT_SECRET,
    tokenExpiry: '7d',
    environment: 'production',
    database: {
      // Use AWS RDS
      type: 'postgresql',
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    }
  }
};

// ============================================
// ENVIRONMENT-SPECIFIC EXPORT
// ============================================

/**
 * Select configuration based on environment
 */
function getConfig(env = process.env.NODE_ENV || 'development') {
  const configs = {
    development: DevConfig,
    docker: DockerConfig,
    heroku: HerokuConfig,
    railway: RailwayConfig,
    selfhosted: SelfHostedConfig,
    aws: AWSConfig
  };
  
  return configs[env] || DevConfig;
}

module.exports = {
  DevConfig,
  DockerConfig,
  HerokuConfig,
  RailwayConfig,
  SelfHostedConfig,
  AWSConfig,
  getConfig
};

// ============================================
// FRONTEND CONFIGURATION LOADER
// ============================================

/**
 * For frontend, create a config.ts or update index.html:
 * 
 * <script>
 *   // Environment detection
 *   const isDev = window.location.hostname === 'localhost';
 *   
 *   window.authConfig = {
 *     apiUrl: isDev 
 *       ? 'http://localhost:3001'
 *       : 'https://your-api-domain.com',
 *     
 *     navidromeUrl: 'https://music.youtubemusicdownloader.life',
 *     
 *     tokenExpiry: 7 * 24 * 60 * 60 * 1000  // 7 days in milliseconds
 *   };
 * </script>
 */

// ============================================
// PRODUCTION SECURITY CHECKLIST
// ============================================

/**
 * Before going live, ensure:
 * 
 * Backend:
 *   ✅ JWT_SECRET is strong and unique
 *   ✅ NODE_ENV = 'production'
 *   ✅ HTTPS/SSL enabled
 *   ✅ CORS whitelist updated
 *   ✅ Input validation active
 *   ✅ Rate limiting enabled
 *   ✅ Error messages don't leak details
 *   ✅ Database backup strategy
 *   ✅ Logging and monitoring setup
 *   ✅ API versioning implemented
 * 
 * Frontend:
 *   ✅ API_URL points to production
 *   ✅ No hardcoded secrets in code
 *   ✅ HTTPS for all API calls
 *   ✅ Token refresh mechanism
 *   ✅ Secure cookie settings
 *   ✅ CSP headers configured
 *   ✅ Error tracking enabled
 * 
 * Infrastructure:
 *   ✅ Firewall rules configured
 *   ✅ DDoS protection enabled
 *   ✅ Backups automated
 *   ✅ Monitoring and alerts setup
 *   ✅ Load balancing configured
 *   ✅ SSL/TLS certificates valid
 *   ✅ DNS properly configured
 *   ✅ Health checks enabled
 */

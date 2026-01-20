const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

// Validate critical env vars in production
if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('ERROR: JWT_SECRET not set or too short (min 32 chars)');
    process.exit(1);
  }
}

// Middleware
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev ? ['http://localhost:3000', 'http://localhost:5500', 'http://localhost:5501', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://127.0.0.1:3000'] : true,
  credentials: true
}));
app.use(express.json());

// Database initialization
const dbPath = process.env.DB_PATH || './users.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[DB] Users table error:', err.message);
      else console.log('[DB] Users table ready');
    });
    
    // Create playlists table
    db.run(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, name)
      )
    `, (err) => {
      if (err) console.error('[DB] Playlists table error:', err.message);
      else console.log('[DB] Playlists table ready');
    });
    
    // Create playlist_tracks table
    db.run(`
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        track_title TEXT NOT NULL,
        track_artist TEXT,
        track_album TEXT,
        track_duration INTEGER,
        track_source TEXT DEFAULT 'local',
        navidrome_id TEXT,
        cover_art_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Playlist_tracks table error:', err.message);
      else console.log('[DB] Playlist_tracks table ready');
    });
  });
}

// Utility function to validate input
const validateInput = (username, password) => {
  if (!username || !password) {
    return { valid: false, error: 'Username and password are required' };
  }
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  console.log('[MIDDLEWARE] Verifying token - Headers:', Object.keys(req.headers));
  const authHeader = req.headers.authorization;
  console.log('[MIDDLEWARE] Auth header:', authHeader?.substring(0, 20) + '...');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('[MIDDLEWARE] No token found');
    return res.status(401).json({ error: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('[MIDDLEWARE] Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    console.log('[MIDDLEWARE] Token verified - User:', user.userId);
    req.user = user;
    next();
  });
};

// Register endpoint
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    const validation = validateInput(username, password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Check if username already exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (row) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        db.run(
          'INSERT INTO users (username, password) VALUES (?, ?)',
          [username, hashedPassword],
          function(err) {
            if (err) {
              console.error('Insert error:', err);
              return res.status(400).json({ error: 'Username already taken' });
            }

            res.status(201).json({
              message: 'User registered successfully',
              userId: this.lastID
            });
          }
        );
      } catch (error) {
        console.error('Hashing error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    const validation = validateInput(username, password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Find user
    db.get('SELECT id, username, password FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      try {
        // Compare password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate JWT
        const token = jwt.sign(
          { userId: user.id, username: user.username },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          message: 'Login successful',
          token: token,
          username: user.username
        });
      } catch (error) {
        console.error('Password comparison error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint (for frontend validation)
app.post('/verify-token', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, username: decoded.username, userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// ============================================
// PLAYLIST MANAGEMENT ENDPOINTS
// ============================================

console.log('[ROUTES] Registering playlist endpoints...');

// GET user's playlists
app.get('/api/playlists', verifyToken, (req, res) => {
  console.log('[ROUTE] GET /api/playlists - User:', req.user?.userId);
  const userId = req.user.userId;
  
  db.all(
    'SELECT id, user_id, name, created_at FROM playlists WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
    (err, rows) => {
      if (err) {
        console.error('[DB] Error fetching playlists:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      console.log('[ROUTE] Returning', rows?.length || 0, 'playlists');
      res.json(rows || []);
    }
  );
});

// CREATE new playlist
app.post('/api/playlists', verifyToken, (req, res) => {
  console.log('[ROUTE] POST /api/playlists - User:', req.user?.userId, 'Body:', req.body);
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  db.run(
    'INSERT INTO playlists (user_id, name) VALUES (?, ?)',
    [userId, name],
    function(err) {
      if (err) {
        console.error('[DB] Insert error:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Playlist with this name already exists' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }

      console.log('[ROUTE] Created playlist with ID:', this.lastID);
      res.status(201).json({
        id: this.lastID,
        user_id: userId,
        name: name,
        created_at: new Date().toISOString()
      });
    }
  );
});

// GET playlist details with tracks
app.get('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;

  db.get(
    'SELECT id, user_id, name, created_at FROM playlists WHERE id = ? AND user_id = ?',
    [playlistId, userId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      // Fetch tracks for this playlist
      db.all(
        'SELECT id, playlist_id, track_title, track_artist, track_album, track_duration, track_source, navidrome_id, cover_art_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY id',
        [playlistId],
        (err, tracks) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({
            ...playlist,
            tracks: tracks || []
          });
        }
      );
    }
  );
});

// ADD track to playlist
app.post('/api/playlists/:playlistId/tracks', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const {
    track_title,
    track_artist,
    track_album,
    track_duration,
    track_source,
    navidrome_id,
    cover_art_id
  } = req.body;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        `INSERT INTO playlist_tracks 
         (playlist_id, user_id, track_title, track_artist, track_album, track_duration, track_source, navidrome_id, cover_art_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [playlistId, userId, track_title, track_artist, track_album, track_duration, track_source, navidrome_id, cover_art_id],
        function(err) {
          if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.status(201).json({
            id: this.lastID,
            playlist_id: playlistId,
            track_title,
            track_artist,
            track_album,
            track_duration,
            track_source,
            navidrome_id,
            cover_art_id
          });
        }
      );
    }
  );
});

// REMOVE track from playlist
app.delete('/api/playlists/:playlistId/tracks/:trackId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const trackId = req.params.trackId;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?',
        [trackId, playlistId],
        function(err) {
          if (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ message: 'Track removed from playlist' });
        }
      );
    }
  );
});

// DELETE playlist
app.delete('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;

  // Verify playlist belongs to user
  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'DELETE FROM playlists WHERE id = ?',
        [playlistId],
        function(err) {
          if (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ message: 'Playlist deleted' });
        }
      );
    }
  );
});

// RENAME playlist
app.patch('/api/playlists/:playlistId', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const playlistId = req.params.playlistId;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  db.get(
    'SELECT user_id FROM playlists WHERE id = ?',
    [playlistId],
    (err, playlist) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!playlist || playlist.user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      db.run(
        'UPDATE playlists SET name = ? WHERE id = ?',
        [name, playlistId],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ error: 'Playlist with this name already exists' });
            }
            console.error('Update error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ id: playlistId, name: name, message: 'Playlist renamed' });
        }
      );
    }
  );
});

// Navidrome Search Proxy
app.get('/api/navidrome/search', (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const navidromeUrl = `https://music.youtubemusicdownloader.life/api/search?q=${encodeURIComponent(query)}`;
  
  // Proxy the request to Navidrome
  fetch(navidromeUrl, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Navidrome error: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      res.json(data);
    })
    .catch(error => {
      console.error('[PROXY] Navidrome search error:', error);
      res.status(500).json({ error: 'Search failed', details: error.message });
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Debug endpoint to check database tables
app.get('/api/debug/tables', (req, res) => {
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ tables: tables.map(t => t.name) });
  });
});

// Serve static files (MUST be after API routes)
app.use(express.static(path.join(__dirname), {
  index: false,  // Don't serve index.html for unknown routes
  setHeaders: (res, path) => {
    // Cache static files appropriately
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Fallback to index.html for SPA routing (must be last)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 handler for API routes that weren't matched
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing gracefully...');
  db.close((err) => {
    if (err) console.error('Database close error:', err);
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing gracefully...');
  db.close((err) => {
    if (err) console.error('Database close error:', err);
    process.exit(0);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

# ⚡ Quick Start Guide

Get the authentication system up and running in 5 minutes!

## Step 1: Install Dependencies (1 min)

```bash
cd /workspaces/html-player
npm install
```

## Step 2: Start the Server (30 sec)

```bash
npm start
```

You should see:
```
Authentication server running on http://localhost:3001
```

## Step 3: Open the Player (30 sec)

1. Open `index.html` in your browser
2. Or use Live Server: Right-click → Open with Live Server
3. You should see the login panel at the bottom-left of the sidebar

## Step 4: Test Registration (1 min)

1. Enter username: `testuser`
2. Enter password: `password123`
3. Click **Register**
4. You should see "Registration successful!" message
5. Auto-login will happen in 1 second

## Step 5: Test Login/Logout (1 min)

1. Click **Logout** button (shown as user info panel)
2. Re-enter credentials
3. Click **Login**
4. You're authenticated! 🎉

## 🔧 Common Issues

**"Connection error"?**
- Make sure `npm start` is running
- Check http://localhost:3001/health in browser
- Restart the server

**Can't see login panel?**
- Check browser console for errors (F12)
- Make sure auth.css is imported in main.css
- Reload the page

**Credentials not working?**
- Check browser localStorage (F12 → Application → Storage)
- Clear localStorage: `localStorage.clear()`
- Re-register a new user

## 📱 What You Get

✅ Secure user registration
✅ Encrypted password storage (bcrypt)
✅ JWT token-based authentication
✅ Beautiful glassmorphism UI
✅ Auto-login after registration
✅ Persistent login (localStorage)
✅ Navidrome API integration ready

## 🔐 Your Token

After login, your JWT token is stored in `localStorage`:

```javascript
// View your token in browser console
localStorage.getItem('auth_token')

// Or check username
localStorage.getItem('auth_username')
```

## 🚀 Next Steps

1. **For Navidrome Integration**: See [AUTH_SETUP.md](AUTH_SETUP.md#navidrome-integration)
2. **For Production Deployment**: See [AUTH_SETUP.md](AUTH_SETUP.md#production-checklist)
3. **For API Reference**: See [AUTH_SETUP.md](AUTH_SETUP.md#backend-api-endpoints)

## 📚 File Reference

| File | Purpose |
|------|---------|
| `server.js` | Express API with 4 endpoints |
| `js/auth.js` | Frontend authentication logic |
| `css/auth.css` | Glassmorphism login styles |
| `package.json` | Node.js dependencies |
| `users.db` | SQLite database (auto-created) |

## 💡 Tips

- Change JWT_SECRET before production deployment
- Use HTTPS in production
- Add rate limiting for login attempts
- Consider implementing password reset
- Monitor failed login attempts

---

🎉 **You're all set!** Enjoy your authenticated music player!

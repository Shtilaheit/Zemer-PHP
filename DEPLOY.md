# Deployment Guide for Web Hosting

This guide explains how to deploy Metrolist PHP to any standard web hosting service (shared hosting, VPS, etc.).

## 📁 File Structure

```
/ (or public_html/)
├── index.html          # Main entry point
├── .htaccess           # Apache rewrite rules
├── assets/             # CSS, JS, icons
│   ├── css/
│   ├── js/
│   └── icons/
├── api/                # API endpoints
│   ├── search.php
│   ├── browse.php
│   ├── player.php
│   ├── home.php
│   └── suggestions.php
├── src/                # PHP classes (NOT in public_html if possible)
│   ├── autoload.php
│   ├── Core/
│   └── YouTube/
├── storage/            # Cache and logs (NOT in public_html if possible)
│   ├── cache/
│   └── logs/
└── sw.js               # Service Worker
```

## 🚀 Deployment Steps

### Option 1: Upload Everything to public_html

If your hosting provider doesn't allow files outside public_html:

1. **Upload all files** to `public_html/` or `www/` directory:
   ```bash
   # Via FTP/SFTP
   Upload all files from this repo to public_html/
   ```

2. **Set permissions**:
   ```bash
   chmod 755 storage
   chmod 755 storage/cache
   chmod 755 storage/logs
   chmod 644 index.html
   chmod 644 .htaccess
   ```

3. **Test**: Visit `http://yourdomain.com/`

### Option 2: Secure Setup (Recommended if VPS/dedicated)

Keep sensitive files outside web root:

1. **Upload structure**:
   ```
   /home/youruser/
   ├── myapp/              # Outside public_html
   │   ├── src/
   │   └── storage/
   └── public_html/        # Web root
       ├── index.html
       ├── assets/
       ├── api/
       └── .htaccess
   ```

2. **Update API paths** in `api/*.php`:
   ```php
   // Change from:
   require_once __DIR__ . '/../src/autoload.php';

   // To:
   require_once '/home/youruser/myapp/src/autoload.php';
   ```

3. **Update storage path** in `src/Core/Config.php`:
   ```php
   const STORAGE_PATH = '/home/youruser/myapp/storage';
   ```

## ⚙️ Server Requirements

### Minimum Requirements:
- **PHP 8.1+** (8.2 or 8.3 recommended)
- **Extensions**:
  - ✅ `openssl` (HTTPS support)
  - ✅ `json` (JSON parsing)
  - ✅ `mbstring` (String handling)
  - ⚠️ `apcu` (Optional - for better caching)
- **Apache** with mod_rewrite OR **Nginx**

### Check Your PHP Version:
```php
<?php phpinfo(); ?>
```

Or via SSH:
```bash
php -v
```

### Enable Required Extensions:

**Via php.ini**:
```ini
extension=openssl
extension=json
extension=mbstring
extension=apcu  ; Optional
```

**Via .htaccess** (if allowed):
```apache
php_value extension openssl
php_value extension json
php_value extension mbstring
```

## 🔧 Configuration

### Debug Mode (Development Only!)

Edit `src/Core/Config.php`:
```php
const DEBUG = false;  // Set to false in production!
```

### Custom Settings

Edit `src/Core/Config.php` for:
- Cache duration
- Log settings
- API timeouts

## 🌐 Web Server Configuration

### Apache (.htaccess included)

The `.htaccess` file is already configured! It handles:
- SPA routing (all requests → index.html)
- Gzip compression
- Browser caching
- Security headers

### Nginx

If using Nginx, add to your server block:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/public_html;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # PHP files
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

## 🐛 Troubleshooting

### 500 Internal Server Error

**Check PHP error logs**:
```bash
tail -f /path/to/error.log
# Or
tail -f storage/logs/app.log
```

**Common causes**:
1. Missing PHP extensions
2. Incorrect file permissions
3. PHP version < 8.1
4. .htaccess not supported (disable mod_rewrite check)

### "No streaming URL available"

**This is expected behavior!**

YouTube uses signature encryption that requires additional processing. Current limitations:
- May not work for all videos
- Geographic restrictions apply
- Requires valid YouTube cookies/session

**Possible solutions**:
1. Use YouTube IFrame player (requires API key)
2. Implement signature decryption (complex)
3. Use third-party YouTube API service

### Blank Page

**Check**:
1. PHP errors: `tail -f error.log`
2. Browser console: Press F12 → Console tab
3. Storage permissions: `chmod 755 storage`
4. Mod_rewrite enabled: `a2enmod rewrite && service apache2 restart`

### CSS/JS Not Loading

**Check**:
1. File permissions: `chmod 644 assets/css/* assets/js/*`
2. Path is correct: `/assets/css/material3.css` (absolute)
3. .htaccess rewrite rules aren't blocking static files

## 📊 Performance Tips

### Enable APCu Caching

```bash
# Install APCu
sudo apt install php-apcu

# Enable
sudo phpenmod apcu
sudo service php8.2-fpm restart  # or apache2 restart
```

### Enable Gzip Compression

Already configured in `.htaccess`! Verify:
```bash
curl -H "Accept-Encoding: gzip" -I http://yourdomain.com/assets/js/app.js
# Should show: Content-Encoding: gzip
```

### Enable OPcache

In `php.ini`:
```ini
opcache.enable=1
opcache.memory_consumption=128
opcache.max_accelerated_files=10000
```

## 🔒 Security Checklist

- [ ] Set `DEBUG = false` in production
- [ ] Keep `src/` and `storage/` outside public_html (if possible)
- [ ] Set proper file permissions (644 for files, 755 for directories)
- [ ] Enable HTTPS (use Let's Encrypt)
- [ ] Keep PHP updated
- [ ] Review `.htaccess` security headers
- [ ] Don't commit sensitive data to Git

## 📝 Quick Deployment Commands

### Via FTP/SFTP:
```bash
# Use FileZilla, WinSCP, or command-line:
sftp user@yourhost.com
put -r * /public_html/
```

### Via Git (if hosting supports it):
```bash
cd /public_html
git clone https://github.com/Shtilaheit/Zemer-PHP.git .
chmod 755 storage storage/cache storage/logs
```

### Via cPanel File Manager:
1. Compress all files to `.zip`
2. Upload zip to cPanel File Manager
3. Extract in `public_html/`
4. Set permissions via File Manager

## 🎯 Testing After Deployment

1. **Visit homepage**: `http://yourdomain.com/`
2. **Test search**: Go to Search, type "test"
3. **Check API**: `http://yourdomain.com/api/home.php`
4. **View logs**: Check `storage/logs/app.log`
5. **Browser console**: Press F12, check for errors

## 💬 Support

If you encounter issues:
1. Check `storage/logs/app.log`
2. Check browser console (F12)
3. Check PHP error logs
4. Create issue on GitHub: https://github.com/Shtilaheit/Zemer-PHP/issues

## 📚 Additional Resources

- PHP Manual: https://www.php.net/manual/
- Apache .htaccess: https://httpd.apache.org/docs/current/howto/htaccess.html
- Nginx Config: https://nginx.org/en/docs/
- Let's Encrypt SSL: https://letsencrypt.org/

#!/bin/bash
# Build RFParty as a PWA (Progressive Web App)
#
# This builds the app for browser deployment.
# The output can be served by any static web server.

set -e

echo "🔧 Building RFParty PWA..."

# Build with Parcel
npm run build-dev

# Copy PWA assets to www
echo "📦 Copying PWA assets..."
cp src/manifest.json www/
cp src/service-worker.js www/

echo ""
echo "✅ PWA build complete!"
echo ""
echo "📂 Output is in: www/"
echo ""
echo "To test locally:"
echo "  cd www && python3 -m http.server 8080"
echo "  Then open: http://localhost:8080"
echo ""
echo "To deploy:"
echo "  Upload the contents of www/ to any static web host"
echo "  (Netlify, Vercel, GitHub Pages, S3, etc.)"
echo ""
echo "⚠️  Note: Web Bluetooth only works in Chrome/Edge/Opera"
echo "    and requires HTTPS (except localhost)"

# DD Img Comp

DD Img Comp is a free, privacy-focused image compression website that converts PNG, JPG/JPEG, and AVIF images into optimized WEBP files. Image processing runs locally inside the browser, so image contents and filenames are never uploaded to or stored on an external server.

## About the website

The website is designed for developers, designers, content creators, and anyone who needs smaller, web-ready images without sacrificing visual quality. Users can upload individual files or entire folders, adjust compression quality globally or per image, compare the original and compressed results, and download converted files individually or together in a ZIP archive.

DD Img Comp combines a responsive dark interface with fast, hardware-aware batch processing. It supports up to 200 images per session and provides live information about file sizes, saved space, processing time, compression percentage, and compression speed.

## Features

- Drag-and-drop, file, folder, and clipboard input (up to 200 images)
- Global quality plus per-image overrides
- Small-file, balanced, and high-quality compression presets
- Optional protection that skips WEBP results larger than the original
- Asynchronous batch processing with pause, resume, cancel, and progress
- Before/after comparison previews with mouse, touch, and keyboard controls
- Individual WEBP downloads and ZIP batch downloads
- Search, sorting, status filters, selection, individual and bulk rename, and batch actions
- Retry failed images, downloadable issue reports, and seven-second undo after deletion
- Optional automatic downloads and browser completion notifications
- Incremental image grid with four-card "Load more" pagination
- Live size, savings, conversion, and timing statistics
- Live compression throughput displayed in MB/s
- Hardware-aware parallel processing for faster large batches
- Persistent quality, layout, and animation preferences
- Responsive dark interface with reduced-motion support
- Browser compatibility report, keyboard shortcut guide, FAQ, and changelog
- Welcome, confirmation, full-preview, privacy, and developer profile dialogs
- Protected analytics dashboard with daily, weekly, and monthly usage summaries
- Consent-based anonymous aggregate usage storage through Netlify Functions and Netlify Blobs
- Admin CSV export and optional 60-second automatic refresh
- Netlify security headers for framing, content types, referrers, permissions, and content sources

## Admin analytics

Open `/admin.html` on the deployed website and sign in with the configured admin account. The dashboard displays:

- Total compression sessions and images
- Original, compressed, and saved data volume
- Processing time and average throughput
- Daily, weekly, or monthly activity charts
- The 50 most recent anonymous compression sessions
- CSV export of the displayed recent sessions
- Optional automatic refresh while the dashboard tab is visible

Analytics is opt-in. The endpoint stores only image count, byte totals, processing duration, savings, and a server timestamp after the visitor allows it. It never receives image data, previews, filenames, email addresses, IP addresses from application code, or persistent device identifiers.

Authentication is verified inside a Netlify Function with `scrypt` and constant-time hash comparison. The password is not included in frontend JavaScript. The project contains a hash for the initial administrator credential. For production, rotate it using Netlify environment variables with **Functions** scope:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_SALT`
- `ADMIN_PASSWORD_HASH`

Generate a new salt and hash locally:

```bash
node -e "const c=require('node:crypto');const salt=c.randomBytes(16).toString('hex');const hash=c.scryptSync('YOUR_NEW_PASSWORD',salt,64).toString('hex');console.log({salt,hash})"
```

## Deploy on Netlify

The repository now includes `netlify.toml`, `package.json`, and `package-lock.json`. Connect the repository to Netlify and deploy normally. Netlify installs `@netlify/blobs`, bundles the functions in `netlify/functions/`, and provides the site-wide Blob store automatically.

After deployment, verify these URLs:

- `/` — image compressor
- `/admin.html` — protected analytics dashboard
- `/.netlify/functions/record-compression` — anonymous write endpoint (POST only)
- `/.netlify/functions/admin-analytics` — authenticated dashboard endpoint (GET only)

## Privacy and browser support

All image processing uses the browser's Canvas API. Files remain on the user's device. When a visitor opts in, anonymous aggregate metrics are sent after a compression batch to a Netlify Function and stored in Netlify Blobs for the admin dashboard. JSZip and FileSaver.js are loaded from cdnjs, and the interface's custom styling lives in `css/style.css` and `css/enhancements.css`.

Use a current release of Chrome, Edge, Firefox, or Safari. AVIF input depends on the browser's AVIF decoding support. Extremely large image dimensions may exceed browser Canvas limits even when file size is below the 100 MB safety limit.

## Project structure

```text
DD-Img-Comp/
├── index.html
├── admin.html
├── netlify.toml
├── package.json
├── package-lock.json
├── css/
│   ├── style.css
│   └── admin.css
├── js/
│   ├── app.js
│   ├── admin.js
│   └── ...
├── netlify/functions/
│   ├── record-compression.mjs
│   └── admin-analytics.mjs
└── assets/
```

## Developer

Created by **Debjit Dey**, Associate Software Engineer specializing in HTML, CSS, Vanilla JavaScript, and PHP.

- Email: [deydebjit2000@gmail.com](mailto:deydebjit2000@gmail.com)
- LinkedIn: [Debjit Dey](https://www.linkedin.com/in/debjit-dey-11d2000/)

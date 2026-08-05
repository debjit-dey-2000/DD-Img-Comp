# DD Img Comp

DD Img Comp is a free, privacy-focused image compression website that converts PNG, JPG/JPEG, and AVIF images into optimized WEBP files. Everything runs locally inside the browser, so images are never uploaded to or stored on an external server.

## About the website

The website is designed for developers, designers, content creators, and anyone who needs smaller, web-ready images without sacrificing visual quality. Users can upload individual files or entire folders, adjust compression quality globally or per image, compare the original and compressed results, and download converted files individually or together in a ZIP archive.

DD Img Comp combines a responsive dark/light interface with fast, hardware-aware batch processing. It supports up to 200 images per session and provides live information about file sizes, saved space, processing time, compression percentage, and compression speed. No installation, account, build process, or backend is required.

## Features

- Drag-and-drop, file, folder, and clipboard input (up to 200 images)
- Global quality plus per-image overrides
- Asynchronous batch processing with pause, resume, cancel, and progress
- Before/after comparison previews with mouse, touch, and keyboard controls
- Individual WEBP downloads and ZIP batch downloads
- Search, sorting, status filters, selection, rename, and batch actions
- Incremental image grid with four-card "Load more" pagination
- Live size, savings, conversion, and timing statistics
- Live compression throughput displayed in MB/s
- Hardware-aware parallel processing for faster large batches
- Persistent theme, quality, layout, and animation preferences
- Responsive dark/light interface with reduced-motion support
- Welcome, confirmation, full-preview, and developer profile dialogs


## Privacy and browser support

All processing uses the browser's Canvas API. Files remain on the user's device. JSZip and FileSaver.js are loaded from cdnjs, and Tailwind's CDN script is included as requested; the interface's custom styling lives in `css/style.css`.

Use a current release of Chrome, Edge, Firefox, or Safari. AVIF input depends on the browser's AVIF decoding support. Extremely large image dimensions may exceed browser Canvas limits even when file size is below the 100 MB safety limit.

```

## Developer

Created by **Debjit Dey**, Associate Software Engineer specializing in HTML, CSS, Vanilla JavaScript, and PHP.

- Email: [deydebjit2000@gmail.com](mailto:deydebjit2000@gmail.com)
- LinkedIn: [Debjit Dey](https://www.linkedin.com/in/debjit-dey-11d2000/)

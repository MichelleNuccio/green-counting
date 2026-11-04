# Protected Word Associations

The entry page decrypts `site.encrypted.json` using the same password access mechanism as Cloud Associations. The bundle includes the original explorer, its analysis data, category CSV and Google Drive mappings. Original PDFs stay on Drive with their existing permissions.

Rebuild after editing sources, with Node.js and CLOUD_SITE_PASSWORD set privately:

    node scripts/build-word-associations.mjs

The editable HTML template is `.private/index.html` (excluded from Git); keep a private backup. The original app.js, style.css, data.js and drive_ids.js remain unchanged. Publish index.html and site.encrypted.json together. HTTPS or localhost is required.

The password protects this entry page, not pre-existing public data.js files, other URLs or repository history. Authorized viewers can inspect the data after unlocking.

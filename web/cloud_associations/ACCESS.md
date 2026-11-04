# Protected Cloud Associations

`index.html` asks for a password and decrypts `site.encrypted.json` locally with Web Crypto (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM). The password is not saved in the page. HTTPS or localhost is required.

The encrypted bundle includes the visualization, styles, analysis data, category assignments and logo. It does not include the original PDFs. No plaintext category file needs to be published.

To rebuild after editing the visualization, use Node.js:

    read -s CLOUD_SITE_PASSWORD
    export CLOUD_SITE_PASSWORD
    node scripts/build-cloud-associations.mjs
    unset CLOUD_SITE_PASSWORD

The editable HTML template is `.private/index.html`, which is deliberately excluded from Git. Keep a private backup of that file. The builder reads the existing `app.js`, `style.css`, `../word_associations/data.js` and the original category CSV without modifying them.

Publish both `index.html` and `site.encrypted.json` together. Rebuild after changing the visualization or source data.

This protects only this encrypted page. Previously published data files, other pages and Git history are not protected by this password. Authorized viewers can inspect data after unlocking the page.

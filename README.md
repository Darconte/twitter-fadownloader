# X Media Saver

A Firefox extension for saving media from **X/Twitter** and **Fur Affinity** — no right-click needed.

## Features

### X / Twitter
- **One-click download button** on every tweet with media, in the action bar (Reply / Repost / Like row)
- **Images, GIFs, and videos** — best available quality; GIFs are converted to real `.gif` files (X serves them as MP4 internally)
- **Silent downloads** — no save dialog by default (configurable)

### Fur Affinity
- **Drag-to-download floating icon** on the right side of the page
- Drag it onto a submission image or a gallery thumbnail to download the full file
- **Snaps back** to the default position after every drag (success or miss)
- Works on submission pages and browse/gallery grids (resolves the full `d.furaffinity.net` file URL)

### Shared
- **Custom save folders** under your Downloads directory
- **Filename templates** for both sites

## Install (temporary / developer mode)

1. Open Firefox and go to `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on…**
4. Select the `manifest.json` file inside the `x-media-saver` folder

The extension will stay loaded until you restart Firefox.

## Install (permanent, unsigned)

For a permanent install without publishing to Mozilla Add-ons, you can use Firefox Developer Edition or configure `xpinstall.signatures.required` to `false` in `about:config` (not recommended for daily browsing).

The recommended long-term option is to [sign and publish](https://extensionworkshop.com/documentation/publish/) the add-on, or keep loading it temporarily during development.

## Usage

**X/Twitter:** Click the download arrow on tweets with media.

**Fur Affinity:** Drag the blue floating icon onto an image or thumbnail. The icon returns to the right edge automatically.

Reload the add-on in `about:debugging` after updating files.

## Settings

Open the extension settings from `about:addons` → **X Media Saver** → **Preferences**, or right-click the extension icon.

| Setting | Description |
|---------|-------------|
| Enable downloads | Turn the extension on/off |
| Show save dialog | Ask where to save each file (off = instant download) |
| Prefer original quality | Request `name=orig` for images |
| Images/Videos/GIFs folder | Subfolder paths under Downloads |
| Filename template | Pattern for saved filenames |
| Button position | Left (before Reply) or Right (after Share) |
| Fur Affinity drag icon | Show/hide the floating drag control on FA |
| Fur Affinity folder / template | Save path and `{artist}_{id}` style names |

## Notes

- **Save location**: Firefox extensions can only save inside your browser's Downloads folder (including subfolders). This is a browser security limitation, not an extension limitation.
- **GIFs on X**: Converted from MP4 via the extension (fetched in the background to avoid CORS). Large or long GIFs may take a few seconds.
- **Fur Affinity**: Downloads use a `Referer` header and your browser cookies (logged-in sessions). Age-restricted or blocked submissions may fail.
- **Videos**: X streams many videos via MediaSource (blob URLs). The extension intercepts X's API responses to find the direct MP4 link, with a syndication API fallback.
- **Multiple images**: Clicking download on a tweet with a photo carousel downloads all images in that tweet.

## Permissions

| Permission | Why |
|------------|-----|
| `downloads` | Save files to disk |
| `storage` | Remember your settings |
| `pbs.twimg.com` / `video.twimg.com` | Fetch media files |
| `d.furaffinity.net` / `furaffinity.net` | Resolve and download FA submission files |

## File structure

```
x-media-saver/
├── manifest.json
├── background.js
├── content/
│   ├── content.js          # X/Twitter action bar downloads
│   ├── furaffinity.js      # FA drag-to-download
│   ├── floating-drag.js    # Shared snap-back drag icon
│   ├── gif-converter.js    # MP4 → GIF for X
│   ├── content.css
│   └── interceptor.js      # Captures video URLs from X API
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
└── icons/
    ├── icon-48.svg
    └── icon-96.svg
```

## License

MIT

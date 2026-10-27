# 1. Run

From the repository root:

```bash
cd projects/phoenix-plans-takeoffs
npm ci
npm test
npm run build
npm run preview
```

Browse to http://127.0.0.1:4173 and choose **Open synthetic sample**.

Node.js used here: 22.23.4. The package engines range is the same as a current Node 22. `npm ci` installs the lockfile. `npm test` does not need the preview server. `npm run demo` does: it drives Chrome at `/usr/bin/google-chrome` against that URL.

Do not point this app at a real customer's drawings. The fixtures are synthetic.

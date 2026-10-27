# 3. Hashes and licenses

SHA-256 of the files in this packet that are inputs or demo outputs. Computed 2026-10-27 with Node `crypto`.

| SHA-256 | File |
| --- | --- |
| `c2d764d670bb7cf0cde4d4131bc277aceebe9f1d8980ee70a0530131f7ace367` | `fixtures/known-geometry.pdf` |
| `bfae5f0219298941dcaab87712883ed35cef3ce97194891350710b97e6f5863f` | `fixtures/known-geometry.json` |
| `c01d0bb46f765e3c26627edeb3111c692c81b0728f41532f1f9479c479c47ee2` | `fixtures/mixed-pages.pdf` |
| `827199af6231e3b14fa27b925ab0e4b7d724bb4bdf2367fa73a0e9c4f607b977` | `fixtures/malformed-text.pdf` |
| `1a980c9da040ca0c0c1c0dc31516be44ddcb6dd801bdabfdfe731c373e27ea0c` | `fixtures/malformed-truncated.pdf` |
| `b14f0ecbc0a108ebe5da099cb9321693bae56168a348e58fbbd30e813d618537` | `handoff/screenshots/01-library.png` |
| `700db4edfea45aac50319c28f81829554ceee634e833d53a521c216d04ab6317` | `handoff/screenshots/02-sample-sheet.png` |
| `a23c4928aa16dd267d96ffa27555bbec9fc5e76c7aeed7399a0ad76fb3757f25` | `handoff/screenshots/03-markup-takeoff-tasks.png` |
| `4018d9ea6a682cabcaae6a939ebdbb86168c278423ca4985719995598d727ead` | `handoff/screenshots/04-reopened.png` |
| `4f6a4994d09c371bbe5fd59f4a3be47c09dc0f77ce04bb60ae4ae500ac5452ed` | `handoff/screenshots/05-revision-kept.png` |
| `b20831ea89d587de53302bf19def4ed2cb826cf9ec11290b2c7267b2ee6d14cb` | `handoff/screenshots/06-conflict.png` |
| `cea65639ead1fb05b45b5a3af8f466658b193a2de308ec21e269b86296897ac9` | `package-lock.json` |
| `621dca1de3a595e8df7fa4bd426473f5dc0871008311beaec0b65bee9b22052e` | `evidence/rea/pdfexpert-measure-capture.json` |
| `74eeeb68f94e4c3981db757dedad3d7e566be71770b7bdc02b8a07dc5638b225` | `evidence/rea/doctor-rea-agents-6.7.0.json` |

`npm run build` writes `dist/`, which is gitignored. Rebuild it; do not trust a copied `dist` from another machine without rebuilding.

## Dependencies

Direct packages, from each installed `package.json` `license` field:

| Package | Version | License |
| --- | --- | --- |
| pdf-lib | 1.17.1 | MIT |
| pdfjs-dist | 4.10.38 | Apache-2.0 |
| vite | 6.4.1 | MIT |
| vitest | 3.2.4 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| playwright | 1.58.2 | Apache-2.0 |
| fake-indexeddb | 6.2.5 | Apache-2.0 |
| tsx | 4.20.6 | MIT |
| @types/node | 22.19.1 | MIT |

The app's own source is part of this repository and follows the repository license. pdf.js and pdf-lib are the components that touch PDF bytes.

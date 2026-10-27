# 7. CLONE / REA

One Cursor cloud agent authored this packet and reviewed its own diff. Codex and Claude account tooling from the brief were not available and were not used.

## 1. CLONE source inspected

- `README.md` quick start, the `rea` launcher, and the target table.
- `AGENTS.md` and `CONTRIBUTING.md` pointers used for the PR template.
- `scripts/rea.mjs`: the CLI exits if `dist/` is missing.
- `package.json` version `6.7.0`.
- `.agents/skills/reverse-engineer-anything/SKILL.md` and `references/connection-and-recovery.md`.
- `docs/cli.md` and `docs/browser-scenario-contract.md`, plus the scenario schema in `src/domain/browserScenario.ts` and `src/domain/browserScenarioValues.ts`.
- Installed skill file says version 43. Published `rea-agents@6.7.0` doctor reported `expected_skill_version` 42. The clone source and the published package are not the same byte-for-byte skill.

No REA source file was edited.

## 2. Mechanisms reused

None of the REA runtime is imported by this app. The product does not call REA, Ghidra, Hopper, or IDA. The investigation habit that was followed: separate observation, inference, and what was not run, and keep the evidence file next to the claim.

## 3. REA actually executed

Local launcher, this clone, compiled runtime absent:

```text
node scripts/rea.mjs doctor --json
```

Exit 1. Stderr: `REA's compiled runtime is missing. Run npm ci && npm run build:cached`.

Published package matching `package.json`:

```text
npx -y rea-agents@6.7.0 doctor --json
```

Exit 1 because the audit is unhealthy, not because the CLI failed to start. `cli_package_version` is `6.7.0`. Node 22.23.4 and Ubuntu 24.04 passed. Hopper, Ghidra, IDA, JADX, and Kuna are not configured. Cursor MCP registration is missing. Artifact: `evidence/rea/doctor-rea-agents-6.7.0.json`, SHA-256 `74eeeb68f94e4c3981db757dedad3d7e566be71770b7bdc02b8a07dc5638b225`.

Public help page, no upload and no credentials in the URL:

```text
npx -y rea-agents@6.7.0 capture-browser-scenario evidence/rea/pdfexpert-measure-scenario.json --json
```

Exit 0. Operation `capture_browser_scenario`. Evidence id `ev_111e816efa11979353cecb3d3e3abf89125c0c2ae1b567ea65c74198f81b585a`. Final URL is the Readdle scale-and-measure article. The retained accessibility text includes Calibrate and Distance. Artifact SHA-256 `621dca1de3a595e8df7fa4bd426473f5dc0871008311beaec0b65bee9b22052e`. Stderr was empty.

That capture observed the public help page. It did not observe the iPad app.

## 4. Proposed and not executed

- `open_binary` on PDF Expert. No IPA or binary was provided. Linux cannot install the iPad app. Hopper, Ghidra, and IDA are not installed. The brief limits research to public docs, so a proprietary binary was not downloaded.
- `rea setup --yes`. That writes client config and was not approved. Setup was not run.
- MCP tools in this session. REA is not registered here. Doctor cannot prove a live MCP connection, and none was used.
- Building this clone's `dist/` with `npm run build:cached`. The published 6.7.0 CLI was used instead. A source-tree build might differ from that package where the skill version already differs.

Granola meeting notes were not available: the Granola tool returned that the user has not created an account. No meeting was used as a requirement.

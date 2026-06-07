# Adapter fixtures (K1)

Real-world responses from every external CLI / API the product depends on. Each fixture is the literal stdout/stderr the harness has observed — never a hand-crafted ideal — so the parser unit test catches malformed responses (e.g. CoinFello's `0x...\n⚠️ Only fund...` plain-text mix that broke `getWallet()` in the previous Ralphathon).

## Convention

```
adapter_fixtures/
├── coinfello/
│   ├── get_account.real.txt        # raw CLI stdout
│   ├── get_account.real.exit       # exit code (integer, one line)
│   ├── get_account.parsed.json     # expected parser output
│   └── ...
└── <other-provider>/
```

## When to add a fixture

- **Before** writing a parser: capture the real response first.
- **When** a parser fails in production: capture the failing response and commit it as a regression fixture.
- **After** any provider version bump: re-capture to detect contract drift.

## Loop usage (activated when `src/` exists)

Parser unit tests load every `*.real.txt` in this tree, run the parser, and compare against `*.parsed.json`. Mismatch = build fails. Until `src/` lands this directory is a placeholder — do not delete it.

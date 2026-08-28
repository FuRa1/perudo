# Fonts

Self-hosted, not loaded from any CDN/remote origin (CLAUDE.md 8.1 / Phase 4 typography). Both
sourced from the [Google Fonts repository](https://github.com/google/fonts) (`ofl/` = SIL Open
Font License 1.1 fonts), which co-locates each font's actual license text with its files — the
`*-OFL.txt` file next to each font here is that exact upstream license, unmodified.

| File | Font | Weight(s) | License | Used for |
| --- | --- | --- | --- | --- |
| `PirataOne-Regular.ttf` | Pirata One | 400 | SIL OFL 1.1 (`PirataOne-OFL.txt`) | `--font-heading`: game title, major headings, round-result banners, decorative labels only |
| `EBGaramond-Variable.ttf` | EB Garamond | 400–800 (variable) | SIL OFL 1.1 (`EBGaramond-OFL.txt`) | `--font-body`: everything read for precision — buttons, nicknames, room codes, bid quantities, the current-bid badge, dice counts, timer values, error/accessibility text |

Both are wired in `client/src/theme/_tokens.scss` via `@font-face` (`font-display: swap`, with a
system-font fallback stack on `--font-heading`/`--font-body` so a failed/slow font load never
breaks layout). No component or template needs to change to swap either file for a different
one later — only the token file.

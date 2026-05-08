# Decision: pd2-tools license posture

**Date:** 2026-05-08

## Result

License found: **MIT**

## License Content

The `coleestrin/pd2-tools` repository is distributed under the MIT License. The file begins with "MIT License" and is copyrighted by coleestrin (2025). The license grants permission to use, modify, distribute, and sublicense the software without restriction, provided that the original copyright notice and license text are included in all copies or substantial portions of the work.

## Implication

- **MIT License:** We may copy mod-label maps and item-base data verbatim into `data/mod-dictionary.json` with attribution comment in source files.
- Attribution requirement: Include the original copyright notice and MIT license text in any files derived from pd2-tools.
- No copyleft restrictions: modifications and proprietary use are permitted.

## Action

`scripts/build-mod-dictionary.ts` is implemented to **copy directly** from pd2-tools label maps and item-base data, with inline attribution comments crediting the original source and including the MIT license clause.

## Reference

Source: https://raw.githubusercontent.com/coleestrin/pd2-tools/main/LICENSE

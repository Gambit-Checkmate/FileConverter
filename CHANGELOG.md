# Changelog

## [1.7.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.6.1...fileconverter-v1.7.0) (2026-09-26)


### Features

* **gui:** attach desktop builds to GitHub releases ([2d9744c](https://github.com/Marentius/FileConverter/commit/2d9744c92a1c64c8c35b95bdd8e0192a440d97bd))
* **gui:** migrate desktop app from Tauri to Electron ([267e6d4](https://github.com/Marentius/FileConverter/commit/267e6d4427468cee2358ff92e3a793f0077cead4))


### Bug Fixes

* **deps:** override vulnerable tar in Electron tooling ([2d06c11](https://github.com/Marentius/FileConverter/commit/2d06c11fc64a7dd2066e25c9523aaa767b7cf25b))
* **deps:** upgrade package lock file and force release ([bb540c4](https://github.com/Marentius/FileConverter/commit/bb540c4839c54eab8d838095c9216c07383473fa))
* **gui:** build core before desktop worker tests ([21ef0d5](https://github.com/Marentius/FileConverter/commit/21ef0d5def6a4046e6ed4fdb385d4a9d97b96d87))

## [1.6.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.6.0...fileconverter-v1.6.1) (2026-08-09)


### Bug Fixes

* limit adapter validation to dry runs ([0336115](https://github.com/Marentius/FileConverter/commit/03361158fcd8aacaf6deb552999afdfa43cc9b88))
* validate dry-run conversions with adapters ([1fbf2b3](https://github.com/Marentius/FileConverter/commit/1fbf2b375826d85e21fae2a951fb4c104e7be6d0))

## [1.6.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.5.3...fileconverter-v1.6.0) (2026-07-30)


### Features

* add JSON conversion output ([afceb17](https://github.com/Marentius/FileConverter/commit/afceb17d2d32e2989e9617f53a99b19500d3e16c))
* add PDF text extraction ([0ac26ee](https://github.com/Marentius/FileConverter/commit/0ac26eef02c978ab5841d4ed08d47b0a8f273700))

## [1.5.3](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.5.2...fileconverter-v1.5.3) (2026-07-29)


### Bug Fixes

* upgrade pdfkit to remove jpeg-exif ([abfe575](https://github.com/Marentius/FileConverter/commit/abfe57559cc0251eb77a2f5ba8c1ecf6260233e9))
* upgrade pdfkit to remove jpeg-exif ([f879318](https://github.com/Marentius/FileConverter/commit/f879318c6c3775d3c4ba9c994355fdb4c3992067))

## [1.5.2](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.5.1...fileconverter-v1.5.2) (2026-07-29)


### Bug Fixes

* honor explicit CLI output file paths ([03b14a7](https://github.com/Marentius/FileConverter/commit/03b14a7b7b52f57c872d1e694db0f464198cee78))
* honor explicit CLI output file paths ([7448360](https://github.com/Marentius/FileConverter/commit/7448360673fe296fbdbe206ff794a1923c3bb53f))

## [1.5.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.5.0...fileconverter-v1.5.1) (2026-07-29)


### Bug Fixes

* prefer LibreOffice for office PDF output ([5cdb8a8](https://github.com/Marentius/FileConverter/commit/5cdb8a8c344167aa7be10ee3130a6497d7fe1c4d))
* prefer Microsoft Word for document PDFs ([ccf0fe7](https://github.com/Marentius/FileConverter/commit/ccf0fe73fa4225bd98984eb0e4f134c061a50136))
* prefer Microsoft Word for document PDFs ([0858484](https://github.com/Marentius/FileConverter/commit/08584849b2641cd5a3a36260232bf0aa0e012d07))

## [1.5.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.4.2...fileconverter-v1.5.0) (2026-07-29)


### Features

* add conversion job log output files ([#64](https://github.com/Marentius/FileConverter/issues/64)) ([bf88863](https://github.com/Marentius/FileConverter/commit/bf8886387de66ce2a64be7e8d80b2ce7e0772d53))


### Bug Fixes

* address PDF renderer review feedback ([a62e1ff](https://github.com/Marentius/FileConverter/commit/a62e1ff88223ce4a892a6c850f5c660fef2325f4))
* preserve structure in office PDF conversion ([86ee568](https://github.com/Marentius/FileConverter/commit/86ee5688748633112c8f00e1c84b63707e60dc24))
* preserve structure in office PDF conversion ([#67](https://github.com/Marentius/FileConverter/issues/67)) ([6601f29](https://github.com/Marentius/FileConverter/commit/6601f2934a90e936f395c455c8940aa363e2ff7b))
* sanitize HTML before PDF rendering ([760147f](https://github.com/Marentius/FileConverter/commit/760147fbac1954ed2c0f684b319dfcb584d2318f))

## [1.4.2](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.4.1...fileconverter-v1.4.2) (2026-07-28)


### Bug Fixes

* remove obsolete gui dependency checks ([#60](https://github.com/Marentius/FileConverter/issues/60)) ([88f7d67](https://github.com/Marentius/FileConverter/commit/88f7d6771c946646a60cba7ada82e1c771943e38))
* update vulnerable serde_with ([#63](https://github.com/Marentius/FileConverter/issues/63)) ([e15c0c6](https://github.com/Marentius/FileConverter/commit/e15c0c67671346d2f089f542205380a98d30adb2))

## [1.4.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.4.0...fileconverter-v1.4.1) (2026-07-28)


### Bug Fixes

* remove vulnerable jest tooling chain ([#59](https://github.com/Marentius/FileConverter/issues/59)) ([995b342](https://github.com/Marentius/FileConverter/commit/995b342d3415ff914baf56087ede57089efde4ae))
* update vulnerable conversion dependencies ([#57](https://github.com/Marentius/FileConverter/issues/57)) ([12c9a1c](https://github.com/Marentius/FileConverter/commit/12c9a1ca703f0acb5e7e94f0037b397acf0c4051))

## [1.4.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.3.4...fileconverter-v1.4.0) (2026-07-01)


### Features

* **core:** add SVG image input support ([2f468df](https://github.com/Marentius/FileConverter/commit/2f468df708319fa80585dad2a5739ecb9fac9e7d))


### Bug Fixes

* **core:** replace vulnerable xlsx dependency chain ([3a456fa](https://github.com/Marentius/FileConverter/commit/3a456fa5e39b971f0a831c498ea392c8e3377f20))

## [1.3.4](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.3.3...fileconverter-v1.3.4) (2026-06-01)


### Bug Fixes

* **core:** export OfficeAdapter from public API ([6a381f6](https://github.com/Marentius/FileConverter/commit/6a381f615877fb83f1c5c6c67dc45afd88e65726))
* **core:** export OfficeAdapter from public API ([e08883b](https://github.com/Marentius/FileConverter/commit/e08883b826928bd0e9acccf7c01ec8036ba7cb7d))
* **gui:** remove hardcoded converter paths ([9bdb40c](https://github.com/Marentius/FileConverter/commit/9bdb40c5ad220775123118cef01fd016f9458071))
* **gui:** remove hardcoded converter paths ([1f3b9ea](https://github.com/Marentius/FileConverter/commit/1f3b9eaa3d20b6a0dd6c42022a0bcca663859632))

## [1.3.3](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.3.2...fileconverter-v1.3.3) (2026-06-01)


### Bug Fixes

* **deps:** patch vulnerable transitive npm dependencies ([b414d6c](https://github.com/Marentius/FileConverter/commit/b414d6cc236bea3a3019c9bc49c1b70777739cf4))
* **deps:** patch vulnerable transitive npm dependencies ([6aa896b](https://github.com/Marentius/FileConverter/commit/6aa896b3e9b421badd7cdacbd4e41e1ab201cb1c))
* **deps:** update vulnerable Rust dependencies ([311b614](https://github.com/Marentius/FileConverter/commit/311b614c74a67aa88d43cbf4f013caa0490b765f))
* **deps:** update vulnerable Rust dependencies ([a7ac058](https://github.com/Marentius/FileConverter/commit/a7ac058a8063f4090809530a5dae1bb70f0d00ff))

## [1.3.2](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.3.1...fileconverter-v1.3.2) (2026-03-13)


### Bug Fixes

* warn users about limited PDF rendering quality ([7105939](https://github.com/Marentius/FileConverter/commit/710593989c6068515597541bb202d3133e6b6eed))

## [1.3.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.3.0...fileconverter-v1.3.1) (2026-03-13)


### Bug Fixes

* resolve CodeQL alerts in stripHtml and CI workflow ([51773e0](https://github.com/Marentius/FileConverter/commit/51773e047ef6bda6cb9017b3cfa378f86638c64d))
* resolve CodeQL security alerts in stripHtml and CI workflow ([e1be449](https://github.com/Marentius/FileConverter/commit/e1be44971e5c813f75ce3346953cef586d70a24b))
* resolve CodeQL security alerts in stripHtml and CI workflow ([c43747b](https://github.com/Marentius/FileConverter/commit/c43747bc7860fd26fcd3a7386edebb1750370889))
* resolve CodeQL security alerts in stripHtml and CI workflow ([a00c2ab](https://github.com/Marentius/FileConverter/commit/a00c2abde07102bd172b9d434987fdc93cc863c5))

## [1.3.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.2.1...fileconverter-v1.3.0) (2026-03-13)


### Features

* add office document format support (DOCX, XLSX, PPTX, ODT, RTF) ([b8e8373](https://github.com/Marentius/FileConverter/commit/b8e83730d101d298e40b9d27003fe9f5b32d77a8))
* show office formats in CLI formats command ([1bac66d](https://github.com/Marentius/FileConverter/commit/1bac66dca4ffbfcc2545b56bb8bbd599636b00a4))

## [1.2.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.2.0...fileconverter-v1.2.1) (2026-03-12)


### Bug Fixes

* update jest scripts to use --testPathPatterns for Jest 30 ([417d0fe](https://github.com/Marentius/FileConverter/commit/417d0fe16c1a5a993072c3a3371dce1d9643ca13))
* update jest scripts to use --testPathPatterns for Jest 30 ([bb599ea](https://github.com/Marentius/FileConverter/commit/bb599ea3d70509803b00d049c596f4619b619385))

## [1.2.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.1.3...fileconverter-v1.2.0) (2026-03-11)


### Features

* add npm publish with OIDC trusted publishing and provenance ([beb59c6](https://github.com/Marentius/FileConverter/commit/beb59c609fc630c8f578c458ab99ff04a1283976))
* add npm publish with OIDC trusted publishing and provenance ([9183280](https://github.com/Marentius/FileConverter/commit/91832807c0c3f11b0ce180f612bdc1562922b170))

## [1.1.3](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.1.2...fileconverter-v1.1.3) (2026-03-11)


### Bug Fixes

* add path traversal protection for file operations (CWE-22) ([ffa3967](https://github.com/Marentius/FileConverter/commit/ffa39672da8f572d2d182a28f6ab675eb159c70c))
* enforce file size limits to prevent resource exhaustion (CWE-770) ([161c906](https://github.com/Marentius/FileConverter/commit/161c9065b3bbc69be5f8147341aa6505df3eb40c))
* replace any type with ConversionOptions in PDF CLI handler ([e05609a](https://github.com/Marentius/FileConverter/commit/e05609a1e47f575b1959bf592eb65e9d56145ca4))
* sanitize log output to prevent log injection attacks (CWE-117) ([55c48d0](https://github.com/Marentius/FileConverter/commit/55c48d0fb968fe6e9e0e34a68c9555871f1ba785))
* use crypto.randomBytes for job ID generation (CWE-330) ([bedaef2](https://github.com/Marentius/FileConverter/commit/bedaef21d5c019cbeacec58015d009712d0caea7))
* use eslint-disable for control-char regex in log sanitizer ([ab12341](https://github.com/Marentius/FileConverter/commit/ab1234137bfe228851f90169fa6ee643b1ff7012))
* validate CLI numeric parameters and PDF page ranges (CWE-20) ([9eaf114](https://github.com/Marentius/FileConverter/commit/9eaf114aa1fda1163c9b0b779e19855e9f335544))

## [1.1.2](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.1.1...fileconverter-v1.1.2) (2026-03-11)


### Bug Fixes

* use PAT for release-please to trigger CI on release PRs ([cbd435f](https://github.com/Marentius/FileConverter/commit/cbd435fcec363d821d286fd18f4ca0e26b0c62f4))

## [1.1.1](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.1.0...fileconverter-v1.1.1) (2026-03-11)


### Bug Fixes

* inject version from package.json at build time instead of hardcoding ([0b7250c](https://github.com/Marentius/FileConverter/commit/0b7250c2565b7aff334c3f52aa2d2ee2bffd93a4))

## [1.1.0](https://github.com/Marentius/FileConverter/compare/fileconverter-v1.0.0...fileconverter-v1.1.0) (2026-03-11)


### Features

* automate releases with release-please ([156e8d5](https://github.com/Marentius/FileConverter/commit/156e8d5cfc58a34a1e512b23419eca5bdb2c4d94))


### Bug Fixes

* install Pandoc and LaTeX in CI e2e-test job ([371db68](https://github.com/Marentius/FileConverter/commit/371db68ff9829780cc089bc2ec2c36324b9af3f1))
* require CI to pass before running release workflow ([b44a3e6](https://github.com/Marentius/FileConverter/commit/b44a3e6ecc62b2ef9bf4792ad8450d35505da3d3))
* use bash shell for cross-platform binary packaging in CI ([a4a3bdb](https://github.com/Marentius/FileConverter/commit/a4a3bdbee1348304b083ac4346c03e7035299af9))

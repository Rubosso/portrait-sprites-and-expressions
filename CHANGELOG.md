# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-23

### Added
- Initial release of Portrait Sprites & Expressions module
- Custom canvas layer for rendering portrait sprites
- PIXI.Container-based sprite system with body and head sprites
- Shared BaseTexture for efficient memory usage
- Multiple expression frames support for head sprites
- Expression cycling HUD with prev/next buttons
- Scene flags data storage (no custom Documents)
- Programmatic API for managing sprites
- Comprehensive documentation and examples
- Foundry VTT v13 compatibility

### Technical Features
- Uses PIXI.Rectangle for frame definitions
- updateUvs() implementation for efficient expression switching
- No core patches or hooks modifications
- Clean, minimal implementation

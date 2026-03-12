# simple-3d-modeling-mcp

An MCP (Model Context Protocol) server that lets anyone create, iterate on, and export 3D models through natural conversation with an LLM. **Zero setup** — the OpenSCAD engine is bundled via WebAssembly. No system install needed.

## Features

- **Zero-setup** — `npm install simple-3d-modeling-mcp` and go. OpenSCAD runs via bundled WASM.
- **Inline previews** — rendered PNG images appear directly in the chat
- **Turntable animations** — 360 degree animated previews (APNG) for first-look at new models
- **Multi-view grids** — front, right, top, and perspective in a single image
- **Live browser viewer** — interactive 3D viewer with rotate/zoom/pan, auto-updates on each render
- **Print-ready exports** — STL, 3MF, AMF, and more formats for 3D printing
- **Native OpenSCAD support** — optionally install OpenSCAD for faster rendering and library support (BOSL2, MCAD)

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openscad": {
      "command": "npx",
      "args": ["-y", "simple-3d-modeling-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add openscad -- npx -y simple-3d-modeling-mcp
```

That's it. No OpenSCAD install. No PATH configuration.

## Tools

| Tool | Description |
|------|-------------|
| `render` | Render code to a PNG preview image (also pushes to live viewer) |
| `render_turntable` | 360 degree turntable animation (APNG) |
| `render_multiview` | Multi-view grid (front, right, top, perspective) |
| `export` | Export to STL, 3MF, AMF, OFF, DXF, SVG |
| `validate` | Syntax-check without full render |
| `open_viewer` | Open interactive 3D viewer in browser |
| `cheatsheet` | OpenSCAD language quick-reference |
| `list_libraries` | Discover installed libraries (native OpenSCAD only) |
| `get_version` | Check engine info (WASM or native) |
| `read_scad_file` | Read an existing .scad file |

## Live Browser Viewer

On first render, an interactive 3D viewer automatically opens in your browser:

- **Live updates** — model refreshes automatically on every render
- **Model history** — sidebar shows every version, click to revisit
- **Dimensions** — bounding box and volume computed from geometry
- **Export** — download STL directly from the viewer
- **Controls** — rotate (drag), zoom (scroll), pan (right-drag), wireframe, auto-rotate, grid

## Native OpenSCAD (Optional)

For faster rendering and library support, install [OpenSCAD](https://openscad.org/downloads.html). The server auto-detects it on your PATH and uses it when available.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENSCAD_PATH` | Explicit path to native OpenSCAD binary | auto-detected |
| `OPENSCAD_WORK_DIR` | Directory for temporary render files | OS temp dir |

## Example Conversation

> **You:** Make me a phone stand that holds the phone at 60 degrees
>
> **Claude:** *calls render* — Here's a phone stand with a 60 degree viewing angle. The base is 80mm wide with a 3mm lip. The interactive 3D viewer is open in your browser too. Want me to adjust anything?
>
> **You:** Make it thicker and add a cable slot in the back
>
> **Claude:** *modifies code, calls render* — Updated! Wall thickness is now 4mm with a 12mm cable slot. Check the viewer to spin it around.
>
> **You:** Perfect! Export it for my 3D printer
>
> **Claude:** *calls export(format="3mf")* — Exported to ~/Desktop/phone-stand.3mf (42 KB). Ready to slice and print!

## Development

```bash
npm install
npm run build        # compile TypeScript
npm test             # run tests
npm run dev          # watch mode
```

## License

GPL-2.0 (required by the openscad-wasm dependency)

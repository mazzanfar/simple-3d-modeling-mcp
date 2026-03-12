/**
 * OpenSCAD language cheatsheet — returned as a resource and used by the
 * get_cheatsheet tool so the LLM always has syntax at hand.
 */

export const OPENSCAD_CHEATSHEET = `
# OpenSCAD Quick Reference

## 2-D Primitives
  circle(r|d)
  square(size, center)
  polygon(points, paths)
  text(text, size, font, halign, valign)

## 3-D Primitives
  cube(size, center)
  sphere(r|d)
  cylinder(h, r|d, r1|d1, r2|d2, center)
  polyhedron(points, faces)

## Transformations
  translate([x, y, z])
  rotate([x, y, z])   // degrees
  scale([x, y, z])
  mirror([x, y, z])
  multmatrix(m)
  color("name"|[r,g,b,a])
  offset(r|delta, chamfer)
  hull()
  minkowski()
  resize([x, y, z], auto)

## Boolean Operations
  union()
  difference()
  intersection()

## Extrusions
  linear_extrude(height, center, convexity, twist, slices, scale)
  rotate_extrude(angle, convexity)

## Modules & Functions
  module name(params) { ... }
  function name(params) = expr;

## Control Flow
  for (i = [start:step:end]) { ... }
  for (i = list) { ... }
  if (cond) { ... } else { ... }
  let (assignments) { ... }
  intersection_for(i = list) { ... }

## Math Functions
  abs, sign, sin, cos, tan, asin, acos, atan, atan2
  floor, ceil, round, ln, log, exp, pow, sqrt
  min, max, norm, cross
  rands(min, max, count, seed)

## String / List Functions
  len(val), str(val, ...)
  concat(a, b, ...), chr(num), ord(char)
  search(match, string_or_vector)
  lookup(key, [[key,val],...])

## Special Variables
  $fn  — number of fragments (circle smoothness)
  $fa  — minimum fragment angle
  $fs  — minimum fragment size
  $t   — animation step [0,1)
  $vpr — viewport rotation
  $vpt — viewport translation
  $vpd — viewport distance
  $vpf — viewport FOV

## Import / Use
  include <file.scad>   // inline the file
  use <file.scad>       // import modules/functions only
  import("file.stl")    // import geometry

## Render Control
  render(convexity)     // force CGAL render
  %  — transparent/background modifier
  #  — debug/highlight modifier
  !  — root modifier (show only this)
  *  — disable modifier (skip this)

## Tips for AI-generated models
  - Always set $fn for smooth curves (e.g. $fn=64)
  - Use modules for reusable parts
  - Use difference() for subtractive modeling
  - Parametrize dimensions with variables at the top
  - center=true on primitives for easier alignment
`.trim();

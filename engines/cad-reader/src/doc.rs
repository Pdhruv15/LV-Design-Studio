//! The CAD view's document: a DWG / DXF drawing flattened for drawing and snapping, as a CAD program shows model space.
//! Blocks are expanded with their transforms (nested, arrays), colours resolved (ByLayer / ByBlock / index / true
//! colour), curves tessellated, texts kept with their height and rotation, and snap points (endpoint, midpoint,
//! centre, quadrant, insertion, node) indexed on a grid with the segments for intersections. 2D (plan) only.

use acadrust::entities::mtext_format::parse_mtext;
use acadrust::entities::{BoundaryEdge, EntityType};
use acadrust::types::Color;
use acadrust::{CadDocument, DwgReader, DxfReader};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::f64::consts::PI;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

mod explode;

/// Snap kinds (bits of the snap mask).
pub const ENDPOINT: u32 = 1;
pub const MIDPOINT: u32 = 2;
pub const CENTER: u32 = 4;
pub const INTERSECTION: u32 = 8;
pub const INSERTION: u32 = 16;
pub const NODE: u32 = 32;
pub const QUADRANT: u32 = 64;
/// The point on a line or curve nearest the cursor.
pub const NEAREST: u32 = 128;
/// The foot of the perpendicular from the last point picked onto a line or curve.
pub const PERPENDICULAR: u32 = 256;

/// Colour for "foreground" (index 7: white on dark, black on light), decided by the view.
const INK: u32 = 0xFF00_0007;
const MAX_SEGMENTS: usize = 3_000_000;
const MAX_DEPTH: u32 = 12;

#[derive(Clone, Copy)]
struct Affine { a: f64, b: f64, c: f64, d: f64, e: f64, f: f64 } // x' = a x + c y + e; y' = b x + d y + f

impl Affine {
    const ID: Affine = Affine { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 };
    fn apply(&self, x: f64, y: f64) -> (f64, f64) { (self.a * x + self.c * y + self.e, self.b * x + self.d * y + self.f) }
    fn then(&self, o: &Affine) -> Affine {
        // self ∘ o: apply o first, then self
        Affine {
            a: self.a * o.a + self.c * o.b, b: self.b * o.a + self.d * o.b,
            c: self.a * o.c + self.c * o.d, d: self.b * o.c + self.d * o.d,
            e: self.a * o.e + self.c * o.f + self.e, f: self.b * o.e + self.d * o.f + self.f,
        }
    }
    fn translate(x: f64, y: f64) -> Affine { Affine { e: x, f: y, ..Affine::ID } }
    fn rotate(r: f64) -> Affine { let (s, c) = r.sin_cos(); Affine { a: c, b: s, c: -s, d: c, e: 0.0, f: 0.0 } }
    fn scale(x: f64, y: f64) -> Affine { Affine { a: x, b: 0.0, c: 0.0, d: y, e: 0.0, f: 0.0 } }
    /// Length scale (for text heights and radii).
    fn size(&self) -> f64 { (self.a * self.d - self.b * self.c).abs().sqrt() }
    fn angle(&self) -> f64 { self.b.atan2(self.a) }
}

#[derive(Serialize)]
struct LayerInfo { name: String, rgb: u32, on: bool, count: u32 }

#[derive(Serialize)]
struct TextItem { x: f64, y: f64, h: f64, rot: f64, s: String, layer: u16, rgb: u32, align: u8, o: u32 }

/** What one object of model space is, for inspecting it: kind, layer, handle, block and attributes, and its length /
 * area in drawing units. Its drawn segments are `seg_start..seg_end`. */
#[derive(Serialize, Clone, Default)]
struct ObjInfo {
    kind: &'static str,
    layer: u16,
    handle: String,
    #[serde(skip_serializing_if = "Option::is_none")] block: Option<String>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")] attrs: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")] length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] area: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] vertices: Option<usize>,
    closed: bool,
    seg_start: u32,
    seg_end: u32,
}

struct SnapPoint { x: f64, y: f64, kind: u32, layer: u16, o: u32 }

/// A filled area: a solid hatch or 2D solid (`solid`), or a pattern hatch with its pattern lines (drawing units,
/// absolute). Its loops are ranges of drawn segments (`seg_start..seg_end`), each one closed boundary.
#[derive(Serialize)]
struct Fill { layer: u16, rgb: u32, solid: bool, loops: Vec<[u32; 2]>, lines: Vec<PatLine> }
#[derive(Serialize)]
struct PatLine { angle: f64, base: [f64; 2], offset: [f64; 2], dashes: Vec<f64> }

/// An external reference inside the drawing: its block name, the path saved with it, overlay or attach, unloaded in
/// the drawing, and where model space inserts it (point, scale, rotation in radians).
#[derive(Serialize, Clone)]
struct XrefInfo { name: String, path: String, overlay: bool, unloaded: bool, inserts: Vec<XrefInsert> }
#[derive(Serialize, Clone)]
struct XrefInsert { x: f64, y: f64, sx: f64, sy: f64, rot: f64 }

/// The external references of a drawing, with their inserts in model space.
fn xrefs_of(doc: &CadDocument) -> Vec<XrefInfo> {
    let mut out: Vec<XrefInfo> = doc.block_records.iter()
        .filter(|r| r.flags.is_xref || r.flags.is_xref_overlay || r.flags.is_external)
        .map(|r| {
            let path = if !r.xref_path.is_empty() { r.xref_path.clone() } else {
                match doc.get_entity(r.block_entity_handle) { Some(EntityType::Block(b)) => b.xref_path.clone(), _ => String::new() }
            };
            XrefInfo { name: r.name.clone(), path, overlay: r.flags.is_xref_overlay, unloaded: r.flags.is_xref_unloaded, inserts: vec![] }
        })
        .collect();
    for e in doc.model_space_entities() {
        if let EntityType::Insert(x) = e {
            if let Some(info) = out.iter_mut().find(|i| i.name.eq_ignore_ascii_case(&x.block_name)) {
                info.inserts.push(XrefInsert { x: x.insert_point.x, y: x.insert_point.y, sx: x.x_scale(), sy: x.y_scale(), rot: x.rotation });
            }
        }
    }
    out
}

#[wasm_bindgen]
pub struct CadDoc {
    format: &'static str,
    units: i16,
    origin: (f64, f64),
    segs: Vec<f64>, // x1, y1, x2, y2 in drawing units
    seg_layer: Vec<u16>,
    seg_rgb: Vec<u32>,
    seg_real: Vec<bool>, // a drawn straight piece (not a curve tessellation step) — used for intersections
    seg_obj: Vec<u32>, // the model-space object each segment belongs to
    seg_lt: Vec<u16>, // the dash pattern each segment is drawn with (index into `linetypes`; 0 continuous)
    linetypes: Vec<Vec<f64>>, // dash patterns in drawing units: dash > 0, gap < 0, dot 0
    fills: Vec<Fill>,
    objects: Vec<ObjInfo>,
    texts: Vec<TextItem>,
    snaps: Vec<SnapPoint>,
    layers: Vec<LayerInfo>,
    grid: Grid,
    truncated: bool,
    xrefs: Vec<XrefInfo>,
    /// Model-space objects erased in the app (CROP): not picked or snapped to (see `set_erased`).
    erased: Vec<bool>,
}

struct Grid { x0: f64, y0: f64, cell: f64, nx: usize, ny: usize, segs: Vec<Vec<u32>>, pts: Vec<Vec<u32>> }

impl Grid {
    fn cell_of(&self, x: f64, y: f64) -> (usize, usize) {
        let cx = ((x - self.x0) / self.cell).floor().clamp(0.0, (self.nx - 1) as f64) as usize;
        let cy = ((y - self.y0) / self.cell).floor().clamp(0.0, (self.ny - 1) as f64) as usize;
        (cx, cy)
    }
}

struct Builder<'a> {
    doc: &'a CadDocument,
    layer_index: HashMap<String, u16>,
    layer_rgb: Vec<u32>,
    blocks: HashMap<String, (f64, f64)>, // block name (upper) → base point
    out: CadDoc,
    current: u32,
    layer_lt: Vec<String>, // each layer's linetype name
    lt_defs: HashMap<String, Vec<f64>>, // linetype name (upper) → pattern (unscaled)
    lt_index: HashMap<(String, u64), u16>, // (name, scale bits) → index in out.linetypes
    lt: u16, // the dash pattern of the entity being drawn (ByBlock children keep their insert's)
    ltscale: f64,
}

fn rgb_of(c: &Color) -> Option<u32> {
    match c {
        Color::Index(7) => Some(INK),
        _ => c.rgb().map(|(r, g, b)| ((r as u32) << 16) | ((g as u32) << 8) | b as u32),
    }
}

impl<'a> Builder<'a> {
    fn layer(&mut self, name: &str) -> u16 {
        if let Some(i) = self.layer_index.get(name) { return *i; }
        let i = self.out.layers.len() as u16;
        self.out.layers.push(LayerInfo { name: name.to_string(), rgb: INK, on: true, count: 0 });
        self.layer_rgb.push(INK);
        self.layer_lt.push(String::new());
        self.layer_index.insert(name.to_string(), i);
        i
    }

    /// The layer and colour an entity is drawn with: layer "0" and ByBlock inside a block take the insert's.
    fn style(&mut self, layer: &str, color: &Color, parent: (u16, u32)) -> (u16, u32) {
        let l = if layer == "0" && parent.0 != u16::MAX { parent.0 } else { self.layer(layer) };
        let rgb = match color {
            Color::ByLayer => self.layer_rgb[l as usize],
            Color::ByBlock => if parent.1 == u32::MAX { INK } else { parent.1 },
            Color::None => INK,
            c => rgb_of(c).unwrap_or(INK),
        };
        (l, rgb)
    }

    fn seg(&mut self, t: &Affine, p: (f64, f64), q: (f64, f64), l: u16, rgb: u32, real: bool) {
        if self.out.seg_layer.len() >= MAX_SEGMENTS { self.out.truncated = true; return; }
        let (x1, y1) = t.apply(p.0, p.1);
        let (x2, y2) = t.apply(q.0, q.1);
        if !(x1.is_finite() && y1.is_finite() && x2.is_finite() && y2.is_finite()) { return; }
        self.out.segs.extend_from_slice(&[x1, y1, x2, y2]);
        self.out.seg_layer.push(l);
        self.out.seg_rgb.push(rgb);
        self.out.seg_real.push(real);
        self.out.seg_obj.push(self.current);
        self.out.seg_lt.push(self.lt);
        self.out.layers[l as usize].count += 1;
    }

    /// The dash pattern of a linetype at a scale, as an index into the drawing's patterns (0: continuous).
    fn linetype(&mut self, name: &str, scale: f64) -> u16 {
        let key = name.to_uppercase();
        let Some(def) = self.lt_defs.get(&key) else { return 0 };
        if def.is_empty() || def.iter().all(|x| *x >= 0.0) || !scale.is_finite() || scale <= 0.0 { return 0; }
        let k = (key, scale.to_bits());
        if let Some(i) = self.lt_index.get(&k) { return *i; }
        let i = self.out.linetypes.len() as u16;
        self.out.linetypes.push(def.iter().map(|x| x * scale).collect());
        self.lt_index.insert(k, i);
        i
    }

    /// The segments a closed boundary is drawn with, from here on: call before drawing it, then `loop_end`.
    fn loop_start(&self) -> u32 { self.out.seg_layer.len() as u32 }

    fn snap(&mut self, t: &Affine, p: (f64, f64), kind: u32, l: u16) {
        let (x, y) = t.apply(p.0, p.1);
        if x.is_finite() && y.is_finite() { self.out.snaps.push(SnapPoint { x, y, kind, layer: l, o: self.current }); }
    }

    fn polyline(&mut self, t: &Affine, pts: &[(f64, f64, f64)], closed: bool, l: u16, rgb: u32) {
        let n = pts.len();
        if n == 0 { return; }
        let last = if closed { n } else { n - 1 };
        for i in 0..last {
            let a = pts[i];
            let b = pts[(i + 1) % n];
            if a.2.abs() < 1e-9 {
                self.seg(t, (a.0, a.1), (b.0, b.1), l, rgb, true);
                self.snap(t, ((a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0), MIDPOINT, l);
            } else {
                // Bulged (arc) segment: bulge = tan(θ/4)
                let theta = 4.0 * a.2.atan();
                let chord = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
                if chord < 1e-12 { continue; }
                let r = chord / (2.0 * (theta.abs() / 2.0).sin());
                let mx = (a.0 + b.0) / 2.0;
                let my = (a.1 + b.1) / 2.0;
                let h = (r * r - (chord / 2.0).powi(2)).max(0.0).sqrt() * if theta.abs() > PI { -1.0 } else { 1.0 } * theta.signum();
                let cx = mx - h * (b.1 - a.1) / chord;
                let cy = my + h * (b.0 - a.0) / chord;
                let start = (a.1 - cy).atan2(a.0 - cx);
                self.arc_pts(t, (cx, cy), r, start, start + theta, l, rgb);
                let mid = start + theta / 2.0;
                self.snap(t, (cx + r * mid.cos(), cy + r * mid.sin()), MIDPOINT, l);
                self.snap(t, (cx, cy), CENTER, l);
            }
        }
        for p in pts { self.snap(t, (p.0, p.1), ENDPOINT, l); }
    }

    fn arc_pts(&mut self, t: &Affine, c: (f64, f64), r: f64, a0: f64, a1: f64, l: u16, rgb: u32) {
        let sweep = a1 - a0;
        let n = ((sweep.abs() / (PI / 36.0)).ceil() as usize).clamp(2, 256);
        let mut prev = (c.0 + r * a0.cos(), c.1 + r * a0.sin());
        for i in 1..=n {
            let a = a0 + sweep * i as f64 / n as f64;
            let p = (c.0 + r * a.cos(), c.1 + r * a.sin());
            self.seg(t, prev, p, l, rgb, false);
            prev = p;
        }
    }

    fn text(&mut self, t: &Affine, at: (f64, f64), h: f64, rot: f64, s: String, l: u16, rgb: u32, align: u8) {
        if s.trim().is_empty() { return; }
        let (x, y) = t.apply(at.0, at.1);
        self.out.texts.push(TextItem { x, y, h: h * t.size(), rot: rot + t.angle(), s, layer: l, rgb, align, o: self.current });
        self.snap(t, at, INSERTION, l);
    }

    fn entity(&mut self, e: &EntityType, t: &Affine, parent: (u16, u32), depth: u32) {
        let c = e.common();
        if c.invisible { return; }
        let (l, rgb) = self.style(&c.layer, &c.color, parent);
        // Linetype: its own, the layer's (ByLayer), or the insert's (ByBlock), at LTSCALE × its scale × the insert's.
        let outer = self.lt;
        let named = c.linetype.trim().to_uppercase();
        if named != "BYBLOCK" {
            let name = if named.is_empty() || named == "BYLAYER" { self.layer_lt[l as usize].clone() } else { named };
            let k = if c.linetype_scale > 0.0 { c.linetype_scale } else { 1.0 };
            self.lt = self.linetype(&name, self.ltscale * k * t.size());
        }
        self.entity_drawn(e, t, l, rgb, depth);
        self.lt = outer;
    }

    fn entity_drawn(&mut self, e: &EntityType, t: &Affine, l: u16, rgb: u32, depth: u32) {
        // Entities whose extrusion points down (mirrored in plan): x mirrored in their own coordinates.
        let mirror = |n: &acadrust::types::Vector3, t: &Affine| if n.z < -0.5 { t.then(&Affine::scale(-1.0, 1.0)) } else { *t };
        match e {
            EntityType::Line(x) => {
                self.seg(t, (x.start.x, x.start.y), (x.end.x, x.end.y), l, rgb, true);
                self.snap(t, (x.start.x, x.start.y), ENDPOINT, l);
                self.snap(t, (x.end.x, x.end.y), ENDPOINT, l);
                self.snap(t, ((x.start.x + x.end.x) / 2.0, (x.start.y + x.end.y) / 2.0), MIDPOINT, l);
            }
            EntityType::Arc(x) => {
                let t = mirror(&x.normal, t);
                let mut a1 = x.end_angle;
                while a1 <= x.start_angle { a1 += 2.0 * PI; }
                self.arc_pts(&t, (x.center.x, x.center.y), x.radius, x.start_angle, a1, l, rgb);
                let c = (x.center.x, x.center.y);
                for a in [x.start_angle, a1] { self.snap(&t, (c.0 + x.radius * a.cos(), c.1 + x.radius * a.sin()), ENDPOINT, l); }
                let m = (x.start_angle + a1) / 2.0;
                self.snap(&t, (c.0 + x.radius * m.cos(), c.1 + x.radius * m.sin()), MIDPOINT, l);
                self.snap(&t, c, CENTER, l);
            }
            EntityType::Circle(x) => {
                let t = mirror(&x.normal, t);
                let c = (x.center.x, x.center.y);
                self.arc_pts(&t, c, x.radius, 0.0, 2.0 * PI, l, rgb);
                self.snap(&t, c, CENTER, l);
                for k in 0..4 { let a = k as f64 * PI / 2.0; self.snap(&t, (c.0 + x.radius * a.cos(), c.1 + x.radius * a.sin()), QUADRANT, l); }
            }
            EntityType::Ellipse(x) => {
                let (mx, my) = (x.major_axis.x, x.major_axis.y);
                let (nx, ny) = (-my * x.minor_axis_ratio, mx * x.minor_axis_ratio);
                let mut p1 = x.end_parameter;
                while p1 <= x.start_parameter { p1 += 2.0 * PI; }
                let n = (((p1 - x.start_parameter) / (PI / 36.0)).ceil() as usize).clamp(4, 256);
                let at = |p: f64| (x.center.x + mx * p.cos() + nx * p.sin(), x.center.y + my * p.cos() + ny * p.sin());
                let mut prev = at(x.start_parameter);
                for i in 1..=n { let q = at(x.start_parameter + (p1 - x.start_parameter) * i as f64 / n as f64); self.seg(t, prev, q, l, rgb, false); prev = q; }
                self.snap(t, (x.center.x, x.center.y), CENTER, l);
            }
            EntityType::LwPolyline(x) => {
                let t = mirror(&x.normal, t);
                let pts: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
                self.polyline(&t, &pts, x.is_closed, l, rgb);
            }
            EntityType::Polyline2D(x) => {
                let t = mirror(&x.normal, t);
                let pts: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
                self.polyline(&t, &pts, x.is_closed(), l, rgb);
            }
            EntityType::Polyline3D(x) => {
                let pts: Vec<_> = x.vertices.iter().map(|v| (v.position.x, v.position.y, 0.0)).collect();
                self.polyline(t, &pts, x.is_closed(), l, rgb);
            }
            EntityType::Spline(x) => {
                let pts = spline_points(x);
                for w in pts.windows(2) { self.seg(t, w[0], w[1], l, rgb, false); }
                if let (Some(a), Some(b)) = (pts.first(), pts.last()) { self.snap(t, *a, ENDPOINT, l); self.snap(t, *b, ENDPOINT, l); }
            }
            EntityType::Solid(x) => {
                let p = [(x.first_corner.x, x.first_corner.y), (x.second_corner.x, x.second_corner.y), (x.fourth_corner.x, x.fourth_corner.y), (x.third_corner.x, x.third_corner.y)];
                let start = self.loop_start();
                for i in 0..4 { self.seg(t, p[i], p[(i + 1) % 4], l, rgb, true); self.snap(t, p[i], ENDPOINT, l); }
                let end = self.loop_start();
                if end > start { self.out.fills.push(Fill { layer: l, rgb, solid: true, loops: vec![[start, end]], lines: vec![] }); }
            }
            EntityType::Hatch(x) => {
                let mut loops = vec![];
                for path in &x.paths {
                    let start = self.loop_start();
                    for edge in &path.edges {
                        match edge {
                            BoundaryEdge::Line(e) => self.seg(t, (e.start.x, e.start.y), (e.end.x, e.end.y), l, rgb, true),
                            BoundaryEdge::Polyline(p) => {
                                let pts: Vec<_> = p.vertices.iter().map(|v| (v.x, v.y, v.z)).collect();
                                self.polyline(t, &pts, p.is_closed, l, rgb);
                            }
                            BoundaryEdge::CircularArc(a) => {
                                let (mut a0, mut a1) = (a.start_angle, a.end_angle);
                                if !a.counter_clockwise { std::mem::swap(&mut a0, &mut a1); }
                                while a1 <= a0 { a1 += 2.0 * PI; }
                                self.arc_pts(t, (a.center.x, a.center.y), a.radius, a0, a1, l, rgb);
                            }
                            _ => {}
                        }
                    }
                    let end = self.loop_start();
                    if end > start { loops.push([start, end]); }
                }
                if !loops.is_empty() {
                    // Pattern lines as stored (scale and angle applied), moved into place with the insert's transform.
                    let (ox, oy) = t.apply(0.0, 0.0);
                    let lines = if x.is_solid { vec![] } else {
                        x.pattern.lines.iter().map(|pl| {
                            let b = t.apply(pl.base_point.x, pl.base_point.y);
                            let o = t.apply(pl.offset.x, pl.offset.y);
                            PatLine { angle: pl.angle + t.angle(), base: [b.0, b.1], offset: [o.0 - ox, o.1 - oy], dashes: pl.dash_lengths.iter().map(|d| d * t.size()).collect() }
                        }).collect()
                    };
                    self.out.fills.push(Fill { layer: l, rgb, solid: x.is_solid, loops, lines });
                }
            }
            EntityType::Text(x) => {
                use acadrust::entities::{TextHorizontalAlignment as H, TextVerticalAlignment as V};
                // Left on the baseline: at its insertion point. Anything else: at its alignment point, brought down to
                // the baseline (a height from the top, half from the middle) so every text is read baseline-anchored.
                let plain = x.alignment_point.is_none() || (matches!(x.horizontal_alignment, H::Left) && matches!(x.vertical_alignment, V::Baseline));
                let (at, align) = if plain { ((x.insertion_point.x, x.insertion_point.y), 0) } else {
                    let p = x.alignment_point.unwrap();
                    let down = match x.vertical_alignment { V::Top => x.height, V::Middle => x.height / 2.0, _ => if matches!(x.horizontal_alignment, H::Middle) { x.height / 2.0 } else { 0.0 } };
                    let (sin, cos) = x.rotation.sin_cos();
                    ((p.x + down * sin, p.y - down * cos), match x.horizontal_alignment { H::Left => 0, H::Right => 2, _ => 1 })
                };
                self.text(t, at, x.height, x.rotation, x.value.clone(), l, rgb, align);
            }
            EntityType::MText(x) => {
                let s = parse_mtext(&x.value, true).to_plain_text();
                for (i, line) in s.lines().enumerate() {
                    let dy = -(i as f64 + 1.0) * x.height * 1.66 + x.height * 0.66;
                    let (sin, cos) = x.rotation.sin_cos();
                    let at = (x.insertion_point.x - dy * sin, x.insertion_point.y + dy * cos);
                    self.text(t, at, x.height, x.rotation, line.to_string(), l, rgb, 0);
                }
            }
            EntityType::Point(x) => self.snap(t, (x.location.x, x.location.y), NODE, l),
            EntityType::Insert(x) => {
                if depth >= MAX_DEPTH { return; }
                let t0 = mirror(&x.normal, t);
                self.snap(&t0, (x.insert_point.x, x.insert_point.y), INSERTION, l);
                let base = self.blocks.get(&x.block_name.to_uppercase()).copied().unwrap_or((0.0, 0.0));
                let cols = x.column_count.max(1);
                let rows = x.row_count.max(1);
                for r in 0..rows {
                    for col in 0..cols {
                        let off = Affine::rotate(x.rotation).apply(col as f64 * x.column_spacing, r as f64 * x.row_spacing);
                        let local = Affine::translate(x.insert_point.x + off.0, x.insert_point.y + off.1)
                            .then(&Affine::rotate(x.rotation))
                            .then(&Affine::scale(x.x_scale(), x.y_scale()))
                            .then(&Affine::translate(-base.0, -base.1));
                        let tt = t0.then(&local);
                        let name = x.block_name.clone();
                        let children: Vec<&EntityType> = self.doc.entities_in_block(&name).collect();
                        for child in children { self.entity(child, &tt, (l, rgb), depth + 1); }
                    }
                }
                for a in &x.attributes {
                    if a.common.invisible { continue; }
                    let (al, argb) = self.style(&a.common.layer, &a.common.color, (l, rgb));
                    self.text(t, (a.insertion_point.x, a.insertion_point.y), a.height, a.rotation, a.value.clone(), al, argb, 0);
                }
            }
            EntityType::Dimension(x) => {
                if depth >= MAX_DEPTH { return; }
                let name = x.base().block_name.clone();
                if name.is_empty() { return; }
                let children: Vec<&EntityType> = self.doc.entities_in_block(&name).collect();
                for child in children { self.entity(child, t, (l, rgb), depth + 1); }
            }
            _ => {}
        }
    }
}

/// Points along a spline: its B-spline evaluated (de Boor, rational with weights), else its fit or control points.
fn spline_points(s: &acadrust::entities::Spline) -> Vec<(f64, f64)> {
    let p = s.degree.max(1) as usize;
    let cp = &s.control_points;
    let k = &s.knots;
    if cp.len() > p && k.len() == cp.len() + p + 1 {
        let w = |i: usize| if s.weights.len() == cp.len() { s.weights[i] } else { 1.0 };
        let (t0, t1) = (k[p], k[cp.len()]);
        let steps = (cp.len() * 8).clamp(16, 2000);
        let mut out = Vec::with_capacity(steps + 1);
        for n in 0..=steps {
            let u = t0 + (t1 - t0) * n as f64 / steps as f64;
            let mut span = p;
            while span < cp.len() - 1 && u >= k[span + 1] { span += 1; }
            let mut d: Vec<(f64, f64, f64)> = (0..=p).map(|j| { let i = span - p + j; let wi = w(i); (cp[i].x * wi, cp[i].y * wi, wi) }).collect();
            for r in 1..=p {
                for j in (r..=p).rev() {
                    let i = span - p + j;
                    let den = k[i + p + 1 - r] - k[i];
                    let a = if den.abs() < 1e-12 { 0.0 } else { (u - k[i]) / den };
                    d[j] = ((1.0 - a) * d[j - 1].0 + a * d[j].0, (1.0 - a) * d[j - 1].1 + a * d[j].1, (1.0 - a) * d[j - 1].2 + a * d[j].2);
                }
            }
            let q = d[p];
            if q.2.abs() > 1e-12 { out.push((q.0 / q.2, q.1 / q.2)); }
        }
        return out;
    }
    let src = if !s.fit_points.is_empty() { &s.fit_points } else { cp };
    src.iter().map(|v| (v.x, v.y)).collect()
}

/// Length and (when closed) area of a polyline with bulges: vertices [x, y, bulge].
fn poly_measure(v: &[(f64, f64, f64)], closed: bool) -> (f64, f64) {
    let n = v.len();
    if n < 2 { return (0.0, 0.0); }
    let (mut len, mut twice_area) = (0.0, 0.0);
    let last = if closed { n } else { n - 1 };
    for i in 0..last {
        let (a, b) = (v[i], v[(i + 1) % n]);
        let chord = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
        twice_area += a.0 * b.1 - b.0 * a.1;
        if a.2.abs() < 1e-12 || chord < 1e-12 { len += chord; continue; }
        let theta = 4.0 * a.2.atan();
        let r = chord / (2.0 * (theta.abs() / 2.0).sin());
        len += r * theta.abs();
        // the arc's segment beyond the chord, on the bulge's side
        twice_area += theta.signum() * r * r * (theta.abs() - theta.abs().sin());
    }
    (len, if closed { (twice_area / 2.0).abs() } else { 0.0 })
}

/// What a model-space object is (kind, handle, block, attributes, length, area) in its own coordinates.
fn describe(e: &EntityType) -> ObjInfo {
    let c = e.common();
    let mut o = ObjInfo { handle: format!("{:X}", c.handle.value()), ..Default::default() };
    match e {
        EntityType::Line(x) => { o.kind = "Line"; o.length = Some(((x.end.x - x.start.x).powi(2) + (x.end.y - x.start.y).powi(2)).sqrt()); }
        EntityType::Arc(x) => {
            o.kind = "Arc"; o.radius = Some(x.radius);
            let mut sweep = x.end_angle - x.start_angle;
            while sweep <= 0.0 { sweep += 2.0 * PI; }
            o.length = Some(x.radius * sweep);
        }
        EntityType::Circle(x) => { o.kind = "Circle"; o.radius = Some(x.radius); o.length = Some(2.0 * PI * x.radius); o.area = Some(PI * x.radius * x.radius); o.closed = true; }
        EntityType::Ellipse(x) => {
            o.kind = "Ellipse";
            let a = (x.major_axis.x.powi(2) + x.major_axis.y.powi(2)).sqrt();
            let b = a * x.minor_axis_ratio;
            let full = ((x.end_parameter - x.start_parameter).abs() - 2.0 * PI).abs() < 1e-6 || (x.end_parameter - x.start_parameter).abs() < 1e-9;
            if full {
                o.closed = true; o.area = Some(PI * a * b);
                let h = ((a - b) / (a + b)).powi(2);
                o.length = Some(PI * (a + b) * (1.0 + 3.0 * h / (10.0 + (4.0 - 3.0 * h).sqrt())));
            }
        }
        EntityType::LwPolyline(x) => {
            o.kind = "Polyline"; o.closed = x.is_closed; o.vertices = Some(x.vertices.len());
            let v: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
            let (l, a) = poly_measure(&v, x.is_closed);
            o.length = Some(l); if x.is_closed { o.area = Some(a); }
        }
        EntityType::Polyline2D(x) => {
            o.kind = "Polyline"; o.closed = x.is_closed(); o.vertices = Some(x.vertices.len());
            let v: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
            let (l, a) = poly_measure(&v, x.is_closed());
            o.length = Some(l); if x.is_closed() { o.area = Some(a); }
        }
        EntityType::Polyline3D(x) => {
            o.kind = "3D polyline"; o.closed = x.is_closed(); o.vertices = Some(x.vertices.len());
            let v: Vec<_> = x.vertices.iter().map(|v| (v.position.x, v.position.y, 0.0)).collect();
            o.length = Some(poly_measure(&v, x.is_closed()).0);
        }
        EntityType::Spline(x) => {
            o.kind = "Spline";
            let p = spline_points(x);
            o.length = Some(p.windows(2).map(|w| ((w[1].0 - w[0].0).powi(2) + (w[1].1 - w[0].1).powi(2)).sqrt()).sum());
        }
        EntityType::Hatch(x) => {
            o.kind = "Hatch"; o.closed = true;
            let path = x.paths.iter().find(|p| p.flags.is_external()).or(x.paths.first());
            if let Some(path) = path {
                let mut v = Vec::new();
                for edge in &path.edges {
                    match edge {
                        BoundaryEdge::Polyline(p) => v.extend(p.vertices.iter().map(|q| (q.x, q.y, q.z))),
                        BoundaryEdge::Line(l) => v.push((l.start.x, l.start.y, 0.0)),
                        _ => {}
                    }
                }
                if v.len() >= 3 { let (l, a) = poly_measure(&v, true); o.length = Some(l); o.area = Some(a); }
            }
        }
        EntityType::Solid(x) => {
            o.kind = "Solid"; o.closed = true;
            let v = [(x.first_corner.x, x.first_corner.y, 0.0), (x.second_corner.x, x.second_corner.y, 0.0), (x.fourth_corner.x, x.fourth_corner.y, 0.0), (x.third_corner.x, x.third_corner.y, 0.0)];
            let (l, a) = poly_measure(&v, true); o.length = Some(l); o.area = Some(a);
        }
        EntityType::Text(x) => { o.kind = "Text"; o.text = Some(x.value.clone()); }
        EntityType::MText(x) => { o.kind = "Multiline text"; o.text = Some(parse_mtext(&x.value, true).to_plain_text()); }
        EntityType::Point(_) => { o.kind = "Point"; }
        EntityType::Insert(x) => {
            o.kind = "Block"; o.block = Some(x.block_name.clone());
            for a in &x.attributes { o.attrs.insert(a.tag.clone(), a.value.clone()); }
        }
        EntityType::Dimension(x) => { o.kind = "Dimension"; o.length = Some(x.base().actual_measurement); }
        _ => { o.kind = "Other"; }
    }
    o
}

fn read(bytes: Vec<u8>) -> Result<(CadDocument, &'static str), String> {
    if bytes.starts_with(b"AC10") {
        DwgReader::from_stream(Cursor::new(bytes)).read().map(|d| (d, "DWG")).map_err(|e| e.to_string())
    } else {
        DxfReader::from_reader(Cursor::new(bytes)).and_then(|r| r.read()).map(|d| (d, "DXF")).map_err(|e| e.to_string())
    }
}

#[wasm_bindgen]
impl CadDoc {
    /// Opens a DWG (R13–2018) or DXF drawing.
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>) -> Result<CadDoc, JsError> {
        let (doc, format) = read(bytes).map_err(|e| JsError::new(&e))?;
        let mut b = Builder {
            doc: &doc,
            layer_index: HashMap::new(),
            layer_rgb: Vec::new(),
            blocks: HashMap::new(),
            current: 0,
            layer_lt: Vec::new(),
            lt_defs: doc.line_types.iter().map(|lt| (lt.name.to_uppercase(), lt.elements.iter().map(|e| e.length).collect())).collect(),
            lt_index: HashMap::new(),
            lt: 0,
            ltscale: if doc.header.linetype_scale > 0.0 { doc.header.linetype_scale } else { 1.0 },
            out: CadDoc { format, units: doc.header.insertion_units, origin: (0.0, 0.0), segs: vec![], seg_layer: vec![], seg_rgb: vec![], seg_real: vec![], seg_obj: vec![], seg_lt: vec![], linetypes: vec![vec![]], fills: vec![], objects: vec![], texts: vec![], snaps: vec![], layers: vec![], grid: Grid { x0: 0.0, y0: 0.0, cell: 1.0, nx: 1, ny: 1, segs: vec![vec![]], pts: vec![vec![]] }, truncated: false, xrefs: xrefs_of(&doc), erased: vec![] },
        };
        for layer in doc.layers.iter() {
            let i = b.layer(&layer.name);
            let rgb = rgb_of(&layer.color).unwrap_or(INK);
            b.layer_rgb[i as usize] = rgb;
            b.out.layers[i as usize].rgb = rgb;
            b.out.layers[i as usize].on = !layer.is_off() && !layer.is_frozen();
            b.layer_lt[i as usize] = layer.line_type.clone();
        }
        for rec in doc.block_records.iter() {
            if let Some(EntityType::Block(blk)) = doc.get_entity(rec.block_entity_handle) {
                b.blocks.insert(rec.name.to_uppercase(), (blk.base_point.x, blk.base_point.y));
            }
        }
        let model: Vec<&EntityType> = doc.model_space_entities().collect();
        for e in model {
            let mut info = describe(e);
            info.layer = b.layer(&e.common().layer);
            info.seg_start = b.out.seg_layer.len() as u32;
            b.current = b.out.objects.len() as u32;
            b.out.objects.push(info);
            b.entity(e, &Affine::ID, (u16::MAX, u32::MAX), 0);
            let end = b.out.seg_layer.len() as u32;
            b.out.objects.last_mut().unwrap().seg_end = end;
        }
        let mut out = b.out;
        out.build_grid();
        Ok(out)
    }

    /// Drawing facts as JSON: format, units (INSUNITS), origin, extents (most of the drawing), layers, texts, counts.
    pub fn info(&self) -> String {
        let (x0, y0, x1, y1) = self.extents();
        serde_json::json!({
            "format": self.format, "units": self.units, "origin": [self.origin.0, self.origin.1],
            "extents": [x0, y0, x1, y1], "layers": self.layers, "texts": self.texts,
            "segments": self.seg_layer.len(), "snaps": self.snaps.len(), "truncated": self.truncated,
            "linetypes": self.linetypes, "fills": self.fills, "xrefs": self.xrefs
        }).to_string()
    }

    /// Segments x1, y1, x2, y2 relative to the origin (single precision is enough for drawing).
    pub fn segments(&self) -> Vec<f32> {
        self.segs.chunks(4).flat_map(|s| [(s[0] - self.origin.0) as f32, (s[1] - self.origin.1) as f32, (s[2] - self.origin.0) as f32, (s[3] - self.origin.1) as f32]).collect()
    }
    pub fn segment_layers(&self) -> Vec<u16> { self.seg_layer.clone() }
    /// The dash pattern of each segment: an index into info().linetypes (0: continuous).
    pub fn segment_linetypes(&self) -> Vec<u16> { self.seg_lt.clone() }
    /// Colour of each segment: 0xRRGGBB, or 0xFF000007 for the foreground (index 7).
    pub fn segment_colors(&self) -> Vec<u32> { self.seg_rgb.clone() }

    /// Blocks inserted in model space with their attributes, as JSON [{block, attributes, layer, handle}] — fixtures
    /// with a CCT attribute are counted on their circuits (Loads from CAD).
    pub fn blocks(&self) -> String {
        let all: Vec<serde_json::Value> = self.objects.iter()
            .filter_map(|o| o.block.as_ref().map(|name| serde_json::json!({
                "block": name, "attributes": o.attrs, "layer": self.layers.get(o.layer as usize).map(|l| l.name.as_str()).unwrap_or(""), "handle": o.handle
            })))
            .collect();
        serde_json::Value::Array(all).to_string()
    }

    /// Closed objects of model space (polylines, circles, ellipses, hatches, solids) as JSON — each ObjInfo with its `id`
    /// — for rooms from outline layers; their drawn segments are `seg_start..seg_end`.
    pub fn outlines(&self) -> String {
        let all: Vec<serde_json::Value> = self.objects.iter().enumerate()
            .filter(|(_, o)| o.area.is_some() && o.seg_end > o.seg_start)
            .map(|(i, o)| { let mut v = serde_json::to_value(o).unwrap_or_default(); v["id"] = i.into(); v })
            .collect();
        serde_json::Value::Array(all).to_string()
    }

    /// The object under (x, y) within `tol` (drawing units) on shown layers, as JSON (ObjInfo with its `id`), or "".
    /// The nearest drawn line wins; a text wins when the point is on it. `closed_only` considers only objects with an
    /// area (closed polylines, circles, hatches…), as for AREA → Object.
    pub fn pick(&self, x: f64, y: f64, tol: f64, layers_on: &[u8], closed_only: bool) -> String {
        let on = |l: u16| layers_on.get(l as usize).map_or(true, |v| *v != 0);
        let wanted = |o: u32| !closed_only || self.objects.get(o as usize).map_or(false, |x| x.area.is_some());
        let mut best: Option<(f64, u32)> = None;
        let g = &self.grid;
        let (cx0, cy0) = g.cell_of(x - tol, y - tol);
        let (cx1, cy1) = g.cell_of(x + tol, y + tol);
        let mut seen = std::collections::HashSet::new();
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                for &s in &g.segs[cy * g.nx + cx] {
                    if !seen.insert(s) || !on(self.seg_layer[s as usize]) || !wanted(self.seg_obj[s as usize]) || self.gone(self.seg_obj[s as usize]) { continue; }
                    let (x1, y1, x2, y2) = self.seg_at(s as usize);
                    let (dx, dy) = (x2 - x1, y2 - y1);
                    let l2 = dx * dx + dy * dy;
                    let t = if l2 > 0.0 { (((x - x1) * dx + (y - y1) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
                    let d = ((x - x1 - t * dx).powi(2) + (y - y1 - t * dy).powi(2)).sqrt();
                    if d <= tol && best.map_or(true, |b| d < b.0) { best = Some((d, self.seg_obj[s as usize])); }
                }
            }
        }
        for t in &self.texts {
            if closed_only || !on(t.layer) || t.h <= 0.0 || self.gone(t.o) { continue; }
            let w = 0.6 * t.h * t.s.chars().count() as f64;
            let (sin, cos) = t.rot.sin_cos();
            let (px, py) = ((x - t.x) * cos + (y - t.y) * sin, -(x - t.x) * sin + (y - t.y) * cos);
            let x0 = match t.align { 1 => -w / 2.0, 2 => -w, _ => 0.0 };
            if px >= x0 - tol && px <= x0 + w + tol && py >= -tol && py <= t.h + tol { best = Some((0.0, t.o)); break; }
        }
        if best.is_none() && !closed_only {
            // Inside a block (a board symbol, a fitting) but not on its lines: the smallest block around the point.
            let mut inside: Option<(f64, u32)> = None;
            for (i, o) in self.objects.iter().enumerate() {
                if o.kind != "Block" || o.seg_end <= o.seg_start || !on(o.layer) || self.gone(i as u32) { continue; }
                let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
                for sgi in o.seg_start..o.seg_end {
                    let (a, b, c, d) = self.seg_at(sgi as usize);
                    x0 = x0.min(a.min(c)); y0 = y0.min(b.min(d)); x1 = x1.max(a.max(c)); y1 = y1.max(b.max(d));
                }
                if x >= x0 && x <= x1 && y >= y0 && y <= y1 {
                    let area = (x1 - x0) * (y1 - y0);
                    if inside.map_or(true, |b| area < b.0) { inside = Some((area, i as u32)); }
                }
            }
            best = inside.map(|(_, i)| (0.0, i));
        }
        let Some((_, id)) = best else { return String::new() };
        let Some(o) = self.objects.get(id as usize) else { return String::new() };
        let mut v = serde_json::to_value(o).unwrap_or_default();
        v["id"] = serde_json::json!(id);
        v.to_string()
    }

    /// Marks model-space objects erased in the app (CROP), by handle (hex, JSON array), replacing the last list: they
    /// are no longer picked or snapped to. Answers what the view leaves out, as JSON {objects: [id], ranges: [[seg_start,
    /// seg_end]]}; the drawing itself is not changed.
    pub fn set_erased(&mut self, handles_json: &str) -> String {
        let handles: Vec<String> = serde_json::from_str::<Vec<String>>(handles_json).unwrap_or_default().iter().map(|h| h.trim().to_uppercase()).collect();
        self.erased = self.objects.iter().map(|o| handles.contains(&o.handle)).collect();
        let ids: Vec<usize> = (0..self.objects.len()).filter(|i| self.erased[*i]).collect();
        let ranges: Vec<[u32; 2]> = ids.iter().map(|i| [self.objects[*i].seg_start, self.objects[*i].seg_end]).collect();
        serde_json::json!({ "objects": ids, "ranges": ranges }).to_string()
    }

    /// The snap point nearest (x, y) within r (drawing units): [x, y, kind], or empty. `mask` chooses the kinds,
    /// `layers_on` (one byte per layer, 1 = shown) leaves out hidden layers; (fx, fy) is the last point picked, for
    /// PERPENDICULAR (NaN when there is none).
    pub fn snap(&self, x: f64, y: f64, r: f64, mask: u32, layers_on: &[u8], fx: f64, fy: f64) -> Vec<f64> {
        let on = |l: u16| layers_on.get(l as usize).map_or(true, |v| *v != 0);
        let mut best: Option<(f64, f64, f64, u32)> = None;
        let consider = |px: f64, py: f64, kind: u32, best: &mut Option<(f64, f64, f64, u32)>| {
            let d = ((px - x).powi(2) + (py - y).powi(2)).sqrt();
            // Prefer the more specific kind at (almost) the same distance: endpoint and intersection over midpoint etc.
            let rank = match kind { ENDPOINT | INTERSECTION => 0.0, CENTER | INSERTION | NODE | PERPENDICULAR => 0.05, NEAREST => 0.3, _ => 0.1 } * r;
            if d <= r && best.map_or(true, |b| d + rank < b.2) { *best = Some((px, py, d + rank, kind)); }
        };
        let g = &self.grid;
        let (cx0, cy0) = g.cell_of(x - r, y - r);
        let (cx1, cy1) = g.cell_of(x + r, y + r);
        let mut segs: Vec<u32> = Vec::new();
        let mut near: Vec<u32> = Vec::new();
        let on_seg = mask & (NEAREST | PERPENDICULAR) != 0;
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                let i = cy * g.nx + cx;
                for &p in &g.pts[i] {
                    let s = &self.snaps[p as usize];
                    if s.kind & mask != 0 && on(s.layer) && !self.gone(s.o) { consider(s.x, s.y, s.kind, &mut best); }
                }
                if on_seg { near.extend(g.segs[i].iter().copied().filter(|s| on(self.seg_layer[*s as usize]) && !self.gone(self.seg_obj[*s as usize]))); }
                if mask & INTERSECTION != 0 { segs.extend(g.segs[i].iter().copied().filter(|s| self.seg_real[*s as usize] && on(self.seg_layer[*s as usize]) && !self.gone(self.seg_obj[*s as usize]))); }
            }
        }
        if mask & INTERSECTION != 0 {
            segs.sort_unstable();
            segs.dedup();
            segs.truncate(400);
            for i in 0..segs.len() {
                for j in i + 1..segs.len() {
                    if let Some((px, py)) = self.cross(segs[i] as usize, segs[j] as usize) { consider(px, py, INTERSECTION, &mut best); }
                }
            }
        }
        if on_seg {
            near.sort_unstable();
            near.dedup();
            near.truncate(2000);
            let from = fx.is_finite() && fy.is_finite();
            for &k in &near {
                let (x1, y1, x2, y2) = self.seg_at(k as usize);
                let (dx, dy) = (x2 - x1, y2 - y1);
                let len2 = dx * dx + dy * dy;
                if len2 < 1e-18 { continue; }
                if mask & NEAREST != 0 {
                    let t = (((x - x1) * dx + (y - y1) * dy) / len2).clamp(0.0, 1.0);
                    consider(x1 + t * dx, y1 + t * dy, NEAREST, &mut best);
                }
                if from && mask & PERPENDICULAR != 0 {
                    let t = ((fx - x1) * dx + (fy - y1) * dy) / len2;
                    if (-1e-9..=1.0 + 1e-9).contains(&t) { consider(x1 + t * dx, y1 + t * dy, PERPENDICULAR, &mut best); }
                }
            }
        }
        best.map_or(vec![], |b| vec![b.0, b.1, b.3 as f64])
    }
}

impl CadDoc {
    fn gone(&self, o: u32) -> bool { self.erased.get(o as usize).copied().unwrap_or(false) }

    fn seg_at(&self, i: usize) -> (f64, f64, f64, f64) { (self.segs[i * 4], self.segs[i * 4 + 1], self.segs[i * 4 + 2], self.segs[i * 4 + 3]) }

    fn cross(&self, i: usize, j: usize) -> Option<(f64, f64)> {
        let (x1, y1, x2, y2) = self.seg_at(i);
        let (x3, y3, x4, y4) = self.seg_at(j);
        let d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
        if d.abs() < 1e-12 { return None; }
        let t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
        let u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
        let e = 1e-9;
        if t < -e || t > 1.0 + e || u < -e || u > 1.0 + e { return None; }
        Some((x1 + t * (x2 - x1), y1 + t * (y2 - y1)))
    }

    /// The drawing's extents; when a few stray objects lie far away, where nearly all of it is (1st–99th percentile).
    fn extents(&self) -> (f64, f64, f64, f64) {
        let mut xs: Vec<f64> = self.segs.chunks(2).map(|p| p[0]).collect();
        let mut ys: Vec<f64> = self.segs.chunks(2).map(|p| p[1]).collect();
        for t in &self.texts { xs.push(t.x); ys.push(t.y); }
        if xs.is_empty() { return (0.0, 0.0, 1000.0, 1000.0); }
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let at = |v: &Vec<f64>, f: f64| v[((v.len() - 1) as f64 * f) as usize];
        let full = (xs[0], ys[0], xs[xs.len() - 1], ys[ys.len() - 1]);
        let most = (at(&xs, 0.01), at(&ys, 0.01), at(&xs, 0.99), at(&ys, 0.99));
        // The whole drawing, unless a few stray objects far away would make it much larger than where nearly all of it is.
        let area = |e: (f64, f64, f64, f64)| ((e.2 - e.0).max(1e-9)) * ((e.3 - e.1).max(1e-9));
        if area(full) <= 25.0 * area(most) { return full; }
        let (mx, my) = ((most.2 - most.0) * 0.05, (most.3 - most.1) * 0.05);
        (most.0 - mx, most.1 - my, most.2 + mx, most.3 + my)
    }

    fn build_grid(&mut self) {
        let (x0, y0, x1, y1) = self.extents();
        self.origin = (x0, y0);
        // Cells over the main extents (with a margin); anything outside falls in the edge cells.
        let (w, h) = ((x1 - x0).max(1.0), (y1 - y0).max(1.0));
        let cell = (w.max(h) / 256.0).max(1e-6);
        let (gx0, gy0) = (x0 - w * 0.1, y0 - h * 0.1);
        let nx = (((w * 1.2) / cell).ceil() as usize).clamp(1, 512);
        let ny = (((h * 1.2) / cell).ceil() as usize).clamp(1, 512);
        let mut g = Grid { x0: gx0, y0: gy0, cell, nx, ny, segs: vec![Vec::new(); nx * ny], pts: vec![Vec::new(); nx * ny] };
        for (i, s) in self.segs.chunks(4).enumerate() {
            let (ax, ay) = g.cell_of(s[0].min(s[2]), s[1].min(s[3]));
            let (bx, by) = g.cell_of(s[0].max(s[2]), s[1].max(s[3]));
            if (bx - ax + 1) * (by - ay + 1) > 4096 { continue; } // very long lines: no intersections from the index
            for cy in ay..=by { for cx in ax..=bx { g.segs[cy * nx + cx].push(i as u32); } }
        }
        for (i, p) in self.snaps.iter().enumerate() {
            let (cx, cy) = g.cell_of(p.x, p.y);
            g.pts[cy * nx + cx].push(i as u32);
        }
        self.grid = g;
    }
}

/// A device placed in the app, written into the drawing (drawing units).
#[derive(serde::Deserialize)]
struct DeviceOut { layer: String, x: f64, y: f64, r: f64, text: String, label: String }

/// Something drawn in the app: line / polyline (pts, and the bulge of the segment after each point), circle (centre, r),
/// arc (centre, r, a0 → a1 radians), ellipse (centre, its major axis from the centre, the minor axis as a fraction of
/// it, a0 → a1 parameters), text, hatch.
#[derive(serde::Deserialize)]
struct ShapeOut {
    layer: String,
    kind: String,
    pts: Vec<(f64, f64)>,
    #[serde(default)] closed: bool,
    /// Polyline: the tangent of a quarter of the arc of the segment after each point (0, or none: straight).
    #[serde(default)] bulges: Vec<f64>,
    /// Ellipse: its major axis, from the centre, and the minor axis as a fraction of it.
    #[serde(default)] axis: (f64, f64),
    #[serde(default)] ratio: f64,
    #[serde(default)] r: f64,
    #[serde(default)] a0: f64,
    #[serde(default)] a1: f64,
    #[serde(default)] text: String,
    #[serde(default)] h: f64,
    #[serde(default)] rot: f64,
    /// Text: where its anchor sits on its box (L, C, R on the baseline; TL … BR), blank or L for the left end of the baseline.
    #[serde(default)] just: String,
    /// Multiline text (mtext): the width of its box (0: as wide as its longest line) and its line spacing factor.
    #[serde(default)] w: f64,
    #[serde(default)] lsp: f64,
    /// The point style pseudo-shape: PDMODE (its PDSIZE comes in `r`).
    #[serde(default)] mode: i16,
    /// An insert: its block's name and scale; a block definition (`blockdef`): its name, units, description (`text`) and
    /// objects.
    #[serde(default)] name: String,
    #[serde(default)] sc: f64,
    #[serde(default)] units: i16,
    #[serde(default)] items: Vec<ShapeOut>,
    /// An attribute definition (`attdef`): its tag, prompt and modes (its default in `text`); an insert's attributes
    /// (`atts`), each an attdef-like shape with its value in `text`.
    #[serde(default)] tag: String,
    #[serde(default)] prompt: String,
    #[serde(default)] flags: AttFlagsOut,
    #[serde(default)] atts: Vec<ShapeOut>,
    /// Hatch: closed boundary loops, solid or with its pattern lines (a reference's fill, bound into the saved copy).
    #[serde(default)] loops: Vec<Vec<(f64, f64)>>,
    #[serde(default)] solid: bool,
    #[serde(default)] lines: Vec<PatLineOut>,
}

/// An attribute's modes.
#[derive(serde::Deserialize, Default)]
struct AttFlagsOut { #[serde(default)] invisible: bool, #[serde(default)] constant: bool, #[serde(default)] verify: bool, #[serde(default)] preset: bool, #[serde(default)] lock: bool }

/// A hatch pattern line: angle (radians), base point, offset between lines, dashes (+ dash, − gap, 0 dot).
#[derive(serde::Deserialize)]
struct PatLineOut { angle: f64, base: (f64, f64), offset: (f64, f64), #[serde(default)] dashes: Vec<f64> }

/// The drawing (DWG or DXF) with what was drawn and the devices placed in the app added on their own layers: each
/// device as a circle with its letters inside and its label (circuit or type) beside it. The architect's entities are

/// A drawn shape as a DXF entity (none for a kind the writer does not know).
fn entity_of(sh: &ShapeOut) -> Option<EntityType> {
    use acadrust::entities::{Arc, BoundaryEdge, BoundaryPath, Circle, Ellipse, Hatch, HatchPattern, HatchPatternLine, HatchPatternType, Line, LwPolyline, LwVertex, MText, Point, PolylineEdge, Text};
    use acadrust::types::{Vector2, Vector3};
    Some(match sh.kind.as_str() {
        "line" if sh.pts.len() == 2 => { let mut l = Line::from_coords(sh.pts[0].0, sh.pts[0].1, 0.0, sh.pts[1].0, sh.pts[1].1, 0.0); l.common.layer = sh.layer.clone(); EntityType::Line(l) }
        "line" | "pline" if sh.pts.len() >= 2 => {
            let mut l = LwPolyline::new();
            l.vertices = sh.pts.iter().enumerate().map(|(i, p)| { let mut v = LwVertex::new(Vector2::new(p.0, p.1)); v.bulge = sh.bulges.get(i).copied().unwrap_or(0.0); v }).collect();
            l.is_closed = sh.closed;
            l.common.layer = sh.layer.clone();
            EntityType::LwPolyline(l)
        }
        "circle" if !sh.pts.is_empty() => { let mut c = Circle::new(); c.center = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); c.radius = sh.r; c.common.layer = sh.layer.clone(); EntityType::Circle(c) }
        "arc" if !sh.pts.is_empty() => {
            let mut a = Arc::new();
            a.center = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); a.radius = sh.r; a.start_angle = sh.a0; a.end_angle = sh.a1; a.common.layer = sh.layer.clone();
            EntityType::Arc(a)
        }
        "ellipse" if !sh.pts.is_empty() && sh.ratio > 0.0 && sh.axis != (0.0, 0.0) => {
            let mut e = Ellipse::new();
            e.center = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0);
            e.major_axis = Vector3::new(sh.axis.0, sh.axis.1, 0.0);
            e.minor_axis_ratio = sh.ratio.min(1.0);
            if sh.a0 != sh.a1 { e.start_parameter = sh.a0; e.end_parameter = sh.a1; }
            e.common.layer = sh.layer.clone();
            EntityType::Ellipse(e)
        }
        "text" if !sh.pts.is_empty() && !sh.text.is_empty() => {
            use acadrust::entities::{TextHorizontalAlignment as H, TextVerticalAlignment as V};
            let mut t = Text::new();
            t.value = sh.text.clone(); t.insertion_point = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); t.height = sh.h; t.rotation = sh.rot; t.common.layer = sh.layer.clone();
            let just = sh.just.to_uppercase();
            if !just.is_empty() && just != "L" {
                let (row, col) = if just.len() == 1 { ("", just.as_str()) } else { just.split_at(1) };
                let (fx, h) = match col { "C" => (0.5, H::Center), "R" => (1.0, H::Right), _ => (0.0, H::Left) };
                let (fy, v) = match row { "T" => (1.0, V::Top), "M" => (0.5, V::Middle), "B" => (0.0, V::Bottom), _ => (0.0, V::Baseline) };
                t.horizontal_alignment = h; t.vertical_alignment = v;
                t.alignment_point = Some(t.insertion_point);
                // The left end of the baseline, from the text's approximate width (0.6 × height per character).
                let w = 0.6 * sh.h * sh.text.chars().count() as f64;
                let (sin, cos) = sh.rot.sin_cos();
                t.insertion_point = Vector3::new(sh.pts[0].0 - fx * w * cos + fy * sh.h * sin, sh.pts[0].1 - fx * w * sin - fy * sh.h * cos, 0.0);
            }
            EntityType::Text(t)
        }
        "point" if !sh.pts.is_empty() => { let mut p = Point::new(); p.location = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); p.common.layer = sh.layer.clone(); EntityType::Point(p) }
        "mtext" if !sh.pts.is_empty() && !sh.text.is_empty() => {
            use acadrust::entities::mtext::AttachmentPoint as A;
            let mut t = MText::new();
            t.value = sh.text.clone(); t.insertion_point = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); t.height = sh.h; t.rotation = sh.rot; t.common.layer = sh.layer.clone();
            t.rectangle_width = sh.w.max(0.0);
            if sh.lsp > 0.0 { t.line_spacing_factor = sh.lsp; }
            t.attachment_point = match sh.just.to_uppercase().as_str() {
                "TC" => A::TopCenter, "TR" => A::TopRight, "ML" => A::MiddleLeft, "MC" => A::MiddleCenter, "MR" => A::MiddleRight,
                "BL" => A::BottomLeft, "BC" => A::BottomCenter, "BR" => A::BottomRight, _ => A::TopLeft,
            };
            EntityType::MText(Box::new(t))
        }
        "attdef" if !sh.pts.is_empty() && !sh.tag.is_empty() => {
            use acadrust::entities::AttributeDefinition;
            let mut a = AttributeDefinition::new(sh.tag.clone(), sh.prompt.clone(), sh.text.clone());
            a.insertion_point = Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0); a.height = sh.h; a.rotation = sh.rot; a.common.layer = sh.layer.clone();
            a.flags.invisible = sh.flags.invisible; a.flags.constant = sh.flags.constant; a.flags.verify = sh.flags.verify; a.flags.preset = sh.flags.preset; a.flags.locked_position = sh.flags.lock;
            EntityType::AttributeDefinition(a)
        }
        "hatch" if sh.loops.iter().any(|l| l.len() >= 3) => {
            let mut h = if sh.solid || sh.lines.is_empty() { Hatch::solid() } else {
                let mut pat = HatchPattern::new("LVDS_REF");
                for l in &sh.lines { pat.add_line(HatchPatternLine { angle: l.angle, base_point: Vector2::new(l.base.0, l.base.1), offset: Vector2::new(l.offset.0, l.offset.1), dash_lengths: l.dashes.clone() }); }
                let mut h = Hatch::with_pattern(pat);
                h.pattern_type = HatchPatternType::Custom;
                h
            };
            for l in sh.loops.iter().filter(|l| l.len() >= 3) {
                let mut path = BoundaryPath::new();
                path.add_edge(BoundaryEdge::Polyline(PolylineEdge::new(l.iter().map(|p| Vector2::new(p.0, p.1)).collect(), true)));
                h.add_path(path);
            }
            h.common.layer = sh.layer.clone();
            EntityType::Hatch(Box::new(h))
        }
        _ => return None,
    })
}

/// One of the drawing's own blocks as a BLOCK record: its objects get handles and the record as their owner, as the
/// library does for model space. A record of that name already in the drawing is kept as it is.
fn define_block(doc: &mut CadDocument, sh: &ShapeOut) -> Result<(), String> {
    use acadrust::tables::BlockRecord;
    use std::sync::Arc;
    if doc.block_records.contains(&sh.name) { return Ok(()); }
    let mut rec = BlockRecord::new(sh.name.clone());
    rec.handle = doc.allocate_handle();
    rec.block_entity_handle = doc.allocate_handle();
    rec.block_end_handle = doc.allocate_handle();
    rec.units = sh.units;
    rec.description = sh.text.clone();
    rec.explodable = true;
    for sub in &sh.items {
        let Some(mut e) = entity_of(sub) else { continue };
        let h = doc.allocate_handle();
        e.as_entity_mut().set_handle(h);
        e.common_mut().owner_handle = rec.handle;
        rec.entity_handles.push(h);
        doc.restore_entity_arc(Arc::new(e));
    }
    doc.block_records.add(rec).map_err(|e| e.to_string())?;
    Ok(())
}

/// kept as read.
fn with_additions(bytes: Vec<u8>, devices_json: &str, shapes_json: &str, erased_json: &str) -> Result<CadDocument, String> {
    use acadrust::entities::{Circle, Insert, Text};
    use acadrust::tables::Layer;
    use acadrust::types::Vector3;
    let (mut doc, _) = read(bytes)?;
    let devices: Vec<DeviceOut> = serde_json::from_str(devices_json).map_err(|e| e.to_string())?;
    let shapes: Vec<ShapeOut> = if shapes_json.is_empty() { vec![] } else { serde_json::from_str(shapes_json).map_err(|e| e.to_string())? };
    let err = |e: acadrust::DxfError| e.to_string();
    // Objects erased in the app (CROP: the block cut is replaced by its kept pieces) are left out of the copy saved.
    let erased: Vec<String> = if erased_json.is_empty() { vec![] } else { serde_json::from_str(erased_json).map_err(|e| e.to_string())? };
    for h in &erased {
        if let Ok(v) = u64::from_str_radix(h.trim(), 16) {
            let h = acadrust::types::Handle::from(v);
            if doc.model_space_entities().any(|e| e.common().handle == h) { doc.remove_entity(h); }
        }
    }
    for sh in &shapes {
        // The drawing's point style ($PDMODE, $PDSIZE), sent with the shapes.
        if sh.kind == "pointstyle" { doc.header.point_display_mode = sh.mode; doc.header.point_display_size = sh.r; continue; }
        if !doc.layers.contains(&sh.layer) { doc.layers.add(Layer::new(sh.layer.clone())).map_err(err)?; }
        let e = match sh.kind.as_str() {
            // One of the drawing's own blocks: a BLOCK record with its objects (left as it is when the drawing has one
            // of that name already, say from an earlier save), then nothing to add here.
            "blockdef" if !sh.name.is_empty() => { define_block(&mut doc, sh)?; continue; }
            // An insert of one of them.
            "insert" if !sh.pts.is_empty() && !sh.name.is_empty() => {
                let mut i = Insert::new(sh.name.clone(), Vector3::new(sh.pts[0].0, sh.pts[0].1, 0.0)).with_uniform_scale(if sh.sc > 0.0 { sh.sc } else { 1.0 }).with_rotation(sh.rot);
                i.common.layer = sh.layer.clone();
                // Its attributes (ATTRIB entities, ended by SEQEND): each as placed, with its value.
                for a in sh.atts.iter().filter(|a| !a.tag.is_empty() && !a.pts.is_empty()) {
                    use acadrust::entities::AttributeEntity;
                    let mut at = AttributeEntity::new(a.tag.clone(), a.text.clone());
                    at.insertion_point = Vector3::new(a.pts[0].0, a.pts[0].1, 0.0); at.height = a.h; at.rotation = a.rot; at.common.layer = a.layer.clone();
                    at.flags.invisible = a.flags.invisible; at.flags.constant = a.flags.constant; at.flags.verify = a.flags.verify; at.flags.preset = a.flags.preset; at.flags.locked_position = a.flags.lock;
                    i.attributes.push(at);
                }
                EntityType::Insert(i)
            }
            _ => match entity_of(sh) { Some(e) => e, None => continue },
        };
        doc.add_entity(e).map_err(err)?;
    }
    for d in &devices {
        if !doc.layers.contains(&d.layer) { doc.layers.add(Layer::new(d.layer.clone())).map_err(|e| e.to_string())?; }
        let mut c = Circle::new();
        c.center = Vector3::new(d.x, d.y, 0.0);
        c.radius = d.r;
        c.common.layer = d.layer.clone();
        doc.add_entity(EntityType::Circle(c)).map_err(|e| e.to_string())?;
        for (s, h, dx, dy) in [(&d.text, d.r * 0.7, -d.r * 0.35 * d.text.chars().count() as f64, -d.r * 0.35), (&d.label, d.r * 0.6, d.r * 1.3, -d.r * 0.3)] {
            if s.is_empty() { continue; }
            let mut t = Text::new();
            t.value = s.clone();
            t.insertion_point = Vector3::new(d.x + dx, d.y + dy, 0.0);
            t.height = h;
            t.common.layer = d.layer.clone();
            doc.add_entity(EntityType::Text(t)).map_err(|e| e.to_string())?;
        }
    }
    Ok(doc)
}

/// A file version asked for by its year ("2018", "2013", "2010", "2007", "2004", "2000", "R12"); "" or anything else is
/// none (the drawing's own).
fn version_of(v: &str) -> Option<acadrust::types::DxfVersion> {
    use acadrust::types::DxfVersion;
    match v.trim().to_uppercase().as_str() {
        "2018" => Some(DxfVersion::AC1032), "2013" => Some(DxfVersion::AC1027), "2010" => Some(DxfVersion::AC1024),
        "2007" => Some(DxfVersion::AC1021), "2004" => Some(DxfVersion::AC1018), "2000" => Some(DxfVersion::AC1015),
        "R12" => Some(DxfVersion::AC1009), _ => None,
    }
}

/// The drawing saved as DXF with the app's additions (see `with_additions`), in `version` (see `version_of`) or its own.
#[wasm_bindgen(js_name = exportDxf)]
pub fn export_dxf(bytes: Vec<u8>, devices_json: &str, shapes_json: &str, erased_json: &str, version: &str) -> Result<Vec<u8>, JsError> {
    let doc = with_additions(bytes, devices_json, shapes_json, erased_json).map_err(|e| JsError::new(&e))?;
    let w = acadrust::DxfWriter::new(&doc);
    let w = match version_of(version) { Some(v) => w.with_version(v), None => w };
    w.write_to_vec().map_err(|e| JsError::new(&e.to_string()))
}

/// The drawing saved as DWG with the app's additions: in `version` (2000 or later), else the version it was read in (a
/// DWG), else AutoCAD 2018; a version older than 2000 is written as 2018.
fn dwg_bytes(bytes: Vec<u8>, devices_json: &str, shapes_json: &str, erased_json: &str, version: &str) -> Result<Vec<u8>, String> {
    use acadrust::types::DxfVersion;
    let mut doc = with_additions(bytes, devices_json, shapes_json, erased_json)?;
    if let Some(v) = version_of(version) { doc.version = v; }
    if doc.version < DxfVersion::AC1015 || doc.version == DxfVersion::Unknown { doc.version = DxfVersion::AC1032; }
    acadrust::DwgWriter::write_to_vec(&doc).map_err(|e| e.to_string())
}

#[wasm_bindgen(js_name = exportDwg)]
pub fn export_dwg(bytes: Vec<u8>, devices_json: &str, shapes_json: &str, erased_json: &str, version: &str) -> Result<Vec<u8>, JsError> {
    dwg_bytes(bytes, devices_json, shapes_json, erased_json, version).map_err(|e| JsError::new(&e))
}

/// The exact pieces of model-space objects (CROP), by handle, as JSON {pieces: {handle: [piece]}, truncated} — see
/// doc/explode.rs. Read from the drawing's bytes, like saving, so the open view keeps no second copy of the drawing.
#[wasm_bindgen(js_name = explodeObjects)]
pub fn explode_objects(bytes: Vec<u8>, handles_json: &str) -> Result<String, JsError> {
    let (doc, _) = read(bytes).map_err(|e| JsError::new(&e))?;
    let handles: Vec<String> = serde_json::from_str(handles_json).map_err(|e| JsError::new(&e.to_string()))?;
    let (pieces, truncated) = explode::explode(&doc, &handles);
    Ok(serde_json::json!({ "pieces": pieces, "truncated": truncated }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use acadrust::entities::{BoundaryPath, Hatch, HatchPattern, HatchPatternLine, Line, PolylineEdge};
    use acadrust::tables::{LineType, LineTypeElement};
    use acadrust::types::Vector2;

    /// A small drawing with a dashed line, a solid hatch and a pattern hatch (ANSI31-like), written by acadrust.
    fn drawing() -> Vec<u8> {
        let mut doc = CadDocument::new();
        doc.header.linetype_scale = 2.0;
        let mut dashed = LineType::new("DASHED");
        dashed.add_element(LineTypeElement::dash(10.0));
        dashed.add_element(LineTypeElement::space(5.0));
        doc.line_types.add(dashed).unwrap();
        let mut l = Line::from_coords(0.0, 0.0, 0.0, 100.0, 0.0, 0.0);
        l.common.linetype = "DASHED".into();
        doc.add_entity(EntityType::Line(l)).unwrap();
        doc.add_entity(EntityType::Line(Line::from_coords(0.0, 10.0, 0.0, 100.0, 10.0, 0.0))).unwrap();
        let square = |x: f64| { let mut p = BoundaryPath::new(); p.add_edge(BoundaryEdge::Polyline(PolylineEdge::new(vec![Vector2::new(x, 20.0), Vector2::new(x + 10.0, 20.0), Vector2::new(x + 10.0, 30.0), Vector2::new(x, 30.0)], true))); p };
        let mut solid = Hatch::solid();
        solid.add_path(square(0.0));
        doc.add_entity(EntityType::Hatch(Box::new(solid))).unwrap();
        let mut pat = HatchPattern::new("ANSI31");
        pat.add_line(HatchPatternLine { angle: PI / 4.0, base_point: Vector2::new(0.0, 0.0), offset: Vector2::new(-2.0, 2.0), dash_lengths: vec![] });
        let mut hatched = Hatch::with_pattern(pat);
        hatched.add_path(square(20.0));
        doc.add_entity(EntityType::Hatch(Box::new(hatched))).unwrap();
        acadrust::DxfWriter::new(&doc).write_to_vec().unwrap()
    }

    /// What a drawing gives the CAD view: segments per layer, texts, blocks, closed objects.
    fn facts(d: &CadDoc) -> (BTreeMap<String, u32>, usize, usize, usize) {
        let layers = d.layers.iter().filter(|l| l.count > 0).map(|l| (l.name.clone(), l.count)).collect();
        (layers, d.texts.len(), d.objects.iter().filter(|o| o.block.is_some()).count(), d.objects.iter().filter(|o| o.area.is_some()).count())
    }
    fn fixture(name: &str) -> Vec<u8> { std::fs::read(format!("{}/../../tests/fixtures/cad/{}", env!("CARGO_MANIFEST_DIR"), name)).unwrap() }
    fn sample(name: &str) -> Vec<u8> { std::fs::read(format!("{}/../../electron/samples/{}", env!("CARGO_MANIFEST_DIR"), name)).unwrap() }

    /// Round trip: a drawing saved as DWG (nothing added) reads back with the same layers, lines, texts, blocks and
    /// closed objects; with additions, those come on top on their own layers.
    #[test]
    fn dwg_round_trip() {
        for (name, bytes) in [("plan-2018.dwg", fixture("plan-2018.dwg")), ("plan-2004.dwg", fixture("plan-2004.dwg")), ("sample-villa-gf.dxf", sample("sample-villa-gf.dxf")), ("linetypes-hatches.dxf", fixture("linetypes-hatches.dxf"))] {
            let before = CadDoc::new(bytes.clone()).unwrap();
            let out = dwg_bytes(bytes.clone(), "[]", "", "", "").unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(out.starts_with(b"AC10"), "{name}: not a DWG");
            let after = CadDoc::new(out).unwrap_or_else(|_| panic!("{name}: the DWG written does not read back"));
            assert_eq!(facts(&before), facts(&after), "{name}");
            assert_eq!(before.linetypes, after.linetypes, "{name}: linetypes");
            assert_eq!(before.fills.len(), after.fills.len(), "{name}: fills");
            assert_eq!(before.info().replace("\"format\":\"DXF\"", "\"format\":\"DWG\""), after.info(), "{name}: info (all but DXF → DWG)");
        }
        let bytes = sample("sample-villa-gf.dxf");
        let devices = r#"[{"layer":"E-LV-POINTS","x":1000,"y":1000,"r":200,"text":"","label":"DB-GF1/R1"}]"#;
        let shapes = r#"[{"layer":"E-TRAY","kind":"pline","pts":[[0,0],[5000,0]]},{"layer":"LV-ANNO","kind":"text","pts":[[0,0]],"text":"CT 300","h":150},{"layer":"LV-ANNO","kind":"mtext","pts":[[0,2000]],"text":"{\\fArial|b1|i0;NOTES}\\PLine two","h":150,"just":"MC","w":1800,"lsp":1}]"#;
        let before = CadDoc::new(bytes.clone()).unwrap();
        let after = CadDoc::new(dwg_bytes(bytes, devices, shapes, "", "").unwrap()).unwrap();
        let (b, a) = (facts(&before), facts(&after));
        assert_eq!(a.1, b.1 + 4, "the label, the text and the note's two lines added");
        // The note is one MTEXT, read back as a plain text per line, the codes gone.
        let lines: Vec<&str> = after.texts.iter().filter(|t| t.s == "NOTES" || t.s == "Line two").map(|t| t.s.as_str()).collect();
        assert_eq!(lines, ["NOTES", "Line two"]);
        // A drawn point is a POINT entity, found by the Node snap; the point style goes into the header.
        let shapes = r#"[{"layer":"LV-SKETCH","kind":"point","pts":[[2500,2500]]},{"layer":"","kind":"pointstyle","pts":[],"mode":34,"r":-5}]"#;
        let plain = sample("sample-villa-gf.dxf");
        let dotted = CadDoc::new(dwg_bytes(plain.clone(), "[]", shapes, "", "").unwrap()).unwrap();
        assert_eq!(dotted.objects.iter().filter(|o| o.kind == "Point").count(), 1);
        let on = vec![1u8; dotted.layers.len()];
        let s = dotted.snap(2501.0, 2499.0, 5.0, NODE, &on, f64::NAN, f64::NAN);
        assert_eq!((s[0], s[1], s[2] as u32), (2500.0, 2500.0, NODE));
        let dxf = String::from_utf8_lossy(&export_dxf(plain, "[]", shapes, "[]", "").unwrap()).to_string();
        let i = dxf.find("$PDMODE").expect("$PDMODE written");
        assert!(dxf[i..i + 40].contains("34"), "{}", &dxf[i..i + 40]);
        let j = dxf.find("$PDSIZE").expect("$PDSIZE written");
        assert!(dxf[j..j + 40].contains("-5"), "{}", &dxf[j..j + 40]);
        assert!(a.0.contains_key("E-LV-POINTS"), "the device's circle on its layer");
        assert!(after.layers.iter().any(|l| l.name == "LV-ANNO"), "the text's layer");
        assert_eq!(a.0["E-TRAY"], b.0.get("E-TRAY").copied().unwrap_or(0) + 1);
    }

    /// The drawing's own blocks: a BLOCK record with its objects and an INSERT of it, read back as one block, its
    /// objects shown where the insert puts them; a record of a name the drawing has already is left alone.
    #[test]
    fn own_blocks_written() {
        let shapes = r#"[{"layer":"","kind":"blockdef","pts":[],"name":"DB-A","units":4,"text":"Board symbol","items":[{"layer":"0","kind":"line","pts":[[0,0],[400,0]]},{"layer":"LV-ANNO","kind":"text","pts":[[50,100]],"text":"DB","h":100}]},{"layer":"E-POWER","kind":"insert","pts":[[3000,3000]],"name":"DB-A","sc":2,"rot":0}]"#;
        for (name, bytes) in [("dwg", dwg_bytes(sample("sample-villa-gf.dxf"), "[]", shapes, "", "").unwrap()), ("dxf", export_dxf(sample("sample-villa-gf.dxf"), "[]", shapes, "[]", "").unwrap().to_vec())] {
            let after = CadDoc::new(bytes).unwrap_or_else(|_| panic!("{name}: the drawing written does not read back"));
            let inserts: Vec<&ObjInfo> = after.objects.iter().filter(|o| o.block.as_deref() == Some("DB-A")).collect();
            assert_eq!(inserts.len(), 1, "{name}: one insert of the block");
            assert_eq!(after.layers.get(inserts[0].layer as usize).map(|l| l.name.as_str()), Some("E-POWER"), "{name}");
            // The block's text, scaled by 2 and moved to the insert: at (3100, 3200), 200 high.
            let t = after.texts.iter().find(|t| t.s == "DB").unwrap_or_else(|| panic!("{name}: the block's text"));
            assert_eq!((t.x.round(), t.y.round(), t.h.round()), (3100.0, 3200.0, 200.0), "{name}");
        }
        // Attributes: an ATTDEF in the block, the insert's ATTRIB with its value, read back as the insert's attribute;
        // an invisible one is kept too, a constant one with its fixed value.
        let att_shapes = r#"[{"layer":"","kind":"blockdef","pts":[],"name":"LT","units":4,"items":[{"layer":"0","kind":"circle","pts":[[0,0]],"r":100},{"layer":"0","kind":"attdef","pts":[[150,0]],"text":"L1","h":50,"tag":"CIRCUIT","prompt":"Circuit"},{"layer":"0","kind":"attdef","pts":[[150,-80]],"text":"36","h":40,"tag":"WATTS","flags":{"invisible":true}},{"layer":"0","kind":"attdef","pts":[[0,150]],"text":"LED","h":40,"tag":"TYPE","flags":{"constant":true}}]},{"layer":"E-LIGHTING","kind":"insert","pts":[[5000,3000]],"name":"LT","sc":1,"rot":0,"atts":[{"layer":"E-LIGHTING","kind":"attdef","pts":[[5150,3000]],"text":"DB1/L3","h":50,"tag":"CIRCUIT"},{"layer":"E-LIGHTING","kind":"attdef","pts":[[5150,2920]],"text":"18","h":40,"tag":"WATTS","flags":{"invisible":true}},{"layer":"E-LIGHTING","kind":"attdef","pts":[[5000,3150]],"text":"LED","h":40,"tag":"TYPE","flags":{"constant":true}}]}]"#;
        for (name, bytes) in [("dwg", dwg_bytes(sample("sample-villa-gf.dxf"), "[]", att_shapes, "", "").unwrap()), ("dxf", export_dxf(sample("sample-villa-gf.dxf"), "[]", att_shapes, "[]", "").unwrap().to_vec())] {
            let after = CadDoc::new(bytes).unwrap_or_else(|_| panic!("{name}: the drawing with attributes does not read back"));
            let ins = after.objects.iter().find(|o| o.block.as_deref() == Some("LT")).unwrap_or_else(|| panic!("{name}: the insert"));
            assert_eq!((ins.attrs.get("CIRCUIT").map(String::as_str), ins.attrs.get("WATTS").map(String::as_str), ins.attrs.get("TYPE").map(String::as_str)), (Some("DB1/L3"), Some("18"), Some("LED")), "{name}");
        }
        // Saving the drawing that has the block already keeps that record (no second DB-A).
        let once = dwg_bytes(sample("sample-villa-gf.dxf"), "[]", shapes, "", "").unwrap();
        let twice = CadDoc::new(dwg_bytes(once, "[]", shapes, "", "").unwrap()).unwrap();
        assert_eq!(twice.objects.iter().filter(|o| o.block.as_deref() == Some("DB-A")).count(), 2, "two inserts, one record");
    }

    /// Nearest and perpendicular snaps on a line, and a DXF / DWG saved in the version asked for.
    #[test]
    fn nearest_perpendicular_and_versions() {
        let mut doc = acadrust::CadDocument::new();
        doc.add_entity(EntityType::Line(Line::from_coords(0.0, 0.0, 0.0, 100.0, 0.0, 0.0))).unwrap();
        let bytes = acadrust::DxfWriter::new(&doc).write_to_vec().unwrap();
        let d = CadDoc::new(bytes.clone()).unwrap();
        let on = vec![1u8; 8];
        let n = d.snap(42.0, 3.0, 5.0, NEAREST, &on, f64::NAN, f64::NAN);
        assert_eq!((n[0].round(), n[1].round(), n[2] as u32), (42.0, 0.0, NEAREST));
        let p = d.snap(31.0, 2.0, 5.0, PERPENDICULAR, &on, 30.0, 50.0);
        assert_eq!((p[0].round(), p[1].round(), p[2] as u32), (30.0, 0.0, PERPENDICULAR));
        assert!(d.snap(31.0, 2.0, 5.0, PERPENDICULAR, &on, f64::NAN, f64::NAN).is_empty(), "no last point, no perpendicular");
        // The endpoint wins over the nearest point beside it.
        assert_eq!(d.snap(1.0, 1.0, 5.0, ENDPOINT | NEAREST, &on, f64::NAN, f64::NAN)[2] as u32, ENDPOINT);
        let r12 = String::from_utf8_lossy(&export_dxf(bytes.clone(), "[]", "[]", "[]", "R12").unwrap()).to_string();
        assert!(r12.contains("AC1009"), "R12 DXF");
        let dwg = dwg_bytes(bytes, "[]", "[]", "[]", "2004").unwrap();
        assert!(dwg.starts_with(b"AC1018"), "DWG 2004");
    }

    /// External references are listed with their path, overlay flag and inserts; ordinary blocks are not.
    #[test]
    fn xrefs_listed() {
        use acadrust::entities::Insert;
        use acadrust::tables::BlockRecord;
        use acadrust::types::Vector3;
        let mut doc = CadDocument::new();
        let mut rec = BlockRecord::new("STR-GF");
        rec.flags.is_xref = true;
        rec.flags.is_xref_overlay = true;
        rec.xref_path = "..\\Structure\\STR-GF.dwg".into();
        doc.block_records.add(rec).unwrap();
        doc.block_records.add(BlockRecord::new("CHAIR")).unwrap();
        doc.add_entity(EntityType::Insert(Insert::new("STR-GF", Vector3::new(100.0, 200.0, 0.0)).with_uniform_scale(2.0).with_rotation(PI / 2.0))).unwrap();
        doc.add_entity(EntityType::Insert(Insert::new("CHAIR", Vector3::new(0.0, 0.0, 0.0)))).unwrap();
        let x = xrefs_of(&doc);
        assert_eq!(x.len(), 1);
        assert_eq!(x[0].name, "STR-GF");
        assert_eq!(x[0].path, "..\\Structure\\STR-GF.dwg");
        assert!(x[0].overlay && !x[0].unloaded);
        assert_eq!(x[0].inserts.len(), 1);
        let i = &x[0].inserts[0];
        assert_eq!((i.x, i.y, i.sx), (100.0, 200.0, 2.0));
        assert!((i.rot - PI / 2.0).abs() < 1e-12);
    }

    /// A plan whose drawing names a reference (STR-GF, saved as ..\\Structure\\STR-GF.dxf): written as DXF and read again,
    /// the reference is still listed. LVDS_WRITE_XREF_FIXTURE writes tests/fixtures/cad/xref-host.dxf (page tests).
    /// Bind: a reference's fills go into the saved copy as hatches, solid or with their pattern lines, and are read again.
    #[test]
    fn hatch_shapes_saved() {
        let before = CadDoc::new(drawing()).unwrap().fills.len();
        let sq = r#"[[100,0],[110,0],[110,10],[100,10]]"#;
        let shapes = format!(r#"[{{"layer":"STR$0$S-FILL","kind":"hatch","pts":[],"loops":[{sq}],"solid":true}},{{"layer":"STR$0$S-HATCH","kind":"hatch","pts":[],"loops":[{sq}],"lines":[{{"angle":0.785398,"base":[0,0],"offset":[-2,2],"dashes":[]}}]}},{{"layer":"X","kind":"hatch","pts":[],"loops":[[[0,0],[1,1]]]}}]"#);
        let doc = with_additions(drawing(), "[]", &shapes, "").unwrap();
        let bytes = acadrust::DxfWriter::new(&doc).write_to_vec().unwrap();
        let d = CadDoc::new(bytes).unwrap();
        assert_eq!(d.fills.len(), before + 2); // the one with a loop of two points is left out
        assert!(d.layers.iter().any(|l| l.name == "STR$0$S-HATCH"));
    }

    /// An ellipse and a polyline with arc segments (a revision cloud) are saved as such, and read back.
    #[test]
    fn ellipse_and_bulges_saved() {
        let shapes = r#"[{"layer":"LV-SKETCH","kind":"ellipse","pts":[[100,50]],"axis":[30,40],"ratio":0.5},{"layer":"LV-ANNO","kind":"pline","pts":[[0,0],[10,0],[10,10]],"closed":true,"bulges":[0.5,0.5,0.5]}]"#;
        let doc = with_additions(drawing(), "[]", shapes, "").unwrap();
        let bytes = acadrust::DxfWriter::new(&doc).write_to_vec().unwrap();
        let (back, _) = read(bytes).unwrap();
        let ell = back.entities().find_map(|e| if let EntityType::Ellipse(x) = e { Some(x) } else { None }).expect("the ellipse");
        assert_eq!((ell.center.x, ell.center.y, ell.major_axis.x, ell.major_axis.y), (100.0, 50.0, 30.0, 40.0));
        assert!((ell.minor_axis_ratio - 0.5).abs() < 1e-9 && (ell.end_parameter - 2.0 * PI).abs() < 1e-9);
        let cloud = back.entities().find_map(|e| if let EntityType::LwPolyline(x) = e { if x.common.layer == "LV-ANNO" { Some(x) } else { None } } else { None }).expect("the cloud");
        assert!(cloud.is_closed);
        assert_eq!(cloud.vertices.iter().map(|v| v.bulge).collect::<Vec<_>>(), vec![0.5, 0.5, 0.5]);
        // Read for the screen, the ellipse is a closed outline of many points.
        assert!(CadDoc::new(acadrust::DxfWriter::new(&doc).write_to_vec().unwrap()).is_ok());
    }

    #[test]
    fn xrefs_kept_through_dxf() {
        use acadrust::entities::{Insert, Line};
        use acadrust::tables::BlockRecord;
        use acadrust::types::Vector3;
        let mut doc = CadDocument::new();
        let mut rec = BlockRecord::new("STR-GF");
        rec.flags.is_xref = true;
        rec.flags.is_xref_overlay = true;
        rec.xref_path = "..\\Structure\\STR-GF.dxf".into();
        doc.block_records.add(rec).unwrap();
        doc.add_entity(EntityType::Line(Line::from_points(Vector3::new(0.0, 0.0, 0.0), Vector3::new(10000.0, 0.0, 0.0)))).unwrap();
        doc.add_entity(EntityType::Insert(Insert::new("STR-GF", Vector3::new(500.0, 0.0, 0.0)))).unwrap();
        let bytes = acadrust::DxfWriter::new(&doc).write_to_vec().unwrap();
        if let Ok(path) = std::env::var("LVDS_WRITE_XREF_FIXTURE") { std::fs::write(path, &bytes).unwrap(); }
        let back = DxfReader::from_reader(Cursor::new(bytes)).and_then(|r| r.read()).unwrap();
        let x = xrefs_of(&back);
        assert_eq!(x.len(), 1);
        assert_eq!((x[0].name.as_str(), x[0].path.as_str(), x[0].overlay), ("STR-GF", "..\\Structure\\STR-GF.dxf", true));
        assert_eq!(x[0].inserts.len(), 1);
        assert_eq!(x[0].inserts[0].x, 500.0);
    }

    #[test]
    fn linetypes_and_fills() {
        let bytes = drawing();
        if let Ok(path) = std::env::var("LVDS_WRITE_FIXTURE") { std::fs::write(path, &bytes).unwrap(); }
        let d = CadDoc::new(bytes).unwrap();
        // The dashed line at LTSCALE 2: 20 on, 10 off; the plain line continuous.
        assert_eq!(d.linetypes.len(), 2);
        assert_eq!(d.linetypes[1], vec![20.0, -10.0]);
        let lt: Vec<u16> = d.seg_lt.clone();
        assert_eq!(&lt[0..2], &[1, 0]);
        // The solid hatch filled; the pattern hatch with its line family, one loop each.
        assert_eq!(d.fills.len(), 2);
        assert!(d.fills[0].solid && d.fills[0].loops.len() == 1 && d.fills[0].lines.is_empty());
        assert!(!d.fills[1].solid && d.fills[1].lines.len() == 1);
        let [a, b] = d.fills[1].loops[0];
        assert_eq!(b - a, 4);
    }
}

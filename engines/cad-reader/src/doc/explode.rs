//! Exact explode of model-space objects, for CROP: an object's geometry in world coordinates as lines, arcs, circles
//! and bulged polylines, texts (attributes with their tag), hatch loops, 2D solids, points, and dimensions as groups.
//! Curves stay curves while the transform keeps their shape (insert point, base point, rotation, uniform or mirrored
//! scale); under a non-uniform scale an arc becomes an ellipse, which (like ellipses and splines) comes as a polyline
//! within a small chord tolerance. The same rules as the view: layer 0 and ByBlock children take the insert's layer,
//! colour and linetype; nested blocks and MINSERT arrays are expanded. Each piece has its layer, and its colour and
//! linetype only where they differ from its layer's.

use super::{rgb_of, spline_points, Affine, INK, MAX_DEPTH};
use acadrust::entities::mtext_format::parse_mtext;
use acadrust::entities::{BoundaryEdge, EntityType};
use acadrust::types::Color;
use acadrust::CadDocument;
use serde::Serialize;
use std::collections::HashMap;
use std::f64::consts::PI;

/// No more pieces than this from one object (a huge MINSERT array): the rest is left out and `truncated` set.
const MAX_PIECES: usize = 200_000;
/// Chord tolerance for curves that come as polylines, relative to the curve's largest radius.
const CHORD: f64 = 1e-4;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub(crate) struct Style {
    pub layer: String,
    #[serde(skip_serializing_if = "Option::is_none")] pub color: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")] pub lt: Option<String>,
}

/// One piece of an exploded object (world coordinates, radians). Arcs run anticlockwise a0 → a1 (a1 > a0); polyline
/// vertices are [x, y, bulge].
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum Piece {
    Line { #[serde(flatten)] s: Style, a: [f64; 2], b: [f64; 2] },
    Arc { #[serde(flatten)] s: Style, c: [f64; 2], r: f64, a0: f64, a1: f64 },
    Circle { #[serde(flatten)] s: Style, c: [f64; 2], r: f64 },
    Pline { #[serde(flatten)] s: Style, pts: Vec<[f64; 3]>, closed: bool },
    Text { #[serde(flatten)] s: Style, at: [f64; 2], h: f64, rot: f64, text: String, #[serde(skip_serializing_if = "Option::is_none")] tag: Option<String> },
    Hatch { #[serde(flatten)] s: Style, loops: Vec<Vec<[f64; 3]>>, solid: bool, pattern: String },
    Solid { #[serde(flatten)] s: Style, pts: Vec<[f64; 2]> },
    Point { #[serde(flatten)] s: Style, at: [f64; 2] },
    /// A dimension: its lines, arrows and text, kept or left out as one.
    Group { #[serde(flatten)] s: Style, items: Vec<Piece> },
}

/// The layer, colour and linetype an entity is drawn with (resolved).
#[derive(Clone)]
struct Ctx { layer: String, rgb: u32, lt: String }

struct Ex<'a> {
    doc: &'a CadDocument,
    blocks: HashMap<String, (f64, f64)>,
    layers: HashMap<String, (u32, String)>,
    count: usize,
    truncated: bool,
}

/// Whether the transform keeps shapes (rotation, uniform or mirrored scale, translation).
fn similar(t: &Affine) -> bool {
    let (p, q, r) = (t.a * t.a + t.b * t.b, t.c * t.c + t.d * t.d, t.a * t.c + t.b * t.d);
    let m = p.max(q);
    m > 0.0 && (p - q).abs() <= 1e-9 * m && r.abs() <= 1e-9 * m
}
fn det(t: &Affine) -> f64 { t.a * t.d - t.b * t.c }
/// The world angle of a direction at angle `a` in the transform's own coordinates.
fn map_angle(t: &Affine, a: f64) -> f64 { let (s, c) = a.sin_cos(); (t.b * c + t.d * s).atan2(t.a * c + t.c * s) }
/// The largest stretch of the transform (its largest singular value).
fn stretch(t: &Affine) -> f64 {
    let (p, q, r) = (t.a * t.a + t.b * t.b, t.c * t.c + t.d * t.d, t.a * t.c + t.b * t.d);
    (((p + q) + ((p - q).powi(2) + 4.0 * r * r).sqrt()) / 2.0).sqrt()
}
/// Steps for a sweep on a curve of radius `r` so that each chord is within the chord tolerance.
fn steps(sweep: f64, r: f64) -> usize {
    if !(r > 0.0) { return 1; }
    let d = 2.0 * (1.0 - CHORD).acos();
    ((sweep.abs() / d).ceil() as usize).clamp(4, 4096)
}
/// Centre, radius, start angle and sweep (signed) of a bulged segment a → b.
fn bulge_arc(a: (f64, f64), b: (f64, f64), bulge: f64) -> Option<((f64, f64), f64, f64, f64)> {
    let chord = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
    if chord < 1e-12 { return None; }
    let theta = 4.0 * bulge.atan();
    let r = chord / (2.0 * (theta.abs() / 2.0).sin());
    let (mx, my) = ((a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0);
    let h = (r * r - (chord / 2.0).powi(2)).max(0.0).sqrt() * if theta.abs() > PI { -1.0 } else { 1.0 } * theta.signum();
    let c = (mx - h * (b.1 - a.1) / chord, my + h * (b.0 - a.0) / chord);
    Some((c, r, (a.1 - c.1).atan2(a.0 - c.0), theta))
}
fn pt(t: &Affine, p: (f64, f64)) -> [f64; 2] { let (x, y) = t.apply(p.0, p.1); [x, y] }

impl<'a> Ex<'a> {
    fn new(doc: &'a CadDocument) -> Self {
        let mut blocks = HashMap::new();
        for rec in doc.block_records.iter() {
            if let Some(EntityType::Block(blk)) = doc.get_entity(rec.block_entity_handle) {
                blocks.insert(rec.name.to_uppercase(), (blk.base_point.x, blk.base_point.y));
            }
        }
        let layers = doc.layers.iter().map(|l| (l.name.clone(), (rgb_of(&l.color).unwrap_or(INK), l.line_type.trim().to_uppercase()))).collect();
        Ex { doc, blocks, layers, count: 0, truncated: false }
    }

    fn layer_of(&self, name: &str) -> (u32, String) { self.layers.get(name).cloned().unwrap_or((INK, String::new())) }

    fn ctx(&self, layer: &str, color: &Color, linetype: &str, parent: Option<&Ctx>) -> Ctx {
        let layer = match parent { Some(p) if layer == "0" => p.layer.clone(), _ => layer.to_string() };
        let (lrgb, llt) = self.layer_of(&layer);
        let rgb = match color {
            Color::ByLayer => lrgb,
            Color::ByBlock => parent.map_or(INK, |p| p.rgb),
            Color::None => INK,
            c => rgb_of(c).unwrap_or(INK),
        };
        let named = linetype.trim().to_uppercase();
        let lt = if named == "BYBLOCK" { parent.map_or(llt.clone(), |p| p.lt.clone()) } else if named.is_empty() || named == "BYLAYER" { llt } else { named };
        Ctx { layer, rgb, lt }
    }

    fn style(&self, c: &Ctx) -> Style {
        let (lrgb, llt) = self.layer_of(&c.layer);
        Style { layer: c.layer.clone(), color: (c.rgb != lrgb).then_some(c.rgb), lt: (!c.lt.is_empty() && c.lt != llt).then(|| c.lt.clone()) }
    }

    fn push(&mut self, out: &mut Vec<Piece>, p: Piece) {
        if self.count >= MAX_PIECES { self.truncated = true; return; }
        self.count += 1;
        out.push(p);
    }

    /// An arc anticlockwise a0 → a1 (own coordinates) in the world: an arc, or a polyline under a non-uniform scale.
    fn arc(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, c: (f64, f64), r: f64, a0: f64, a1: f64) {
        let sweep = a1 - a0;
        if similar(t) {
            let k = det(t).abs().sqrt();
            let b0 = if det(t) > 0.0 { map_angle(t, a0) } else { map_angle(t, a1) };
            self.push(out, Piece::Arc { s, c: pt(t, c), r: r * k, a0: b0, a1: b0 + sweep });
        } else {
            let n = steps(sweep, r * stretch(t));
            let pts = (0..=n).map(|i| { let a = a0 + sweep * i as f64 / n as f64; let p = pt(t, (c.0 + r * a.cos(), c.1 + r * a.sin())); [p[0], p[1], 0.0] }).collect();
            self.push(out, Piece::Pline { s, pts, closed: false });
        }
    }

    fn circle(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, c: (f64, f64), r: f64) {
        if similar(t) {
            self.push(out, Piece::Circle { s, c: pt(t, c), r: r * det(t).abs().sqrt() });
        } else {
            let n = steps(2.0 * PI, r * stretch(t));
            let pts = (0..n).map(|i| { let a = 2.0 * PI * i as f64 / n as f64; let p = pt(t, (c.0 + r * a.cos(), c.1 + r * a.sin())); [p[0], p[1], 0.0] }).collect();
            self.push(out, Piece::Pline { s, pts, closed: true });
        }
    }

    /// Polyline vertices [x, y, bulge] in the world: bulges kept (their sign turned when mirrored), or, under a
    /// non-uniform scale, the arc segments as points within the chord tolerance.
    fn vertices(t: &Affine, v: &[(f64, f64, f64)], closed: bool) -> Vec<[f64; 3]> {
        if similar(t) {
            let sg = det(t).signum();
            return v.iter().map(|p| { let q = pt(t, (p.0, p.1)); [q[0], q[1], p.2 * sg] }).collect();
        }
        let n = v.len();
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            let a = v[i];
            let q = pt(t, (a.0, a.1));
            out.push([q[0], q[1], 0.0]);
            if a.2.abs() < 1e-12 || (!closed && i + 1 == n) { continue; }
            let b = v[(i + 1) % n];
            if let Some((c, r, start, theta)) = bulge_arc((a.0, a.1), (b.0, b.1), a.2) {
                let m = steps(theta, r * stretch(t));
                for k in 1..m { let an = start + theta * k as f64 / m as f64; let p = pt(t, (c.0 + r * an.cos(), c.1 + r * an.sin())); out.push([p[0], p[1], 0.0]); }
            }
        }
        out
    }

    fn polyline(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, v: &[(f64, f64, f64)], closed: bool) {
        if v.len() < 2 { return; }
        let pts = Self::vertices(t, v, closed);
        self.push(out, Piece::Pline { s, pts, closed });
    }

    fn sampled(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, pts: &[(f64, f64)], closed: bool) {
        if pts.len() < 2 { return; }
        let pts = pts.iter().map(|p| { let q = pt(t, *p); [q[0], q[1], 0.0] }).collect();
        self.push(out, Piece::Pline { s, pts, closed });
    }

    fn entity(&mut self, out: &mut Vec<Piece>, e: &EntityType, t: &Affine, parent: Option<&Ctx>, depth: u32) {
        let c = e.common();
        if c.invisible || self.truncated { return; }
        let cx = self.ctx(&c.layer, &c.color, &c.linetype, parent);
        let s = self.style(&cx);
        let mirror = |n: &acadrust::types::Vector3, t: &Affine| if n.z < -0.5 { t.then(&Affine::scale(-1.0, 1.0)) } else { *t };
        match e {
            EntityType::Line(x) => self.push(out, Piece::Line { s, a: pt(t, (x.start.x, x.start.y)), b: pt(t, (x.end.x, x.end.y)) }),
            EntityType::Arc(x) => {
                let t = mirror(&x.normal, t);
                let mut a1 = x.end_angle;
                while a1 <= x.start_angle { a1 += 2.0 * PI; }
                self.arc(out, s, &t, (x.center.x, x.center.y), x.radius, x.start_angle, a1);
            }
            EntityType::Circle(x) => { let t = mirror(&x.normal, t); self.circle(out, s, &t, (x.center.x, x.center.y), x.radius); }
            EntityType::Ellipse(x) => {
                let (mx, my) = (x.major_axis.x, x.major_axis.y);
                let (nx, ny) = (-my * x.minor_axis_ratio, mx * x.minor_axis_ratio);
                let mut p1 = x.end_parameter;
                while p1 <= x.start_parameter { p1 += 2.0 * PI; }
                let full = (p1 - x.start_parameter - 2.0 * PI).abs() < 1e-9;
                let n = steps(p1 - x.start_parameter, (mx * mx + my * my).sqrt() * stretch(t));
                let at = |p: f64| (x.center.x + mx * p.cos() + nx * p.sin(), x.center.y + my * p.cos() + ny * p.sin());
                let pts: Vec<_> = (0..if full { n } else { n + 1 }).map(|i| at(x.start_parameter + (p1 - x.start_parameter) * i as f64 / n as f64)).collect();
                self.sampled(out, s, t, &pts, full);
            }
            EntityType::LwPolyline(x) => {
                let t = mirror(&x.normal, t);
                let v: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
                self.polyline(out, s, &t, &v, x.is_closed);
            }
            EntityType::Polyline2D(x) => {
                let t = mirror(&x.normal, t);
                let v: Vec<_> = x.vertices.iter().map(|v| (v.location.x, v.location.y, v.bulge)).collect();
                self.polyline(out, s, &t, &v, x.is_closed());
            }
            EntityType::Polyline3D(x) => {
                let v: Vec<_> = x.vertices.iter().map(|v| (v.position.x, v.position.y, 0.0)).collect();
                self.polyline(out, s, t, &v, x.is_closed());
            }
            EntityType::Spline(x) => { let pts = spline_points(x); self.sampled(out, s, t, &pts, false); }
            EntityType::Solid(x) => {
                let mut pts = vec![pt(t, (x.first_corner.x, x.first_corner.y)), pt(t, (x.second_corner.x, x.second_corner.y)), pt(t, (x.fourth_corner.x, x.fourth_corner.y)), pt(t, (x.third_corner.x, x.third_corner.y))];
                pts.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-12 && (a[1] - b[1]).abs() < 1e-12);
                self.push(out, Piece::Solid { s, pts });
            }
            EntityType::Hatch(x) => {
                let mut loops = vec![];
                for path in &x.paths {
                    let mut v: Vec<(f64, f64, f64)> = vec![];
                    for edge in &path.edges {
                        match edge {
                            BoundaryEdge::Line(e) => v.push((e.start.x, e.start.y, 0.0)),
                            BoundaryEdge::Polyline(p) => v.extend(p.vertices.iter().map(|q| (q.x, q.y, q.z))),
                            BoundaryEdge::CircularArc(a) => {
                                let (a0, mut a1) = (a.start_angle, a.end_angle);
                                if a.counter_clockwise {
                                    while a1 <= a0 { a1 += 2.0 * PI; }
                                    v.push((a.center.x + a.radius * a0.cos(), a.center.y + a.radius * a0.sin(), ((a1 - a0) / 4.0).tan()));
                                } else {
                                    // As the view draws it: anticlockwise from the end to the start, here run backwards.
                                    let mut s0 = a0;
                                    while s0 <= a1 { s0 += 2.0 * PI; }
                                    v.push((a.center.x + a.radius * a0.cos(), a.center.y + a.radius * a0.sin(), -((s0 - a1) / 4.0).tan()));
                                }
                            }
                            BoundaryEdge::EllipticArc(a) => {
                                let (mx, my) = (a.major_axis_endpoint.x, a.major_axis_endpoint.y);
                                let (nx, ny) = (-my * a.minor_axis_ratio, mx * a.minor_axis_ratio);
                                let (p0, mut p1) = (a.start_angle, a.end_angle);
                                while p1 <= p0 { p1 += 2.0 * PI; }
                                let n = steps(p1 - p0, (mx * mx + my * my).sqrt());
                                let at = |p: f64| (a.center.x + mx * p.cos() + nx * p.sin(), a.center.y + my * p.cos() + ny * p.sin(), 0.0);
                                if a.counter_clockwise { for i in 0..n { v.push(at(p0 + (p1 - p0) * i as f64 / n as f64)); } } else { for i in 0..n { v.push(at(p1 - (p1 - p0) * i as f64 / n as f64)); } }
                            }
                            BoundaryEdge::Spline(sp) => {
                                if !sp.fit_points.is_empty() { v.extend(sp.fit_points.iter().map(|q| (q.x, q.y, 0.0))); } else { v.extend(sp.control_points.iter().map(|q| (q.x, q.y, 0.0))); }
                            }
                        }
                    }
                    // A loop drawn back to its start repeats the first point; the loop is closed anyway.
                    if v.len() > 1 { let (f, l) = (v[0], v[v.len() - 1]); if (f.0 - l.0).abs() < 1e-12 && (f.1 - l.1).abs() < 1e-12 { v.pop(); } }
                    if v.len() >= 2 { loops.push(Self::vertices(t, &v, true)); }
                }
                if !loops.is_empty() { self.push(out, Piece::Hatch { s, loops, solid: x.is_solid, pattern: x.pattern.name.clone() }); }
            }
            EntityType::Text(x) => {
                if x.value.trim().is_empty() { return; }
                self.push(out, Piece::Text { s, at: pt(t, (x.insertion_point.x, x.insertion_point.y)), h: x.height * t.size(), rot: x.rotation + t.angle(), text: x.value.clone(), tag: None });
            }
            EntityType::MText(x) => {
                let text = parse_mtext(&x.value, true).to_plain_text();
                for (i, line) in text.lines().enumerate() {
                    if line.trim().is_empty() { continue; }
                    let dy = -(i as f64 + 1.0) * x.height * 1.66 + x.height * 0.66;
                    let (sin, cos) = x.rotation.sin_cos();
                    let at = (x.insertion_point.x - dy * sin, x.insertion_point.y + dy * cos);
                    self.push(out, Piece::Text { s: s.clone(), at: pt(t, at), h: x.height * t.size(), rot: x.rotation + t.angle(), text: line.to_string(), tag: None });
                }
            }
            EntityType::Point(x) => self.push(out, Piece::Point { s, at: pt(t, (x.location.x, x.location.y)) }),
            EntityType::Insert(x) => {
                if depth >= MAX_DEPTH { return; }
                let t0 = mirror(&x.normal, t);
                let base = self.blocks.get(&x.block_name.to_uppercase()).copied().unwrap_or((0.0, 0.0));
                let children: Vec<&EntityType> = self.doc.entities_in_block(&x.block_name).collect();
                for r in 0..x.row_count.max(1) {
                    for col in 0..x.column_count.max(1) {
                        let off = Affine::rotate(x.rotation).apply(col as f64 * x.column_spacing, r as f64 * x.row_spacing);
                        let local = Affine::translate(x.insert_point.x + off.0, x.insert_point.y + off.1)
                            .then(&Affine::rotate(x.rotation))
                            .then(&Affine::scale(x.x_scale(), x.y_scale()))
                            .then(&Affine::translate(-base.0, -base.1));
                        let tt = t0.then(&local);
                        for child in &children { self.entity(out, child, &tt, Some(&cx), depth + 1); }
                    }
                }
                for a in &x.attributes {
                    if a.common.invisible || a.value.trim().is_empty() { continue; }
                    let ac = self.ctx(&a.common.layer, &a.common.color, &a.common.linetype, Some(&cx));
                    let s = self.style(&ac);
                    self.push(out, Piece::Text { s, at: pt(t, (a.insertion_point.x, a.insertion_point.y)), h: a.height * t.size(), rot: a.rotation + t.angle(), text: a.value.clone(), tag: Some(a.tag.clone()) });
                }
            }
            EntityType::Dimension(x) => {
                if depth >= MAX_DEPTH { return; }
                let name = x.base().block_name.clone();
                if name.is_empty() { return; }
                let children: Vec<&EntityType> = self.doc.entities_in_block(&name).collect();
                let mut items = vec![];
                for child in children { self.entity(&mut items, child, t, Some(&cx), depth + 1); }
                if !items.is_empty() { self.push(out, Piece::Group { s, items }); }
            }
            _ => {}
        }
    }
}

/// The pieces of the model-space objects with these handles (hex), by handle: a block insert gives what it draws
/// (its own pieces, not itself), any other object itself. A handle not found is left out.
pub(crate) fn explode(doc: &CadDocument, handles: &[String]) -> (HashMap<String, Vec<Piece>>, bool) {
    let mut ex = Ex::new(doc);
    let mut found = HashMap::new();
    let wanted: Vec<String> = handles.iter().map(|h| h.trim().to_uppercase()).collect();
    for e in doc.model_space_entities() {
        let h = format!("{:X}", e.common().handle.value());
        if !wanted.contains(&h) { continue; }
        let mut out = vec![];
        ex.entity(&mut out, e, &Affine::ID, None, 0);
        found.insert(h, out);
    }
    (found, ex.truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drawing() -> CadDocument {
        let bytes = std::fs::read(format!("{}/../../tests/fixtures/cad/crop-block.dxf", env!("CARGO_MANIFEST_DIR"))).unwrap();
        super::super::read(bytes).unwrap().0
    }
    /// The pieces of the insert at x = 1000 k (see examples/crop_fixture.rs).
    fn pieces(doc: &CadDocument, k: usize) -> Vec<Piece> {
        let h = doc.model_space_entities().find_map(|e| match e {
            EntityType::Insert(x) if (x.insert_point.x - 1000.0 * k as f64).abs() < 1e-9 => Some(format!("{:X}", x.common.handle.value())),
            _ => None,
        }).unwrap();
        let (mut m, truncated) = explode(doc, &[h.clone()]);
        assert!(!truncated);
        m.remove(&h).unwrap()
    }
    fn near(a: [f64; 2], b: [f64; 2]) -> bool { (a[0] - b[0]).abs() < 1e-6 && (a[1] - b[1]).abs() < 1e-6 }
    fn lines(p: &[Piece]) -> Vec<([f64; 2], [f64; 2])> { p.iter().filter_map(|x| if let Piece::Line { a, b, .. } = x { Some((*a, *b)) } else { None }).collect() }
    fn arcs(p: &[Piece]) -> Vec<([f64; 2], f64, f64, f64)> { p.iter().filter_map(|x| if let Piece::Arc { c, r, a0, a1, .. } = x { Some((*c, *r, *a0, *a1)) } else { None }).collect() }
    fn circles(p: &[Piece]) -> Vec<(Style, [f64; 2], f64)> { p.iter().filter_map(|x| if let Piece::Circle { s, c, r } = x { Some((s.clone(), *c, *r)) } else { None }).collect() }
    fn texts(p: &[Piece]) -> Vec<(Style, [f64; 2], f64, String, Option<String>)> { p.iter().filter_map(|x| if let Piece::Text { s, at, h, text, tag, .. } = x { Some((s.clone(), *at, *h, text.clone(), tag.clone())) } else { None }).collect() }
    fn plines(p: &[Piece]) -> Vec<(Vec<[f64; 3]>, bool)> { p.iter().filter_map(|x| if let Piece::Pline { pts, closed, .. } = x { Some((pts.clone(), *closed)) } else { None }).collect() }

    #[test]
    fn plain_insert() {
        let p = pieces(&drawing(), 0);
        assert_eq!(lines(&p), vec![([-100.0, 0.0], [100.0, 0.0])]);
        let a = arcs(&p);
        assert_eq!(a.len(), 1);
        assert!(near(a[0].0, [0.0, 0.0]) && (a[0].1 - 40.0).abs() < 1e-9 && a[0].2.abs() < 1e-9 && (a[0].3 - PI).abs() < 1e-9);
        let pl = plines(&p);
        assert_eq!(pl.len(), 2);
        assert!(pl[0].1 && pl[0].0.len() == 4, "the box stays one closed polyline");
        assert!((pl[1].0[0][2] - 1.0).abs() < 1e-12, "the bulge is kept");
        assert!(p.iter().any(|x| matches!(x, Piece::Hatch { solid: true, loops, .. } if loops.len() == 1 && loops[0].len() == 4)));
    }

    #[test]
    fn rotated_30() {
        let p = pieces(&drawing(), 1);
        let (s, c) = (PI / 6.0).sin_cos();
        let l = lines(&p)[0];
        assert!(near(l.0, [1000.0 - 100.0 * c, -100.0 * s]) && near(l.1, [1000.0 + 100.0 * c, 100.0 * s]));
        let a = arcs(&p)[0];
        assert!((a.2 - PI / 6.0).abs() < 1e-9 && (a.3 - a.2 - PI).abs() < 1e-9);
        let t = texts(&p).into_iter().find(|t| t.3 == "DB").unwrap();
        assert!(near(t.1, [1000.0 + (-30.0 * c + 40.0 * s), -30.0 * s - 40.0 * c]));
    }

    #[test]
    fn scaled_2() {
        let p = pieces(&drawing(), 2);
        assert!(near(lines(&p)[0].0, [1800.0, 0.0]));
        assert!((circles(&p)[0].2 - 40.0).abs() < 1e-9);
        assert!((arcs(&p)[0].1 - 80.0).abs() < 1e-9);
        assert!((texts(&p).into_iter().find(|t| t.3 == "DB").unwrap().2 - 30.0).abs() < 1e-9, "text height scaled");
    }

    #[test]
    fn non_uniform_2_by_1() {
        let p = pieces(&drawing(), 3);
        assert!(circles(&p).is_empty() && arcs(&p).is_empty(), "no arcs or circles under a non-uniform scale");
        // The ByBlock circle (r 20) is now the ellipse ((x − 3000) / 40)² + (y / 20)² = 1, as a closed polyline.
        let ell = plines(&p).into_iter().find(|(pts, closed)| *closed && pts.iter().all(|q| q[0].abs() > 2900.0 && q[1].abs() <= 20.0 + 1e-9 && (q[0] - 3000.0).abs() <= 40.0 + 1e-9)).unwrap();
        assert!(ell.0.len() >= 64);
        for q in &ell.0 { assert!((((q[0] - 3000.0) / 40.0).powi(2) + (q[1] / 20.0).powi(2) - 1.0).abs() < 1e-9); assert_eq!(q[2], 0.0); }
        // The bulged polyline's half circle comes as points within the chord tolerance: no bulges left.
        assert!(plines(&p).iter().all(|(pts, _)| pts.iter().all(|q| q[2] == 0.0)));
    }

    #[test]
    fn mirrored() {
        let p = pieces(&drawing(), 4);
        // The arc 0 → 180° over the top mirrored in X is still the top half: anticlockwise 0 → 180° about x = 4000.
        let a = arcs(&p)[0];
        assert!(near(a.0, [4000.0, 0.0]) && (a.1 - 40.0).abs() < 1e-9);
        let mid = (a.2 + a.3) / 2.0;
        assert!(mid.sin() > 0.99, "still over the top: {mid}");
        // Bulges turn sign: the half circle still bulges up.
        let bulged = plines(&p).into_iter().find(|(pts, closed)| !*closed && pts.len() == 3).unwrap();
        assert!(near([bulged.0[0][0], bulged.0[0][1]], [4060.0, 10.0]) && (bulged.0[0][2] + 1.0).abs() < 1e-12);
    }

    #[test]
    fn nested_two_deep() {
        // DB-PAIR (base point 50, 0) at 6000: DB-SYM at its 0, 0 and at 300, 0 turned 90°.
        let p = pieces(&drawing(), 6);
        let l = lines(&p);
        assert_eq!(l.len(), 2);
        assert!(l.iter().any(|x| near(x.0, [5850.0, 0.0]) && near(x.1, [6050.0, 0.0])));
        assert!(l.iter().any(|x| near(x.0, [6250.0, -100.0]) && near(x.1, [6250.0, 100.0])));
        assert!(p.iter().all(|x| !matches!(x, Piece::Group { .. })));
    }

    #[test]
    fn minsert_array() {
        let p = pieces(&drawing(), 7);
        let l = lines(&p);
        assert_eq!(l.len(), 6, "2 columns × 3 rows");
        for (c, r) in [(0.0, 0.0), (300.0, 0.0), (0.0, 400.0), (300.0, 400.0)] { assert!(l.iter().any(|x| near(x.0, [6900.0 + c, r])), "{c}, {r}"); }
        assert_eq!(texts(&p).iter().filter(|t| t.4.is_some()).count(), 1, "the attribute once");
    }

    #[test]
    fn layer_0_and_byblock() {
        let d = drawing();
        let p = pieces(&d, 0);
        // Layer 0 children take the insert's layer; their own layers stay (E-SYM), with an explicit colour (red).
        assert!(p.iter().any(|x| matches!(x, Piece::Pline { s, closed: true, .. } if s.layer == "E-LIGHT" && s.color.is_none())));
        assert!(p.iter().any(|x| matches!(x, Piece::Arc { s, .. } if s.layer == "E-SYM" && s.color == Some(0xFF0000))));
        assert!(p.iter().any(|x| matches!(x, Piece::Line { s, .. } if s.layer == "E-SYM" && s.color.is_none())));
        // ByBlock on a ByLayer insert: the insert layer's colour (no colour of its own); on a green insert: green.
        assert_eq!(circles(&p)[0].0, Style { layer: "E-LIGHT".into(), color: None, lt: None });
        assert_eq!(circles(&pieces(&d, 8))[0].0.color, Some(0x00FF00));
    }

    #[test]
    fn attributes() {
        let p = pieces(&drawing(), 1);
        let a: Vec<_> = texts(&p).into_iter().filter(|t| t.4.is_some()).collect();
        assert_eq!(a.len(), 1);
        assert_eq!((a[0].3.as_str(), a[0].4.as_deref()), ("L1-02", Some("CCT")));
        assert!(near(a[0].1, [1000.0, 70.0]), "attributes are where the insert put them");
        assert_eq!(a[0].0.layer, "E-LIGHT");
    }

    #[test]
    fn erased_left_out() {
        let bytes = std::fs::read(format!("{}/../../tests/fixtures/cad/crop-block.dxf", env!("CARGO_MANIFEST_DIR"))).unwrap();
        let mut view = super::super::CadDoc::new(bytes.clone()).unwrap();
        let before: Vec<serde_json::Value> = serde_json::from_str(&view.blocks()).unwrap();
        let h = before[0]["handle"].as_str().unwrap().to_string();
        let on = vec![1u8; 16];
        assert!(!view.pick(0.0, 0.0, 1.0, &on, false).is_empty());
        let gone: serde_json::Value = serde_json::from_str(&view.set_erased(&format!("[\"{h}\"]"))).unwrap();
        assert_eq!(gone["objects"].as_array().unwrap().len(), 1);
        assert!(view.pick(0.0, 0.0, 1.0, &on, false).is_empty(), "an erased block is not picked");
        assert!(view.snap(100.0, 0.0, 5.0, 0xFF, &on).is_empty(), "nor snapped to");
        let saved = super::super::with_additions(bytes, "[]", "[]", &format!("[\"{h}\"]")).unwrap();
        let out = acadrust::DxfWriter::new(&saved).write_to_vec().unwrap();
        let after: Vec<serde_json::Value> = serde_json::from_str(&super::super::CadDoc::new(out).unwrap().blocks()).unwrap();
        assert_eq!(after.len(), before.len() - 1);
        assert!(after.iter().all(|b| b["handle"] != before[0]["handle"]));
    }
}

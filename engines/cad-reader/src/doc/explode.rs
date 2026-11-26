//! Exact explode of model-space objects, for CROP: an object's geometry in world coordinates as lines, arcs, circles
//! and bulged polylines, texts (attributes with their tag), hatch loops, 2D solids, points, and dimensions as groups.
//! Curves stay curves while the transform keeps their shape (insert point, base point, rotation, uniform or mirrored
//! scale); under a non-uniform scale an arc becomes an ellipse, which (like ellipses and splines) comes as a polyline
//! within a small chord tolerance. The same rules as the view: layer 0 and ByBlock children take the insert's layer,
//! colour and linetype; nested blocks and MINSERT arrays are expanded. Each piece has its layer, and its colour and
//! linetype only where they differ from its layer's.
//!
//! The exact mode (the take-over of an opened drawing's objects) keeps more of what an object is: a full ellipse stays
//! an ellipse, a paragraph text its raw string with its box and attachment, a text its alignment, a patterned hatch its
//! pattern lines, and a dimension of a known kind its definition points. Splines and partial ellipses still come as
//! polylines, marked `sampled` so the page can say so.

use super::{rgb_of, spline_points, Affine, PatLine, INK, MAX_DEPTH};
use acadrust::entities::mtext_format::parse_mtext;
use acadrust::entities::mtext::AttachmentPoint;
use acadrust::entities::{BoundaryEdge, Dimension, EntityType, TextHorizontalAlignment as H, TextVerticalAlignment as V};
use acadrust::types::{Color, LineWeight};
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
    /// Lineweight in hundredths of a millimetre, when set on the entity itself (or taken from its insert via ByBlock).
    #[serde(skip_serializing_if = "Option::is_none")] pub lw: Option<i16>,
}

/// One piece of an exploded object (world coordinates, radians). Arcs run anticlockwise a0 → a1 (a1 > a0); polyline
/// vertices are [x, y, bulge].
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum Piece {
    Line { #[serde(flatten)] s: Style, a: [f64; 2], b: [f64; 2] },
    Arc { #[serde(flatten)] s: Style, c: [f64; 2], r: f64, a0: f64, a1: f64 },
    Circle { #[serde(flatten)] s: Style, c: [f64; 2], r: f64 },
    /// `sampled` (exact mode): what curve this polyline stands in for ("spline", "ellipse").
    Pline { #[serde(flatten)] s: Style, pts: Vec<[f64; 3]>, closed: bool, #[serde(skip_serializing_if = "Option::is_none")] sampled: Option<&'static str> },
    /// `just` (exact mode): the app's text justification (L / C / R on the baseline, TL … BR); then `at` is the alignment point.
    Text { #[serde(flatten)] s: Style, at: [f64; 2], h: f64, rot: f64, text: String, #[serde(skip_serializing_if = "Option::is_none")] tag: Option<String>, #[serde(skip_serializing_if = "Option::is_none")] just: Option<&'static str> },
    /// A patterned hatch in exact mode also has its `scale`, `angle`, `origin` and pattern `lines` (as stored, placed).
    Hatch { #[serde(flatten)] s: Style, loops: Vec<Vec<[f64; 3]>>, solid: bool, pattern: String,
        #[serde(skip_serializing_if = "Option::is_none")] scale: Option<f64>, #[serde(skip_serializing_if = "Option::is_none")] angle: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")] origin: Option<[f64; 2]>, #[serde(skip_serializing_if = "Vec::is_empty")] lines: Vec<PatLine> },
    /// A full ellipse (exact mode): centre, major axis from the centre, minor / major.
    Ellipse { #[serde(flatten)] s: Style, c: [f64; 2], axis: [f64; 2], ratio: f64 },
    /// A paragraph text (exact mode): its raw string with codes, box width (0: none), attachment (1–9 as DXF) and line spacing factor.
    MText { #[serde(flatten)] s: Style, at: [f64; 2], h: f64, rot: f64, w: f64, attach: u8, lsp: f64, text: String },
    Solid { #[serde(flatten)] s: Style, pts: Vec<[f64; 2]> },
    Point { #[serde(flatten)] s: Style, at: [f64; 2] },
    /// A dimension: its lines, arrows and text, kept or left out as one.
    Group { #[serde(flatten)] s: Style, items: Vec<Piece>, #[serde(skip_serializing_if = "Option::is_none")] dim: Option<DimInfo> },
}

/// What a dimension is made of (exact mode): its kind, its definition points in the app's order for that kind
/// (aligned / linear: the two measured points and a point on the dimension line; radius / diameter: the centre, a point
/// on the curve and the text's place; angular: the vertex, a point on each line and the arc's place), the dimension
/// line's angle (linear), the text when overridden, and the text height, arrow size and decimals the drawing gives it.
#[derive(Serialize, Clone, Debug)]
pub(crate) struct DimInfo {
    pub kind: &'static str,
    pub pts: Vec<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")] pub dir: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] pub arrow: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] pub decimals: Option<i16>,
}

/// The layer, colour, linetype and lineweight (None = by layer) an entity is drawn with (resolved).
#[derive(Clone)]
struct Ctx { layer: String, rgb: u32, lt: String, lw: Option<i16> }

struct Ex<'a> {
    doc: &'a CadDocument,
    blocks: HashMap<String, (f64, f64)>,
    layers: HashMap<String, (u32, String)>,
    count: usize,
    truncated: bool,
    exact: bool,
    /// Block definition mode: an entity without a parent that is ByBlock gives no colour, linetype or lineweight of its
    /// own, so the app's insert gives it the insert's (a layer-0 child keeps layer 0, as without a parent).
    def_mode: bool,
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
    fn new(doc: &'a CadDocument, exact: bool) -> Self {
        let mut blocks = HashMap::new();
        for rec in doc.block_records.iter() {
            if let Some(EntityType::Block(blk)) = doc.get_entity(rec.block_entity_handle) {
                blocks.insert(rec.name.to_uppercase(), (blk.base_point.x, blk.base_point.y));
            }
        }
        let layers = doc.layers.iter().map(|l| (l.name.clone(), (rgb_of(&l.color).unwrap_or(INK), l.line_type.trim().to_uppercase()))).collect();
        Ex { doc, blocks, layers, count: 0, truncated: false, exact, def_mode: false }
    }

    fn layer_of(&self, name: &str) -> (u32, String) { self.layers.get(name).cloned().unwrap_or((INK, String::new())) }

    fn ctx(&self, layer: &str, color: &Color, linetype: &str, weight: LineWeight, parent: Option<&Ctx>) -> Ctx {
        let layer = match parent { Some(p) if layer == "0" => p.layer.clone(), _ => layer.to_string() };
        let (lrgb, llt) = self.layer_of(&layer);
        let rgb = match color {
            Color::ByLayer => lrgb,
            Color::ByBlock => parent.map_or(if self.def_mode { lrgb } else { INK }, |p| p.rgb),
            Color::None => INK,
            c => rgb_of(c).unwrap_or(INK),
        };
        let named = linetype.trim().to_uppercase();
        let lt = if named == "BYBLOCK" { parent.map_or(llt.clone(), |p| p.lt.clone()) } else if named.is_empty() || named == "BYLAYER" { llt } else { named };
        let lw = match weight { LineWeight::ByBlock => parent.and_then(|p| p.lw), LineWeight::Value(v) if v >= 0 => Some(v), _ => None };
        Ctx { layer, rgb, lt, lw }
    }

    fn style(&self, c: &Ctx) -> Style {
        let (lrgb, llt) = self.layer_of(&c.layer);
        Style { layer: c.layer.clone(), color: (c.rgb != lrgb).then_some(c.rgb), lt: (!c.lt.is_empty() && c.lt != llt).then(|| c.lt.clone()), lw: c.lw }
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
            self.push(out, Piece::Pline { s, pts, closed: false, sampled: None });
        }
    }

    fn circle(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, c: (f64, f64), r: f64) {
        if similar(t) {
            self.push(out, Piece::Circle { s, c: pt(t, c), r: r * det(t).abs().sqrt() });
        } else {
            let n = steps(2.0 * PI, r * stretch(t));
            let pts = (0..n).map(|i| { let a = 2.0 * PI * i as f64 / n as f64; let p = pt(t, (c.0 + r * a.cos(), c.1 + r * a.sin())); [p[0], p[1], 0.0] }).collect();
            self.push(out, Piece::Pline { s, pts, closed: true, sampled: None });
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
        self.push(out, Piece::Pline { s, pts, closed, sampled: None });
    }

    /// A curve as points; in exact mode marked as standing in for `what`.
    fn sampled(&mut self, out: &mut Vec<Piece>, s: Style, t: &Affine, pts: &[(f64, f64)], closed: bool, what: &'static str) {
        if pts.len() < 2 { return; }
        let pts = pts.iter().map(|p| { let q = pt(t, *p); [q[0], q[1], 0.0] }).collect();
        let sampled = self.exact.then_some(what);
        self.push(out, Piece::Pline { s, pts, closed, sampled });
    }

    /// What a dimension of a known kind is made of, in the world; none for the other kinds (ordinate, arc length…) or
    /// when two angular lines are parallel. The text height comes from the dimension's own text, the arrow size and
    /// decimals from its style.
    fn dim_info(&self, d: &Dimension, t: &Affine, items: &[Piece]) -> Option<DimInfo> {
        let p = |v: &acadrust::types::Vector3| pt(t, (v.x, v.y));
        let b = d.base();
        let text_at = |near: [f64; 2], far: [f64; 2]| if b.text_middle_point.x != 0.0 || b.text_middle_point.y != 0.0 { p(&b.text_middle_point) } else { [far[0] + (far[0] - near[0]) * 0.5, far[1] + (far[1] - near[1]) * 0.5] };
        let (kind, pts, dir): (&'static str, Vec<[f64; 2]>, Option<f64>) = match d {
            Dimension::Aligned(x) => ("aligned", vec![p(&x.first_point), p(&x.second_point), p(&x.definition_point)], None),
            Dimension::Linear(x) => ("linear", vec![p(&x.first_point), p(&x.second_point), p(&x.definition_point)], Some(x.rotation + t.angle())),
            Dimension::Radius(x) => { let (c, q) = (p(&x.angle_vertex), p(&x.definition_point)); ("radius", vec![c, q, text_at(c, q)], None) }
            Dimension::Diameter(x) => {
                let (a, q) = (p(&x.angle_vertex), p(&x.definition_point));
                let c = [(a[0] + q[0]) / 2.0, (a[1] + q[1]) / 2.0];
                ("diameter", vec![c, q, text_at(c, q)], None)
            }
            Dimension::Angular3Pt(x) => ("angular", vec![p(&x.angle_vertex), p(&x.first_point), p(&x.second_point), p(&x.definition_point)], None),
            Dimension::Angular2Ln(x) => {
                // Line 1: first → second point; line 2: definition point → vertex point. The vertex is where they meet.
                let (a, b2, c, e) = (p(&x.first_point), p(&x.second_point), p(&x.definition_point), p(&x.angle_vertex));
                let (r, q) = ([b2[0] - a[0], b2[1] - a[1]], [e[0] - c[0], e[1] - c[1]]);
                let den = r[0] * q[1] - r[1] * q[0];
                if den.abs() < 1e-12 * (r[0].hypot(r[1]) * q[0].hypot(q[1])).max(1e-300) { return None; }
                let u = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
                let v = [a[0] + r[0] * u, a[1] + r[1] * u];
                let far = |x: [f64; 2], y: [f64; 2]| if (x[0] - v[0]).hypot(x[1] - v[1]) >= (y[0] - v[0]).hypot(y[1] - v[1]) { x } else { y };
                ("angular", vec![v, far(a, b2), far(c, e), p(&x.dimension_arc)], None)
            }
            _ => return None,
        };
        let own = d.base().text_override().map(|s| s.trim()).filter(|s| !s.is_empty() && *s != "<>").map(|s| s.to_string());
        let height = items.iter().find_map(|i| match i { Piece::Text { h, .. } | Piece::MText { h, .. } => Some(*h), _ => None });
        let style = self.doc.dim_styles.get(&b.style_name);
        let k = style.map_or(1.0, |s| if s.dimscale > 0.0 { s.dimscale } else { 1.0 }) * t.size();
        let height = height.or_else(|| style.filter(|s| s.dimtxt > 0.0).map(|s| s.dimtxt * k));
        Some(DimInfo { kind, pts, dir, text: own, height, arrow: style.filter(|s| s.dimasz > 0.0).map(|s| s.dimasz * k), decimals: style.map(|s| s.dimdec) })
    }

    fn entity(&mut self, out: &mut Vec<Piece>, e: &EntityType, t: &Affine, parent: Option<&Ctx>, depth: u32) {
        let c = e.common();
        if c.invisible || self.truncated { return; }
        let cx = self.ctx(&c.layer, &c.color, &c.linetype, c.line_weight, parent);
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
                if self.exact && full && similar(t) && x.minor_axis_ratio > 0.0 {
                    // A full ellipse stays one: its major axis turned by the transform (a mirror keeps the ellipse as it is).
                    self.push(out, Piece::Ellipse { s, c: pt(t, (x.center.x, x.center.y)), axis: [t.a * mx + t.c * my, t.b * mx + t.d * my], ratio: x.minor_axis_ratio.min(1.0) });
                    return;
                }
                let n = steps(p1 - x.start_parameter, (mx * mx + my * my).sqrt() * stretch(t));
                let at = |p: f64| (x.center.x + mx * p.cos() + nx * p.sin(), x.center.y + my * p.cos() + ny * p.sin());
                let pts: Vec<_> = (0..if full { n } else { n + 1 }).map(|i| at(x.start_parameter + (p1 - x.start_parameter) * i as f64 / n as f64)).collect();
                self.sampled(out, s, t, &pts, full, "ellipse");
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
            EntityType::Spline(x) => { let pts = spline_points(x); self.sampled(out, s, t, &pts, false, "spline"); }
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
                if !loops.is_empty() {
                    let patterned = self.exact && !x.is_solid;
                    // The pattern lines as stored (scale and angle applied), moved with the transform; its origin is where (0, 0) goes.
                    let (ox, oy) = t.apply(0.0, 0.0);
                    let lines = if patterned { x.pattern.lines.iter().map(|pl| {
                        let (b, o) = (t.apply(pl.base_point.x, pl.base_point.y), t.apply(pl.offset.x, pl.offset.y));
                        PatLine { angle: pl.angle + t.angle(), base: [b.0, b.1], offset: [o.0 - ox, o.1 - oy], dashes: pl.dash_lengths.iter().map(|d| d * t.size()).collect() }
                    }).collect() } else { vec![] };
                    self.push(out, Piece::Hatch { s, loops, solid: x.is_solid, pattern: x.pattern.name.clone(), scale: patterned.then(|| x.pattern_scale * t.size()), angle: patterned.then(|| x.pattern_angle + t.angle()), origin: patterned.then_some([ox, oy]), lines });
                }
            }
            EntityType::Text(x) => {
                if x.value.trim().is_empty() { return; }
                let (h, rot) = (x.height * t.size(), x.rotation + t.angle());
                // Exact: a text aligned to a point (centre, right, top, middle…) is anchored there, with the app's justification.
                if let (true, Some(p)) = (self.exact && !matches!(x.horizontal_alignment, H::Fit | H::Aligned), x.alignment_point) {
                    let col = match x.horizontal_alignment { H::Left => 'L', H::Right => 'R', _ => 'C' };
                    let just = match (x.vertical_alignment, x.horizontal_alignment) {
                        (_, H::Middle) => Some("MC"),
                        (V::Baseline, H::Left) => None,
                        (V::Baseline, H::Right) => Some("R"),
                        (V::Baseline, _) => Some("C"),
                        (V::Bottom, _) => Some(match col { 'L' => "BL", 'R' => "BR", _ => "BC" }),
                        (V::Middle, _) => Some(match col { 'L' => "ML", 'R' => "MR", _ => "MC" }),
                        (V::Top, _) => Some(match col { 'L' => "TL", 'R' => "TR", _ => "TC" }),
                    };
                    if let Some(j) = just {
                        self.push(out, Piece::Text { s, at: pt(t, (p.x, p.y)), h, rot, text: x.value.clone(), tag: None, just: Some(j) });
                        return;
                    }
                }
                self.push(out, Piece::Text { s, at: pt(t, (x.insertion_point.x, x.insertion_point.y)), h, rot, text: x.value.clone(), tag: None, just: None });
            }
            EntityType::MText(x) => {
                let text = parse_mtext(&x.value, true).to_plain_text();
                if self.exact {
                    if text.trim().is_empty() { return; }
                    let attach = match x.attachment_point { AttachmentPoint::TopLeft => 1, AttachmentPoint::TopCenter => 2, AttachmentPoint::TopRight => 3, AttachmentPoint::MiddleLeft => 4, AttachmentPoint::MiddleCenter => 5, AttachmentPoint::MiddleRight => 6, AttachmentPoint::BottomLeft => 7, AttachmentPoint::BottomCenter => 8, AttachmentPoint::BottomRight => 9 };
                    let lsp = if x.line_spacing_factor > 0.0 { x.line_spacing_factor } else { 1.0 };
                    self.push(out, Piece::MText { s, at: pt(t, (x.insertion_point.x, x.insertion_point.y)), h: x.height * t.size(), rot: x.rotation + t.angle(), w: x.rectangle_width.max(0.0) * t.size(), attach, lsp, text: x.value.clone() });
                    return;
                }
                for (i, line) in text.lines().enumerate() {
                    if line.trim().is_empty() { continue; }
                    let dy = -(i as f64 + 1.0) * x.height * 1.66 + x.height * 0.66;
                    let (sin, cos) = x.rotation.sin_cos();
                    let at = (x.insertion_point.x - dy * sin, x.insertion_point.y + dy * cos);
                    self.push(out, Piece::Text { s: s.clone(), at: pt(t, at), h: x.height * t.size(), rot: x.rotation + t.angle(), text: line.to_string(), tag: None, just: None });
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
                    let ac = self.ctx(&a.common.layer, &a.common.color, &a.common.linetype, a.common.line_weight, Some(&cx));
                    let s = self.style(&ac);
                    self.push(out, Piece::Text { s, at: pt(t, (a.insertion_point.x, a.insertion_point.y)), h: a.height * t.size(), rot: a.rotation + t.angle(), text: a.value.clone(), tag: Some(a.tag.clone()), just: None });
                }
            }
            EntityType::Dimension(x) => {
                if depth >= MAX_DEPTH { return; }
                let name = x.base().block_name.clone();
                if name.is_empty() { return; }
                let children: Vec<&EntityType> = self.doc.entities_in_block(&name).collect();
                let mut items = vec![];
                for child in children { self.entity(&mut items, child, t, Some(&cx), depth + 1); }
                if !items.is_empty() {
                    let dim = if self.exact { self.dim_info(x, t, &items) } else { None };
                    self.push(out, Piece::Group { s, items, dim });
                }
            }
            _ => {}
        }
    }
}

/// The pieces of the model-space objects with these handles (hex), by handle: a block insert gives what it draws
/// (its own pieces, not itself), any other object itself. A handle not found is left out.
pub(crate) fn explode(doc: &CadDocument, handles: &[String], exact: bool) -> (HashMap<String, Vec<Piece>>, bool) {
    let mut ex = Ex::new(doc, exact);
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

/// An attribute (definition) text's anchor and the app's justification: the alignment point when it is aligned to a
/// point (centre, right, top, middle…), else its insertion point on the baseline.
fn att_place(h: acadrust::entities::HorizontalAlignment, v: acadrust::entities::VerticalAlignment, ins: &acadrust::types::Vector3, align: &acadrust::types::Vector3, t: &Affine) -> ([f64; 2], Option<&'static str>) {
    use acadrust::entities::{HorizontalAlignment as AH, VerticalAlignment as AV};
    if (matches!(h, AH::Left) && matches!(v, AV::Baseline)) || matches!(h, AH::Fit | AH::Aligned) { return (pt(t, (ins.x, ins.y)), None); }
    let col = match h { AH::Left => 'L', AH::Right => 'R', _ => 'C' };
    let just = match (v, h) {
        (_, AH::Middle) => "MC",
        (AV::Baseline, AH::Right) => "R",
        (AV::Baseline, _) => "C",
        (AV::Bottom, _) => match col { 'L' => "BL", 'R' => "BR", _ => "BC" },
        (AV::Middle, _) => match col { 'L' => "ML", 'R' => "MR", _ => "MC" },
        (AV::Top, _) => match col { 'L' => "TL", 'R' => "TR", _ => "TC" },
    };
    (pt(t, (align.x, align.y)), Some(just))
}

/// An attribute definition of a block (ATTDEF), in block coordinates.
#[derive(Serialize, Clone, Debug)]
pub(crate) struct AttDefInfo {
    pub s: Style, pub tag: String, pub prompt: String, pub text: String, pub at: [f64; 2], pub h: f64, pub rot: f64,
    #[serde(skip_serializing_if = "Option::is_none")] pub just: Option<&'static str>,
    pub invisible: bool, pub constant: bool, pub preset: bool, pub verify: bool,
}

/// An attribute of an insert (ATTRIB), in world coordinates.
#[derive(Serialize, Clone, Debug)]
pub(crate) struct AttribInfo {
    pub tag: String, pub value: String, pub at: [f64; 2], pub h: f64, pub rot: f64,
    #[serde(skip_serializing_if = "Option::is_none")] pub just: Option<&'static str>,
    pub invisible: bool,
}

/// A block insert with its definition, for taking the insert over as an app block: where and how it is placed, and what
/// the block holds in block coordinates moved so the block's base point is the origin (exact mode, definition mode).
#[derive(Serialize, Clone, Debug)]
pub(crate) struct BlockInfo {
    pub name: String, pub at: [f64; 2], pub sx: f64, pub sy: f64, pub rot: f64, pub flipped: bool, pub rows: u16, pub cols: u16,
    pub base: [f64; 2], pub s: Style, pub items: Vec<Piece>, pub attdefs: Vec<AttDefInfo>, pub attribs: Vec<AttribInfo>,
}

/// The block inserts of the model-space objects with these handles (hex), by handle; a handle that is no insert, is
/// hidden or whose block is too large is left out.
pub(crate) fn block_inserts(doc: &CadDocument, handles: &[String]) -> HashMap<String, BlockInfo> {
    let mut ex = Ex::new(doc, true);
    let mut found = HashMap::new();
    let wanted: Vec<String> = handles.iter().map(|h| h.trim().to_uppercase()).collect();
    for e in doc.model_space_entities() {
        let EntityType::Insert(x) = e else { continue };
        let h = format!("{:X}", x.common.handle.value());
        if !wanted.contains(&h) || x.common.invisible { continue; }
        let cx = ex.ctx(&x.common.layer, &x.common.color, &x.common.linetype, x.common.line_weight, None);
        let s = ex.style(&cx);
        let base = ex.blocks.get(&x.block_name.to_uppercase()).copied().unwrap_or((0.0, 0.0));
        let t = Affine::translate(-base.0, -base.1);
        ex.count = 0;
        ex.truncated = false;
        ex.def_mode = true;
        let mut items = vec![];
        let mut attdefs = vec![];
        for child in doc.entities_in_block(&x.block_name) {
            if let EntityType::AttributeDefinition(a) = child {
                if a.common.invisible { continue; }
                let c = ex.ctx(&a.common.layer, &a.common.color, &a.common.linetype, a.common.line_weight, None);
                let (at, just) = att_place(a.horizontal_alignment, a.vertical_alignment, &a.insertion_point, &a.alignment_point, &t);
                attdefs.push(AttDefInfo { s: ex.style(&c), tag: a.tag.clone(), prompt: a.prompt.clone(), text: a.default_value.clone(), at, h: a.height, rot: a.rotation, just,
                    invisible: a.flags.invisible, constant: a.flags.constant, preset: a.flags.preset, verify: a.flags.verify });
            } else {
                ex.entity(&mut items, child, &t, None, 1);
            }
        }
        ex.def_mode = false;
        if ex.truncated { continue; }
        let attribs = x.attributes.iter().map(|a| {
            let (at, just) = att_place(a.horizontal_alignment, a.vertical_alignment, &a.insertion_point, &a.alignment_point, &Affine::ID);
            AttribInfo { tag: a.tag.clone(), value: a.value.clone(), at, h: a.height, rot: a.rotation, just, invisible: a.flags.invisible || a.common.invisible }
        }).collect();
        found.insert(h, BlockInfo { name: x.block_name.clone(), at: [x.insert_point.x, x.insert_point.y], sx: x.x_scale(), sy: x.y_scale(), rot: x.rotation,
            flipped: x.normal.z < 0.0, rows: x.row_count.max(1), cols: x.column_count.max(1), base: [base.0, base.1], s, items, attdefs, attribs });
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use acadrust::entities::BoundaryPath;

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
        let (mut m, truncated) = explode(doc, &[h.clone()], false);
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
    fn lineweight_set_on_the_entity_only() {
        let mut doc = CadDocument::new();
        let mut set = acadrust::entities::Line::from_coords(0.0, 0.0, 0.0, 10.0, 0.0, 0.0);
        set.common.line_weight = LineWeight::Value(35);
        let by_layer = acadrust::entities::Line::from_coords(0.0, 5.0, 0.0, 10.0, 5.0, 0.0);
        doc.add_entity(EntityType::Line(set)).unwrap();
        doc.add_entity(EntityType::Line(by_layer)).unwrap();
        let hs: Vec<String> = doc.model_space_entities().map(|e| format!("{:X}", e.common().handle.value())).collect();
        let (m, _) = explode(&doc, &hs, false);
        let lw = |h: &String| match &m[h][0] { Piece::Line { s, .. } => s.lw, _ => panic!("a line") };
        assert_eq!((lw(&hs[0]), lw(&hs[1])), (Some(35), None));
        assert!(serde_json::to_string(&m[&hs[1]][0]).unwrap().find("\"lw\"").is_none(), "ByLayer: no lw in the JSON");
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
        assert_eq!(circles(&p)[0].0, Style { layer: "E-LIGHT".into(), color: None, lt: None, lw: None });
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
        assert!(view.snap(100.0, 0.0, 5.0, 0xFF, &on, f64::NAN, f64::NAN).is_empty(), "nor snapped to");
        let saved = super::super::with_additions(bytes, "[]", "[]", &format!("[\"{h}\"]")).unwrap();
        let out = acadrust::DxfWriter::new(&saved).write_to_vec().unwrap();
        let after: Vec<serde_json::Value> = serde_json::from_str(&super::super::CadDoc::new(out).unwrap().blocks()).unwrap();
        assert_eq!(after.len(), before.len() - 1);
        assert!(after.iter().all(|b| b["handle"] != before[0]["handle"]));
    }

    // ---- exact mode (the take-over)

    fn one(doc: &CadDocument, e: EntityType, exact: bool) -> Vec<Piece> {
        let mut doc = doc.clone();
        let h = doc.add_entity(e).unwrap();
        let hex = format!("{:X}", h.value());
        let (mut m, truncated) = explode(&doc, &[hex.clone()], exact);
        assert!(!truncated);
        m.remove(&hex).unwrap()
    }
    fn json(p: &Piece) -> serde_json::Value { serde_json::to_value(p).unwrap() }
    fn v3(x: f64, y: f64) -> acadrust::types::Vector3 { acadrust::types::Vector3::new(x, y, 0.0) }

    #[test]
    fn ellipse_full_and_partial() {
        use acadrust::entities::Ellipse;
        let doc = CadDocument::new();
        let mut e = Ellipse::from_center_axes(v3(10.0, 5.0), v3(0.0, 4.0), 0.5);
        let p = one(&doc, EntityType::Ellipse(e.clone()), true);
        assert!(matches!(&p[..], [Piece::Ellipse { c, axis, ratio, .. }] if near(*c, [10.0, 5.0]) && near(*axis, [0.0, 4.0]) && (*ratio - 0.5).abs() < 1e-12));
        assert_eq!(json(&p[0])["kind"], "ellipse");
        // Not exact: the polyline it always was, with no flag in the JSON.
        let q = one(&doc, EntityType::Ellipse(e.clone()), false);
        assert!(matches!(&q[..], [Piece::Pline { closed: true, sampled: None, .. }]));
        assert!(json(&q[0]).get("sampled").is_none());
        // A part of one stays a polyline, marked.
        e.start_parameter = 0.0; e.end_parameter = PI;
        let r = one(&doc, EntityType::Ellipse(e), true);
        assert!(matches!(&r[..], [Piece::Pline { closed: false, sampled: Some("ellipse"), .. }]));
        assert_eq!(json(&r[0])["sampled"], "ellipse");
    }

    #[test]
    fn ellipse_in_a_turned_scaled_insert_keeps_its_axis() {
        // The insert's transform turns and scales the ellipse's axis; a non-uniform scale samples it.
        let t = Affine::translate(100.0, 0.0).then(&Affine::rotate(PI / 2.0)).then(&Affine::scale(2.0, 2.0));
        let doc = CadDocument::new();
        let mut ex = Ex::new(&doc, true);
        let mut out = vec![];
        let e = acadrust::entities::Ellipse::from_center_axes(v3(1.0, 0.0), v3(3.0, 0.0), 0.25);
        ex.entity(&mut out, &EntityType::Ellipse(e.clone()), &t, None, 0);
        assert!(matches!(&out[..], [Piece::Ellipse { c, axis, .. }] if near(*c, [100.0, 2.0]) && near(*axis, [0.0, 6.0])), "{out:?}");
        let mut out = vec![];
        ex.entity(&mut out, &EntityType::Ellipse(e), &Affine::scale(2.0, 1.0), None, 0);
        assert!(matches!(&out[..], [Piece::Pline { sampled: Some("ellipse"), closed: true, .. }]));
    }

    #[test]
    fn spline_is_flagged() {
        use acadrust::entities::Spline;
        let doc = CadDocument::new();
        let mut sp = Spline::new();
        sp.degree = 1;
        sp.control_points = vec![v3(0.0, 0.0), v3(5.0, 5.0), v3(10.0, 0.0)];
        sp.knots = vec![0.0, 0.0, 0.5, 1.0, 1.0];
        let p = one(&doc, EntityType::Spline(sp.clone()), true);
        assert!(matches!(&p[..], [Piece::Pline { sampled: Some("spline"), pts, .. }] if pts.len() > 2));
        assert!(matches!(&one(&doc, EntityType::Spline(sp), false)[..], [Piece::Pline { sampled: None, .. }]));
    }

    #[test]
    fn mtext_keeps_box_attachment_and_codes() {
        use acadrust::entities::MText;
        let doc = CadDocument::new();
        let mut m = MText::new();
        m.value = "{\\fArial|b1;Notes}\\PSecond line".into();
        m.insertion_point = v3(10.0, 20.0); m.height = 2.5; m.rotation = 0.5; m.rectangle_width = 60.0;
        m.attachment_point = AttachmentPoint::BottomRight; m.line_spacing_factor = 1.5;
        let p = one(&doc, EntityType::MText(Box::new(m.clone())), true);
        match &p[..] {
            [Piece::MText { at, h, rot, w, attach, lsp, text, .. }] => {
                assert!(near(*at, [10.0, 20.0]) && (*h - 2.5).abs() < 1e-12 && (*rot - 0.5).abs() < 1e-12 && (*w - 60.0).abs() < 1e-12);
                assert_eq!((*attach, *lsp), (9, 1.5));
                assert_eq!(text, &m.value, "the raw string, codes and all");
            }
            _ => panic!("{p:?}"),
        }
        // Not exact: one text per line, as before.
        assert_eq!(texts(&one(&doc, EntityType::MText(Box::new(m)), false)).len(), 2);
    }

    #[test]
    fn text_alignment_anchors_at_the_alignment_point() {
        use acadrust::entities::{Text, TextHorizontalAlignment as H, TextVerticalAlignment as V};
        let doc = CadDocument::new();
        let mk = |h: H, v: V| { let mut t = Text::new(); t.value = "DB-1".into(); t.height = 2.0; t.insertion_point = v3(0.0, 0.0); t.alignment_point = Some(v3(50.0, 30.0)); t.horizontal_alignment = h; t.vertical_alignment = v; EntityType::Text(t) };
        let got = |h: H, v: V| match &one(&doc, mk(h, v), true)[..] { [Piece::Text { at, just, .. }] => (*at, *just), p => panic!("{p:?}") };
        assert_eq!(got(H::Center, V::Baseline), ([50.0, 30.0], Some("C")));
        assert_eq!(got(H::Right, V::Baseline).1, Some("R"));
        assert_eq!(got(H::Left, V::Top).1, Some("TL"));
        assert_eq!(got(H::Center, V::Middle).1, Some("MC"));
        assert_eq!(got(H::Right, V::Bottom).1, Some("BR"));
        assert_eq!(got(H::Middle, V::Baseline).1, Some("MC"));
        // Left on the baseline: at the insertion point, no justification; and not exact: as before.
        assert_eq!(got(H::Left, V::Baseline), ([0.0, 0.0], None));
        assert!(matches!(&one(&doc, mk(H::Center, V::Baseline), false)[..], [Piece::Text { at, just: None, .. }] if near(*at, [0.0, 0.0])));
        assert!(json(&one(&doc, mk(H::Center, V::Baseline), false)[0]).get("just").is_none());
    }

    fn square(x: f64) -> BoundaryPath {
        let mut path = BoundaryPath::external();
        path.add_edge(BoundaryEdge::Polyline(acadrust::entities::PolylineEdge::new(vec![acadrust::types::Vector2::new(x, 0.0), acadrust::types::Vector2::new(x + 10.0, 0.0), acadrust::types::Vector2::new(x + 10.0, 10.0), acadrust::types::Vector2::new(x, 10.0)], true)));
        path
    }

    #[test]
    fn patterned_hatch_keeps_its_lines() {
        use acadrust::entities::{Hatch, HatchPattern, HatchPatternLine};
        let doc = CadDocument::new();
        let mut pat = HatchPattern::new("ANSI31");
        pat.add_line(HatchPatternLine { angle: PI / 4.0, base_point: acadrust::types::Vector2::new(0.0, 0.0), offset: acadrust::types::Vector2::new(-1.5, 1.5), dash_lengths: vec![] });
        let mut h = Hatch::with_pattern(pat);
        h.pattern_scale = 1.5; h.pattern_angle = 0.0;
        h.paths.push(square(0.0));
        let p = one(&doc, EntityType::Hatch(Box::new(h.clone())), true);
        match &p[..] {
            [Piece::Hatch { solid: false, pattern, scale, angle, origin, lines, loops, .. }] => {
                assert_eq!(pattern, "ANSI31");
                assert_eq!((*scale, *angle, *origin), (Some(1.5), Some(0.0), Some([0.0, 0.0])));
                assert_eq!(loops.len(), 1);
                assert_eq!(lines.len(), 1);
                assert!((lines[0].angle - PI / 4.0).abs() < 1e-12 && near(lines[0].offset, [-1.5, 1.5]) && lines[0].dashes.is_empty());
            }
            _ => panic!("{p:?}"),
        }
        let j = json(&p[0]);
        assert_eq!(j["lines"][0]["angle"].as_f64().unwrap(), PI / 4.0);
        // Not exact, or solid: none of it.
        let q = json(&one(&doc, EntityType::Hatch(Box::new(h)), false)[0]);
        assert!(q.get("lines").is_none() && q.get("scale").is_none() && q.get("origin").is_none());
        let mut solid = Hatch::solid();
        solid.paths.push(square(0.0));
        let s = json(&one(&doc, EntityType::Hatch(Box::new(solid)), true)[0]);
        assert!(s.get("lines").is_none() && s["solid"] == true);
    }

    /// A dimension block "*D1" with a line and a text 3 high, and the dimension using it.
    fn dim_doc(mut dim: acadrust::entities::Dimension) -> (CadDocument, EntityType) {
        use acadrust::entities::{Block, Line, Text};
        use acadrust::tables::BlockRecord;
        let mut doc = CadDocument::new();
        let mut rec = BlockRecord::new("*D1");
        rec.handle = doc.allocate_handle();
        rec.block_entity_handle = doc.allocate_handle();
        rec.block_end_handle = doc.allocate_handle();
        let owner = rec.handle;
        let mut b = Block::new("*D1", v3(0.0, 0.0));
        b.common.handle = rec.block_entity_handle;
        b.common.owner_handle = owner;
        doc.block_records.add(rec).unwrap();
        doc.add_entity(EntityType::Block(b)).unwrap();
        let mut l = Line::from_coords(0.0, 0.0, 0.0, 10.0, 0.0, 0.0);
        l.common.owner_handle = owner;
        doc.add_entity(EntityType::Line(l)).unwrap();
        let mut t = Text::new();
        t.value = "7.5".into(); t.height = 3.0; t.common.owner_handle = owner;
        doc.add_entity(EntityType::Text(t)).unwrap();
        dim.base_mut().block_name = "*D1".into();
        (doc, EntityType::Dimension(Box::new(dim)))
    }
    fn dim_of(p: &[Piece]) -> DimInfo { match p { [Piece::Group { dim: Some(d), items, .. }] => { assert_eq!(items.len(), 2, "the pieces stay"); d.clone() } _ => panic!("{p:?}") } }

    #[test]
    fn aligned_and_linear_dimensions() {
        use acadrust::entities::{Dimension, DimensionAligned, DimensionLinear};
        let mut a = DimensionAligned::new(v3(0.0, 0.0), v3(10.0, 0.0));
        a.definition_point = v3(10.0, 4.0);
        a.base.set_text_override(Some("<> mm".into()));
        let (doc, e) = dim_doc(Dimension::Aligned(a));
        let d = dim_of(&one(&doc, e.clone(), true));
        assert_eq!(d.kind, "aligned");
        assert!(d.pts.len() == 3 && near(d.pts[0], [0.0, 0.0]) && near(d.pts[1], [10.0, 0.0]) && near(d.pts[2], [10.0, 4.0]));
        assert_eq!((d.dir, d.text.as_deref(), d.height), (None, Some("<> mm"), Some(3.0)));
        assert!(d.decimals.is_some(), "from the style");
        // Not exact: the pieces alone.
        assert!(matches!(&one(&doc, e, false)[..], [Piece::Group { dim: None, .. }]));
        let mut l = DimensionLinear::rotated(v3(0.0, 0.0), v3(10.0, 6.0), PI / 2.0);
        l.definition_point = v3(12.0, 3.0);
        let (doc, e) = dim_doc(Dimension::Linear(l));
        let d = dim_of(&one(&doc, e, true));
        assert_eq!((d.kind, d.text), ("linear", None));
        assert!((d.dir.unwrap() - PI / 2.0).abs() < 1e-12 && d.pts.len() == 3);
    }

    #[test]
    fn radius_and_diameter_dimensions() {
        use acadrust::entities::{Dimension, DimensionDiameter, DimensionRadius};
        let mut r = DimensionRadius::new(v3(5.0, 5.0), v3(15.0, 5.0));
        r.base.text_middle_point = v3(18.0, 5.0);
        let (doc, e) = dim_doc(Dimension::Radius(r));
        let d = dim_of(&one(&doc, e, true));
        assert_eq!(d.kind, "radius");
        assert!(near(d.pts[0], [5.0, 5.0]) && near(d.pts[1], [15.0, 5.0]) && near(d.pts[2], [18.0, 5.0]));
        let mut g = DimensionDiameter::new(v3(0.0, 0.0), v3(20.0, 0.0));
        g.base.set_text_override(Some("Ø20".into()));
        let (doc, e) = dim_doc(Dimension::Diameter(g));
        let d = dim_of(&one(&doc, e, true));
        assert_eq!((d.kind, d.text.as_deref()), ("diameter", Some("Ø20")));
        assert!(near(d.pts[0], [10.0, 0.0]), "the centre is the middle of the chord");
        assert!(near(d.pts[1], [20.0, 0.0]));
        assert_eq!(d.pts.len(), 3);
    }

    #[test]
    fn angular_dimensions() {
        use acadrust::entities::{Dimension, DimensionAngular2Ln, DimensionAngular3Pt};
        // Two lines meeting at (10, 10): along +X from (20, 10) and along +Y from (10, 20).
        let mut a = DimensionAngular2Ln::default();
        a.first_point = v3(14.0, 10.0); a.second_point = v3(20.0, 10.0);
        a.definition_point = v3(10.0, 14.0); a.angle_vertex = v3(10.0, 20.0);
        a.dimension_arc = v3(15.0, 15.0);
        let (doc, e) = dim_doc(Dimension::Angular2Ln(a));
        let d = dim_of(&one(&doc, e, true));
        assert_eq!(d.kind, "angular");
        assert!(d.pts.len() == 4 && near(d.pts[0], [10.0, 10.0]) && near(d.pts[1], [20.0, 10.0]) && near(d.pts[2], [10.0, 20.0]) && near(d.pts[3], [15.0, 15.0]), "{:?}", d.pts);
        let mut b = DimensionAngular3Pt::new(v3(0.0, 0.0), v3(8.0, 0.0), v3(0.0, 8.0));
        b.definition_point = v3(5.0, 5.0);
        let (doc, e) = dim_doc(Dimension::Angular3Pt(b));
        let d = dim_of(&one(&doc, e, true));
        assert!(near(d.pts[0], [0.0, 0.0]) && near(d.pts[1], [8.0, 0.0]) && near(d.pts[2], [0.0, 8.0]) && near(d.pts[3], [5.0, 5.0]));
        // Parallel lines have no vertex: the pieces stay.
        let mut p = DimensionAngular2Ln::default();
        p.first_point = v3(0.0, 0.0); p.second_point = v3(10.0, 0.0); p.definition_point = v3(0.0, 5.0); p.angle_vertex = v3(10.0, 5.0);
        let (doc, e) = dim_doc(Dimension::Angular2Ln(p));
        assert!(matches!(&one(&doc, e, true)[..], [Piece::Group { dim: None, .. }]));
    }

    #[test]
    fn other_dimension_kinds_keep_their_pieces() {
        use acadrust::entities::{Dimension, DimensionOrdinate};
        let (doc, e) = dim_doc(Dimension::Ordinate(DimensionOrdinate::new(v3(5.0, 5.0), v3(5.0, 9.0), true)));
        assert!(matches!(&one(&doc, e, true)[..], [Piece::Group { dim: None, items, .. }] if items.len() == 2));
    }

    fn info_of(doc: &CadDocument, k: usize) -> BlockInfo {
        let h = doc.model_space_entities().find_map(|e| match e {
            EntityType::Insert(x) if (x.insert_point.x - 1000.0 * k as f64).abs() < 1e-9 => Some(format!("{:X}", x.common.handle.value())),
            _ => None,
        }).unwrap();
        block_inserts(doc, &[h.clone()]).remove(&h).unwrap()
    }

    #[test]
    fn block_insert_info() {
        let doc = drawing();
        let a = info_of(&doc, 0);
        assert_eq!((a.name.as_str(), a.rows, a.cols, a.flipped), ("DB-SYM", 1, 1, false));
        assert!(near(a.at, [0.0, 0.0]) && near(a.base, [0.0, 0.0]) && (a.sx - 1.0).abs() < 1e-12 && (a.sy - 1.0).abs() < 1e-12);
        assert_eq!(a.s, Style { layer: "E-LIGHT".into(), color: None, lt: None, lw: None });
        assert!(a.attdefs.is_empty() && a.attribs.len() == 1 && a.attribs[0].tag == "CCT" && a.attribs[0].value == "L1-01");
        assert!(near(a.attribs[0].at, [0.0, 70.0]));
        // The items are the block's own, in block coordinates, with layer 0 kept and a ByBlock colour left to the insert.
        assert_eq!(lines(&a.items).len(), 1);
        let c = circles(&a.items);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].0, Style { layer: "0".into(), color: None, lt: None, lw: None });
        assert!(a.items.iter().any(|p| matches!(p, Piece::Hatch { s, .. } if s.layer == "0")));
        // Placement is the insert's alone: the same items however the insert is turned, scaled or filled.
        let (r, sc, g) = (info_of(&doc, 1), info_of(&doc, 2), info_of(&doc, 8));
        assert!((r.rot - PI / 6.0).abs() < 1e-9 && (sc.sx - 2.0).abs() < 1e-9);
        assert_eq!(serde_json::to_string(&r.items).unwrap(), serde_json::to_string(&a.items).unwrap());
        assert_eq!(serde_json::to_string(&sc.items).unwrap(), serde_json::to_string(&a.items).unwrap());
        assert_eq!(g.s.color, Some(0x00FF00));
        assert_eq!(serde_json::to_string(&g.items).unwrap(), serde_json::to_string(&a.items).unwrap());
        assert!((info_of(&doc, 3).sy - 1.0).abs() < 1e-12 && (info_of(&doc, 3).sx - 2.0).abs() < 1e-12);
        assert!((info_of(&doc, 4).sx + 1.0).abs() < 1e-12);
        let m = info_of(&doc, 7);
        assert_eq!((m.rows * m.cols, m.rows.max(m.cols)), (6, 3));
    }

    #[test]
    fn block_insert_base_point_and_attdefs() {
        use acadrust::entities::{AttributeDefinition, AttributeEntity, Block, Insert};
        use acadrust::tables::BlockRecord;
        let mut doc = CadDocument::new();
        let mut rec = BlockRecord::new("TAGGED");
        rec.handle = doc.allocate_handle();
        rec.block_entity_handle = doc.allocate_handle();
        rec.block_end_handle = doc.allocate_handle();
        rec.base_point = v3(10.0, 5.0);
        let owner = rec.handle;
        let mut b = Block::new("TAGGED", v3(10.0, 5.0));
        b.common.handle = rec.block_entity_handle;
        b.common.owner_handle = owner;
        doc.block_records.add(rec).unwrap();
        doc.add_entity(EntityType::Block(b)).unwrap();
        let mut l = acadrust::entities::Line::from_coords(10.0, 5.0, 0.0, 30.0, 5.0, 0.0);
        l.common.owner_handle = owner;
        doc.add_entity(EntityType::Line(l)).unwrap();
        let mut d = AttributeDefinition::new("NO".into(), "Number?".into(), "1".into());
        d.insertion_point = v3(12.0, 8.0);
        d.alignment_point = v3(12.0, 8.0);
        d.height = 2.5;
        d.flags.invisible = true;
        d.common.owner_handle = owner;
        doc.add_entity(EntityType::AttributeDefinition(d)).unwrap();
        let mut ins = Insert::new("TAGGED", v3(100.0, 50.0));
        let mut a = AttributeEntity::new("NO".into(), "7".into());
        a.insertion_point = v3(102.0, 53.0);
        a.alignment_point = a.insertion_point;
        a.height = 2.5;
        ins.attributes.push(a);
        doc.add_entity(EntityType::Insert(ins)).unwrap();
        let h = format!("{:X}", doc.model_space_entities().next().unwrap().common().handle.value());
        let info = block_inserts(&doc, &[h.clone(), "FFFF".into()]).remove(&h).unwrap();
        assert!(near(info.base, [10.0, 5.0]) && near(info.at, [100.0, 50.0]));
        assert_eq!(lines(&info.items), vec![([0.0, 0.0], [20.0, 0.0])], "the base point is the origin");
        assert_eq!(info.attdefs.len(), 1);
        let d = &info.attdefs[0];
        assert_eq!((d.tag.as_str(), d.prompt.as_str(), d.text.as_str(), d.invisible, d.constant), ("NO", "Number?", "1", true, false));
        assert!(near(d.at, [2.0, 3.0]) && (d.h - 2.5).abs() < 1e-12);
        assert_eq!(info.attribs.len(), 1);
        assert!(near(info.attribs[0].at, [102.0, 53.0]) && info.attribs[0].value == "7");
        assert!(block_inserts(&doc, &["FFFF".into()]).is_empty(), "an unknown handle is left out");
    }
}

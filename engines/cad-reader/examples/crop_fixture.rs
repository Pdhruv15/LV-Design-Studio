//! Writes tests/fixtures/cad/crop-block.dxf, the drawing the CROP tests cut: a DB-style symbol block "DB-SYM" (on
//! layer 0: a box polyline, a bulged polyline, a ByBlock circle, a text and a solid hatch; on E-SYM: a red arc and a
//! line) inserted on E-LIGHT with a CCT attribute, at x = 0, 1000, 2000…:
//!   0 plain · 1000 rotated 30° · 2000 scaled 2× · 3000 non-uniform 2 × 1 · 4000 mirrored (X −1) ·
//!   5000 rotated 30° + scaled 1.5× · 6000 nested 2 deep ("DB-PAIR", base point 50, 0) · 7000 MINSERT 2 × 3 ·
//!   8000 plain, insert colour green (ByBlock children take it).
//! Run: cargo run --example crop_fixture
use acadrust::entities::{Arc, AttributeEntity, Block, BoundaryEdge, BoundaryPath, Circle, EntityType, Hatch, Insert, Line, LwPolyline, PolylineEdge, Text};
use acadrust::tables::{BlockRecord, Layer};
use acadrust::types::{Color, Vector2, Vector3};
use acadrust::{CadDocument, DxfWriter};
use std::f64::consts::PI;

fn block(doc: &mut CadDocument, name: &str, base: (f64, f64)) -> acadrust::types::Handle {
    let mut rec = BlockRecord::new(name);
    rec.handle = doc.allocate_handle();
    rec.base_point = Vector3::new(base.0, base.1, 0.0);
    let owner = rec.handle;
    let mut b = Block::new(name, Vector3::new(base.0, base.1, 0.0));
    b.common.handle = doc.allocate_handle();
    b.common.owner_handle = owner;
    rec.block_entity_handle = b.common.handle;
    rec.block_end_handle = doc.allocate_handle();
    doc.block_records.add(rec).unwrap();
    doc.add_entity(EntityType::Block(b)).unwrap();
    owner
}

fn add(doc: &mut CadDocument, owner: acadrust::types::Handle, mut e: EntityType, layer: &str) {
    e.common_mut().owner_handle = owner;
    e.common_mut().layer = layer.into();
    doc.add_entity(e).unwrap();
}

fn main() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
    let mut doc = CadDocument::new();
    for (name, color) in [("E-LIGHT", 2u8), ("E-SYM", 4)] {
        let mut l = Layer::new(name);
        l.color = Color::Index(color);
        doc.layers.add(l).unwrap();
    }
    let sym = block(&mut doc, "DB-SYM", (0.0, 0.0));
    let mut bx = LwPolyline::new();
    for (x, y) in [(-100.0, -50.0), (100.0, -50.0), (100.0, 50.0), (-100.0, 50.0)] { bx.add_point(Vector2::new(x, y)); }
    bx.is_closed = true;
    add(&mut doc, sym, EntityType::LwPolyline(bx), "0");
    let mut bulged = LwPolyline::new();
    bulged.add_point_with_bulge(Vector2::new(-60.0, 10.0), 1.0); // a half circle over the top, then a straight run
    bulged.add_point(Vector2::new(60.0, 10.0));
    bulged.add_point(Vector2::new(60.0, -20.0));
    add(&mut doc, sym, EntityType::LwPolyline(bulged), "0");
    let mut arc = Arc::from_coords(0.0, 0.0, 0.0, 40.0, 0.0, PI);
    arc.common.color = Color::Index(1);
    add(&mut doc, sym, EntityType::Arc(arc), "E-SYM");
    add(&mut doc, sym, EntityType::Line(Line::from_coords(-100.0, 0.0, 0.0, 100.0, 0.0, 0.0)), "E-SYM");
    let mut circle = Circle::from_coords(0.0, 0.0, 0.0, 20.0);
    circle.common.color = Color::ByBlock;
    add(&mut doc, sym, EntityType::Circle(circle), "0");
    let mut text = Text::new();
    text.value = "DB".into();
    text.insertion_point = Vector3::new(-30.0, -40.0, 0.0);
    text.height = 15.0;
    add(&mut doc, sym, EntityType::Text(text), "0");
    let mut hatch = Hatch::solid();
    let mut path = BoundaryPath::new();
    path.add_edge(BoundaryEdge::Polyline(PolylineEdge::new(vec![Vector2::new(-90.0, -40.0), Vector2::new(-70.0, -40.0), Vector2::new(-70.0, -20.0), Vector2::new(-90.0, -20.0)], true)));
    hatch.add_path(path);
    add(&mut doc, sym, EntityType::Hatch(Box::new(hatch)), "0");

    let pair = block(&mut doc, "DB-PAIR", (50.0, 0.0));
    add(&mut doc, pair, EntityType::Insert(Insert::new("DB-SYM", Vector3::new(0.0, 0.0, 0.0))), "0");
    add(&mut doc, pair, EntityType::Insert(Insert::new("DB-SYM", Vector3::new(300.0, 0.0, 0.0)).with_rotation(PI / 2.0)), "0");

    let model = doc.block_records.get("*Model_Space").unwrap().handle;
    let place = |doc: &mut CadDocument, mut ins: Insert, n: usize, color: Option<Color>| {
        let mut a = AttributeEntity::new("CCT".into(), format!("L1-{:02}", n + 1));
        a.insertion_point = Vector3::new(ins.insert_point.x, ins.insert_point.y + 70.0, 0.0);
        a.alignment_point = a.insertion_point;
        a.height = 12.0;
        a.common.layer = "E-LIGHT".into();
        ins.attributes.push(a);
        if let Some(c) = color { ins.common.color = c; }
        add(doc, model, EntityType::Insert(ins), "E-LIGHT");
    };
    let at = |k: usize| Vector3::new(1000.0 * k as f64, 0.0, 0.0);
    place(&mut doc, Insert::new("DB-SYM", at(0)), 0, None);
    place(&mut doc, Insert::new("DB-SYM", at(1)).with_rotation(PI / 6.0), 1, None);
    place(&mut doc, Insert::new("DB-SYM", at(2)).with_uniform_scale(2.0), 2, None);
    place(&mut doc, Insert::new("DB-SYM", at(3)).with_scale(2.0, 1.0, 1.0), 3, None);
    place(&mut doc, Insert::new("DB-SYM", at(4)).with_scale(-1.0, 1.0, 1.0), 4, None);
    place(&mut doc, Insert::new("DB-SYM", at(5)).with_rotation(PI / 6.0).with_uniform_scale(1.5), 5, None);
    place(&mut doc, Insert::new("DB-PAIR", at(6)), 6, None);
    place(&mut doc, Insert::new("DB-SYM", at(7)).with_array(2, 3, 300.0, 200.0), 7, None);
    place(&mut doc, Insert::new("DB-SYM", at(8)), 8, Some(Color::Index(3)));

    let out = format!("{root}/tests/fixtures/cad");
    std::fs::create_dir_all(&out).unwrap();
    DxfWriter::new(&doc).write_to_file(format!("{out}/crop-block.dxf")).unwrap();
}

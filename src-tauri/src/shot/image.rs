//! Imagens do preview de capturas: DIB da área de transferência ↔ RGBA ↔ PNG, miniatura e
//! leitura de arquivos (PNG/JPG/BMP) pelo WIC do próprio Windows.

/// Imagem em memória: RGBA 8 bits, linhas de cima para baixo.
#[derive(Clone, Debug, PartialEq)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// Maior imagem aceita (16k × 16k): protege contra DIB/arquivo malformado.
pub const MAX_SIDE: u32 = 16_384;

fn u16le(b: &[u8], i: usize) -> Option<u32> {
    Some(u16::from_le_bytes(b.get(i..i + 2)?.try_into().ok()?) as u32)
}
fn u32le(b: &[u8], i: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(i..i + 4)?.try_into().ok()?))
}

/// Converte um DIB (CF_DIB / CF_DIBV5: cabeçalho + pixels) em RGBA.
/// Suporta 24 e 32 bits (BI_RGB e BI_BITFIELDS), de baixo para cima ou de cima para baixo.
/// A transparência é ignorada (prints são opacos; muitos apps deixam o alfa zerado).
pub fn dib_to_rgba(dib: &[u8]) -> Option<Rgba> {
    let header = u32le(dib, 0)? as usize;
    if header < 40 || header > dib.len() {
        return None;
    }
    let width = i32::from_le_bytes(dib.get(4..8)?.try_into().ok()?);
    let raw_h = i32::from_le_bytes(dib.get(8..12)?.try_into().ok()?);
    let bits = u16le(dib, 14)?;
    let compression = u32le(dib, 16)?;
    let top_down = raw_h < 0;
    let height = raw_h.unsigned_abs();
    if width <= 0 || height == 0 || width as u32 > MAX_SIDE || height > MAX_SIDE {
        return None;
    }
    let width = width as u32;
    // Máscaras de cor: no próprio cabeçalho (V4/V5) ou logo depois do cabeçalho de 40 bytes.
    let (mut masks, mut offset) = ([0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff], header);
    match (compression, bits) {
        (0, 24) | (0, 32) => {}
        (3, 32) => {
            let at = if header >= 52 { 40 } else { header };
            masks = [u32le(dib, at)?, u32le(dib, at + 4)?, u32le(dib, at + 8)?];
            if header < 52 {
                offset += 12;
            }
        }
        _ => return None,
    }
    let shift = |m: u32| if m == 0 { 0 } else { m.trailing_zeros() };
    let bpp = (bits / 8) as usize;
    let stride = (width as usize * bpp).div_ceil(4) * 4;
    let data = dib.get(offset..offset + stride * height as usize)?;
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    for y in 0..height as usize {
        let src_row = if top_down { y } else { height as usize - 1 - y };
        let row = &data[src_row * stride..src_row * stride + width as usize * bpp];
        let out = &mut pixels[y * width as usize * 4..(y + 1) * width as usize * 4];
        for x in 0..width as usize {
            let (r, g, b) = if bpp == 4 {
                let v = u32::from_le_bytes(row[x * 4..x * 4 + 4].try_into().unwrap());
                (((v & masks[0]) >> shift(masks[0])) as u8, ((v & masks[1]) >> shift(masks[1])) as u8, ((v & masks[2]) >> shift(masks[2])) as u8)
            } else {
                (row[x * 3 + 2], row[x * 3 + 1], row[x * 3])
            };
            out[x * 4..x * 4 + 4].copy_from_slice(&[r, g, b, 255]);
        }
    }
    Some(Rgba { width, height, pixels })
}

/// RGBA → DIB de 32 bits (BITMAPINFOHEADER + pixels de baixo para cima), para CF_DIB.
pub fn rgba_to_dib(img: &Rgba) -> Vec<u8> {
    let (w, h) = (img.width as usize, img.height as usize);
    let mut out = Vec::with_capacity(40 + w * h * 4);
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(w as i32).to_le_bytes());
    out.extend_from_slice(&(h as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    out.extend_from_slice(&((w * h * 4) as u32).to_le_bytes());
    out.extend_from_slice(&[0u8; 16]); // resolução e paleta
    for y in (0..h).rev() {
        for px in img.pixels[y * w * 4..(y + 1) * w * 4].as_chunks::<4>().0 {
            out.extend_from_slice(&[px[2], px[1], px[0], 255]);
        }
    }
    out
}

pub fn encode_png(img: &Rgba) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, img.width, img.height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().map_err(|e| e.to_string())?;
        w.write_image_data(&img.pixels).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

/// Reduz para caber em `max` × `max` (média de blocos: boa para texto de print).
pub fn thumbnail(img: &Rgba, max: u32) -> Rgba {
    let scale = (img.width.max(img.height) as f64 / max as f64).max(1.0);
    if scale <= 1.0 {
        return img.clone();
    }
    let w = ((img.width as f64 / scale).round() as u32).max(1);
    let h = ((img.height as f64 / scale).round() as u32).max(1);
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        let y0 = (y as f64 * scale) as u32;
        let y1 = (((y + 1) as f64 * scale) as u32).clamp(y0 + 1, img.height);
        for x in 0..w {
            let x0 = (x as f64 * scale) as u32;
            let x1 = (((x + 1) as f64 * scale) as u32).clamp(x0 + 1, img.width);
            let mut acc = [0u64; 4];
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = ((sy * img.width + sx) * 4) as usize;
                    for (a, &p) in acc.iter_mut().zip(&img.pixels[i..i + 4]) {
                        *a += p as u64;
                    }
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as u64;
            let o = ((y * w + x) * 4) as usize;
            for c in 0..4 {
                pixels[o + c] = (acc[c] / n) as u8;
            }
        }
    }
    Rgba { width: w, height: h, pixels }
}

pub fn png_data_url(img: &Rgba) -> Result<String, String> {
    Ok(format!("data:image/png;base64,{}", crate::orb::base64(&encode_png(img)?)))
}

/// Lê um arquivo de imagem (PNG, JPG, BMP, GIF...) pelo WIC do Windows.
pub fn decode_file(path: &std::path::Path) -> Result<Rgba, String> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::GENERIC_READ;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    let err = |e: windows::core::Error| trf!("não foi possível ler a imagem: {e}", "couldn't read the image: {e}");
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let factory: IWICImagingFactory = CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        let decoder = factory
            .CreateDecoderFromFilename(&HSTRING::from(path.as_os_str()), None, GENERIC_READ, WICDecodeMetadataCacheOnDemand)
            .map_err(err)?;
        let frame = decoder.GetFrame(0).map_err(err)?;
        let conv = factory.CreateFormatConverter().map_err(err)?;
        conv.Initialize(&frame, &GUID_WICPixelFormat32bppRGBA, WICBitmapDitherTypeNone, None, 0.0, WICBitmapPaletteTypeCustom)
            .map_err(err)?;
        let (mut w, mut h) = (0u32, 0u32);
        conv.GetSize(&mut w, &mut h).map_err(err)?;
        if w == 0 || h == 0 || w > MAX_SIDE || h > MAX_SIDE {
            return Err(tr!("imagem vazia ou grande demais", "empty or too large image").into());
        }
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        conv.CopyPixels(std::ptr::null(), w * 4, &mut pixels).map_err(err)?;
        for px in pixels.as_chunks_mut::<4>().0 {
            px[3] = 255;
        }
        Ok(Rgba { width: w, height: h, pixels })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// DIB sintético 3×2: cores distintas por pixel.
    fn dib(bits: u16, top_down: bool, bitfields: bool) -> Vec<u8> {
        let (w, h) = (3usize, 2usize);
        let colors = [[255u8, 0, 0], [0, 255, 0], [0, 0, 255], [10, 20, 30], [40, 50, 60], [70, 80, 90]];
        let bpp = (bits / 8) as usize;
        let stride = (w * bpp).div_ceil(4) * 4;
        let mut v = Vec::new();
        v.extend_from_slice(&40u32.to_le_bytes());
        v.extend_from_slice(&(w as i32).to_le_bytes());
        v.extend_from_slice(&(if top_down { -(h as i32) } else { h as i32 }).to_le_bytes());
        v.extend_from_slice(&1u16.to_le_bytes());
        v.extend_from_slice(&bits.to_le_bytes());
        v.extend_from_slice(&(if bitfields { 3u32 } else { 0 }).to_le_bytes());
        v.extend_from_slice(&[0u8; 20]);
        if bitfields {
            for m in [0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff] {
                v.extend_from_slice(&m.to_le_bytes());
            }
        }
        for row in 0..h {
            let y = if top_down { row } else { h - 1 - row };
            let mut line = Vec::new();
            for x in 0..w {
                let [r, g, b] = colors[y * w + x];
                line.extend_from_slice(&[b, g, r]);
                if bpp == 4 {
                    line.push(0);
                }
            }
            line.resize(stride, 0);
            v.extend_from_slice(&line);
        }
        v
    }

    fn expected() -> Vec<u8> {
        [[255u8, 0, 0], [0, 255, 0], [0, 0, 255], [10, 20, 30], [40, 50, 60], [70, 80, 90]].iter().flat_map(|c| [c[0], c[1], c[2], 255]).collect()
    }

    #[test]
    fn dib_24_e_32_bits_nas_duas_orientacoes_e_com_mascaras() {
        for (bits, top, bf) in [(24, false, false), (24, true, false), (32, false, false), (32, true, false), (32, false, true)] {
            let img = dib_to_rgba(&dib(bits, top, bf)).unwrap_or_else(|| panic!("{bits} {top} {bf}"));
            assert_eq!((img.width, img.height), (3, 2));
            assert_eq!(img.pixels, expected(), "{bits} bits, top_down={top}, bitfields={bf}");
        }
    }

    #[test]
    fn dib_malformado_ou_nao_suportado_e_none() {
        assert_eq!(dib_to_rgba(&[]), None);
        assert_eq!(dib_to_rgba(&dib(24, false, false)[..50]), None);
        let mut d = dib(24, false, false);
        d[14] = 8; // 8 bits (paleta): não suportado
        assert_eq!(dib_to_rgba(&d), None);
        let mut d = dib(24, false, false);
        d[4..8].copy_from_slice(&100_000i32.to_le_bytes());
        assert_eq!(dib_to_rgba(&d), None);
    }

    #[test]
    fn ida_e_volta_dib_e_png() {
        let img = dib_to_rgba(&dib(24, false, false)).unwrap();
        assert_eq!(dib_to_rgba(&rgba_to_dib(&img)).unwrap(), img);
        let png = encode_png(&img).unwrap();
        assert_eq!(&png[1..4], b"PNG");
    }

    #[test]
    fn miniatura_mantem_proporcao_e_media() {
        let img = Rgba { width: 1000, height: 500, pixels: vec![200; 1000 * 500 * 4] };
        let t = thumbnail(&img, 480);
        assert_eq!((t.width, t.height), (480, 240));
        assert!(t.pixels.iter().all(|&p| p == 200));
        let small = Rgba { width: 10, height: 5, pixels: vec![1; 200] };
        assert_eq!(thumbnail(&small, 480), small);
    }

    #[test]
    fn le_arquivo_png_pelo_wic() {
        let img = dib_to_rgba(&dib(32, true, false)).unwrap();
        let p = std::env::temp_dir().join(format!("kira-shot-{}.png", std::process::id()));
        std::fs::write(&p, encode_png(&img).unwrap()).unwrap();
        let back = decode_file(&p).unwrap();
        let _ = std::fs::remove_file(&p);
        assert_eq!(back, img);
        assert!(decode_file(std::path::Path::new("C:/nao/existe.png")).is_err());
    }
}
